const prisma = require('../utils/prisma')

//  HELPER: cek limit watchlist berdasarkan plan
const checkWatchlistLimit = async (userId) => {
  const sub = await prisma.userSubscription.findFirst({
    where:   { userId, status: 'active', endDate: { gt: new Date() } },
    include: { plan: true },
  })

  const plan     = sub?.plan || null
  const features = plan?.features || []
  const limitFeat = features.find(f => f.key === 'watchlist_limit')
  const limit    = limitFeat ? Number(limitFeat.value) : 1 // default free = 1

  if (limit === -1) return // unlimited

  const count = await prisma.watchlist.count({ where: { userId } })
  if (count >= limit) {
    throw {
      status:  403,
      message: `Batas watchlist untuk paket ${plan?.name || 'Free'} adalah ${limit}. Upgrade untuk tambah lebih banyak.`,
    }
  }
}

// HELPER: pastikan watchlist milik user 
const assertWatchlistOwner = async (watchlistId, userId) => {
  const wl = await prisma.watchlist.findUnique({ where: { id: watchlistId } })
  if (!wl)                  throw { status: 404, message: 'Watchlist tidak ditemukan.' }
  if (wl.userId !== userId) throw { status: 403, message: 'Akses ditolak. Bukan watchlist kamu.' }
  return wl
}


//  CREATE WATCHLIST
const createWatchlist = async (userId, name) => {
  await checkWatchlistLimit(userId)

  // Cek duplikat nama
  const existing = await prisma.watchlist.findFirst({
    where: { userId, name: { equals: name } },
  })
  if (existing) throw { status: 409, message: `Watchlist dengan nama "${name}" sudah ada.` }

  // Kalau ini watchlist pertama, set default = true
  const count     = await prisma.watchlist.count({ where: { userId } })
  const isDefault = count === 0

  const watchlist = await prisma.watchlist.create({
    data:    { userId, name, isDefault },
    include: { items: true, _count: { select: { items: true } } },
  })

  return watchlist
}

//  GET ALL WATCHLISTS USER
const getMyWatchlists = async (userId) => {
  const watchlists = await prisma.watchlist.findMany({
    where:   { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: {
      items:  { orderBy: { sortOrder: 'asc' } },
      _count: { select: { items: true } },
    },
  })
  return watchlists
}

//  GET WATCHLIST BY ID — dengan items lengkap
const getWatchlistById = async (watchlistId, userId) => {
  await assertWatchlistOwner(watchlistId, userId)

  const watchlist = await prisma.watchlist.findUnique({
    where:   { id: watchlistId },
    include: {
      items:  { orderBy: { sortOrder: 'asc' } },
      _count: { select: { items: true } },
    },
  })

  return watchlist
}

//  UPDATE WATCHLIST (rename)
const updateWatchlist = async (watchlistId, userId, name) => {
  await assertWatchlistOwner(watchlistId, userId)

  // Cek duplikat nama (selain watchlist ini sendiri)
  const duplicate = await prisma.watchlist.findFirst({
    where: { userId, name, id: { not: watchlistId } },
  })
  if (duplicate) throw { status: 409, message: `Nama "${name}" sudah dipakai watchlist lain.` }

  return prisma.watchlist.update({
    where:   { id: watchlistId },
    data:    { name },
    include: { _count: { select: { items: true } } },
  })
}

//  DELETE WATCHLIST
const deleteWatchlist = async (watchlistId, userId) => {
  const wl = await assertWatchlistOwner(watchlistId, userId)

  if (wl.isDefault) throw { status: 400, message: 'Watchlist default tidak bisa dihapus. Set watchlist lain sebagai default dulu.' }

  await prisma.watchlist.delete({ where: { id: watchlistId } })
  return { deleted: true, watchlistId }
}

//  SET DEFAULT WATCHLIST
const setDefaultWatchlist = async (watchlistId, userId) => {
  await assertWatchlistOwner(watchlistId, userId)

  // Reset semua watchlist user jadi non-default dulu
  // lalu set yang dipilih jadi default — dalam satu transaction
  await prisma.$transaction([
    prisma.watchlist.updateMany({
      where: { userId },
      data:  { isDefault: false },
    }),
    prisma.watchlist.update({
      where: { id: watchlistId },
      data:  { isDefault: true },
    }),
  ])

  return { watchlistId, isDefault: true }
}

//  ADD COIN KE WATCHLIST
const addItem = async (watchlistId, userId, data) => {
  await assertWatchlistOwner(watchlistId, userId)

  const { coinSymbol, coinName, alertPriceHigh, alertPriceLow } = data
  const symbol = coinSymbol.toUpperCase()

  // Cek coin sudah ada di watchlist ini
  const existing = await prisma.watchlistItem.findFirst({
    where: { watchlistId, coinSymbol: symbol },
  })
  if (existing) throw { status: 409, message: `${symbol} sudah ada di watchlist ini.` }

  // Validasi alert range
  if (alertPriceHigh && alertPriceLow && Number(alertPriceHigh) <= Number(alertPriceLow)) {
    throw { status: 400, message: 'Alert harga tinggi harus lebih besar dari harga rendah.' }
  }

  // Sort order = jumlah item saat ini (append ke akhir)
  const count = await prisma.watchlistItem.count({ where: { watchlistId } })

  const item = await prisma.watchlistItem.create({
    data: {
      watchlistId,
      coinSymbol:     symbol,
      coinName,
      alertPriceHigh: alertPriceHigh || null,
      alertPriceLow:  alertPriceLow  || null,
      sortOrder:      count,
    },
  })

  return item
}

//  UPDATE ITEM — update alert harga
const updateItem = async (itemId, userId, data) => {
  const item = await prisma.watchlistItem.findUnique({
    where:   { id: itemId },
    include: { watchlist: { select: { userId: true } } },
  })
  if (!item)                          throw { status: 404, message: 'Item tidak ditemukan.' }
  if (item.watchlist.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }

  const { alertPriceHigh, alertPriceLow, coinName } = data

  // Validasi alert range
  const newHigh = alertPriceHigh !== undefined ? alertPriceHigh : item.alertPriceHigh
  const newLow  = alertPriceLow  !== undefined ? alertPriceLow  : item.alertPriceLow
  if (newHigh && newLow && Number(newHigh) <= Number(newLow)) {
    throw { status: 400, message: 'Alert harga tinggi harus lebih besar dari harga rendah.' }
  }

  return prisma.watchlistItem.update({
    where: { id: itemId },
    data: {
      ...(alertPriceHigh !== undefined && { alertPriceHigh: alertPriceHigh || null }),
      ...(alertPriceLow  !== undefined && { alertPriceLow:  alertPriceLow  || null }),
      ...(coinName       !== undefined && { coinName }),
    },
  })
}

//  REMOVE ITEM DARI WATCHLIST
const removeItem = async (itemId, userId) => {
  const item = await prisma.watchlistItem.findUnique({
    where:   { id: itemId },
    include: { watchlist: { select: { userId: true, id: true } } },
  })
  if (!item)                          throw { status: 404, message: 'Item tidak ditemukan.' }
  if (item.watchlist.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }

  await prisma.watchlistItem.delete({ where: { id: itemId } })

  // Reorder sort_order setelah hapus
  const remaining = await prisma.watchlistItem.findMany({
    where:   { watchlistId: item.watchlist.id },
    orderBy: { sortOrder: 'asc' },
  })
  await prisma.$transaction(
    remaining.map((r, i) =>
      prisma.watchlistItem.update({ where: { id: r.id }, data: { sortOrder: i } })
    )
  )

  return { deleted: true, itemId }
}

//  REORDER ITEMS — drag & drop dari frontend
const reorderItems = async (watchlistId, userId, orderedIds) => {
  await assertWatchlistOwner(watchlistId, userId)

  // Validasi semua ID milik watchlist ini
  const items = await prisma.watchlistItem.findMany({
    where: { watchlistId },
    select: { id: true },
  })
  const validIds = new Set(items.map(i => i.id))
  const allValid = orderedIds.every(id => validIds.has(id))
  if (!allValid) throw { status: 400, message: 'ID item tidak valid.' }

  // Update sort order sesuai urutan baru
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.watchlistItem.update({ where: { id }, data: { sortOrder: index } })
    )
  )

  return { reordered: true }
}

//  MOVE ITEM KE WATCHLIST LAIN
const moveItem = async (itemId, targetWatchlistId, userId) => {
  const item = await prisma.watchlistItem.findUnique({
    where:   { id: itemId },
    include: { watchlist: { select: { userId: true } } },
  })
  if (!item)                          throw { status: 404, message: 'Item tidak ditemukan.' }
  if (item.watchlist.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }

  await assertWatchlistOwner(targetWatchlistId, userId)

  // Cek coin belum ada di watchlist target
  const duplicate = await prisma.watchlistItem.findFirst({
    where: { watchlistId: targetWatchlistId, coinSymbol: item.coinSymbol },
  })
  if (duplicate) {
    throw { status: 409, message: `${item.coinSymbol} sudah ada di watchlist tujuan.` }
  }

  const count = await prisma.watchlistItem.count({ where: { watchlistId: targetWatchlistId } })

  return prisma.watchlistItem.update({
    where: { id: itemId },
    data:  { watchlistId: targetWatchlistId, sortOrder: count },
  })
}

//  CHECK PRICE ALERTS — dipanggil saat dapat data harga terbaru
//  Frontend kirim { symbol, currentPrice } → backend cek alert
const checkPriceAlerts = async (userId, priceData) => {
  // priceData = [{ symbol: 'BTC', currentPrice: 65000 }, ...]
  const symbols = priceData.map(p => p.coinSymbol.toUpperCase())

  const items = await prisma.watchlistItem.findMany({
    where: {
      watchlist:  { userId },
      coinSymbol: { in: symbols },
      OR: [
        { alertPriceHigh: { not: null } },
        { alertPriceLow:  { not: null } },
      ],
    },
    include: { watchlist: { select: { name: true } } },
  })

  const triggered = []

  for (const item of items) {
    const priceInfo    = priceData.find(p => p.coinSymbol.toUpperCase() === item.coinSymbol)
    if (!priceInfo) continue

    const currentPrice = Number(priceInfo.currentPrice)
    const high         = item.alertPriceHigh ? Number(item.alertPriceHigh) : null
    const low          = item.alertPriceLow  ? Number(item.alertPriceLow)  : null

    // Alert HIGH: harga sekarang >= target high
    if (high && currentPrice >= high) {
      triggered.push({
        itemId:       item.id,
        coinSymbol:   item.coinSymbol,
        coinName:     item.coinName,
        alertType:    'high',
        alertPrice:   high,
        currentPrice,
        watchlistName: item.watchlist.name,
      })

      await prisma.notification.create({
        data: {
          userId,
          type:    'price_alert_high',
          title:   `🚀 ${item.coinSymbol} mencapai target harga!`,
          message: `${item.coinName} sekarang di $${currentPrice.toLocaleString()}, menyentuh target HIGH kamu $${high.toLocaleString()}.`,
          data:    { coinSymbol: item.coinSymbol, alertPrice: high, currentPrice, alertType: 'high' },
        },
      })
    }

    // Alert LOW: harga sekarang <= target low
    if (low && currentPrice <= low) {
      triggered.push({
        itemId:       item.id,
        coinSymbol:   item.coinSymbol,
        coinName:     item.coinName,
        alertType:    'low',
        alertPrice:   low,
        currentPrice,
        watchlistName: item.watchlist.name,
      })

      await prisma.notification.create({
        data: {
          userId,
          type:    'price_alert_low',
          title:   `📉 ${item.coinSymbol} menyentuh harga rendah!`,
          message: `${item.coinName} sekarang di $${currentPrice.toLocaleString()}, menyentuh target LOW kamu $${low.toLocaleString()}.`,
          data:    { coinSymbol: item.coinSymbol, alertPrice: low, currentPrice, alertType: 'low' },
        },
      })
    }
  }

  return { triggered, count: triggered.length }
}

//  SUMMARY WATCHLIST — semua coin user di semua watchlist
const getWatchlistSummary = async (userId) => {
  const watchlists = await prisma.watchlist.findMany({
    where:   { userId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })

  // Kumpulkan semua unique coin symbols
  const allSymbols = [...new Set(
    watchlists.flatMap(wl => wl.items.map(i => i.coinSymbol))
  )]

  // Cek berapa kali tiap coin muncul di journal trades user
  const tradeStats = await prisma.journalTrade.groupBy({
    by:    ['coinSymbol'],
    where: { journal: { userId }, coinSymbol: { in: allSymbols } },
    _count: { coinSymbol: true },
    _sum:   { pnlAmount: true },
  })

  const tradeMap = {}
  tradeStats.forEach(t => {
    tradeMap[t.coinSymbol] = {
      tradeCount: t._count.coinSymbol,
      totalPnl:   parseFloat((Number(t._sum.pnlAmount) || 0).toFixed(2)),
    }
  })

  // Enrich items dengan trade stats
  const enriched = watchlists.map(wl => ({
    ...wl,
    items: wl.items.map(item => ({
      ...item,
      tradeStats: tradeMap[item.coinSymbol] || { tradeCount: 0, totalPnl: 0 },
    })),
  }))

  return {
    watchlists: enriched,
    totalWatchlists: watchlists.length,
    totalCoins:      allSymbols.length,
    uniqueSymbols:   allSymbols,
  }
}

module.exports = {
  createWatchlist, getMyWatchlists, getWatchlistById,
  updateWatchlist, deleteWatchlist, setDefaultWatchlist,
  addItem, updateItem, removeItem, reorderItems, moveItem,
  checkPriceAlerts, getWatchlistSummary,
}
