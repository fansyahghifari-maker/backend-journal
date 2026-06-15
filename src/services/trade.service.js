const prisma = require('../utils/prisma')

//  HELPER: Kalkulasi PnL otomatis
//  Long  → profit kalau harga naik  (exit - entry) * qty
//  Short → profit kalau harga turun (entry - exit) * qty
const calculatePnL = (tradeType, entryPrice, exitPrice, quantity) => {
  if (!exitPrice) return { pnlAmount: null, pnlPercent: null }

  const entry = Number(entryPrice)
  const exit  = Number(exitPrice)
  const qty   = Number(quantity)
  const cost  = entry * qty  // modal awal

  const pnlAmount  = tradeType === 'long'
    ? (exit - entry) * qty
    : (entry - exit) * qty

  const pnlPercent = cost > 0 ? (pnlAmount / cost) * 100 : 0

  return {
    pnlAmount:  parseFloat(pnlAmount.toFixed(8)),
    pnlPercent: parseFloat(pnlPercent.toFixed(4)),
  }
}


//  HELPER: Pastikan journal milik user
const assertJournalOwner = async (journalId, userId) => {
  const journal = await prisma.journal.findUnique({
    where:  { id: journalId },
    select: { userId: true },
  })
  if (!journal)                  throw { status: 404, message: 'Jurnal tidak ditemukan.' }
  if (journal.userId !== userId) throw { status: 403, message: 'Akses ditolak. Bukan jurnal kamu.' }
  return journal
}

//  ADD TRADE
const addTrade = async (journalId, userId, data) => {
  await assertJournalOwner(journalId, userId)

  const {
    coinSymbol, coinName, tradeType,
    entryPrice, exitPrice, quantity,
    exchange, tradeDate,
  } = data

  const { pnlAmount, pnlPercent } = calculatePnL(tradeType, entryPrice, exitPrice, quantity)

  const trade = await prisma.journalTrade.create({
    data: {
      journalId,
      coinSymbol:  coinSymbol.toUpperCase(),
      coinName,
      tradeType,
      entryPrice,
      exitPrice:   exitPrice   || null,
      quantity,
      pnlAmount,
      pnlPercent,
      status:      exitPrice ? 'closed' : 'open',
      exchange:    exchange   || null,
      tradeDate:   new Date(tradeDate),
    },
  })

  return trade
}


//  GET TRADES BY JOURNAL — dengan summary PnL
const getTradesByJournal = async (journalId, userId) => {
  await assertJournalOwner(journalId, userId)

  const trades = await prisma.journalTrade.findMany({
    where:   { journalId },
    orderBy: { tradeDate: 'desc' },
  })

  const closed = trades.filter(t => t.status === 'closed' && t.pnlAmount !== null)
  const wins   = closed.filter(t => Number(t.pnlAmount) > 0)

  const summary = {
    totalTrades:  trades.length,
    openTrades:   trades.filter(t => t.status === 'open').length,
    closedTrades: closed.length,
    winCount:     wins.length,
    lossCount:    closed.length - wins.length,
    winRate:      closed.length > 0 ? parseFloat(((wins.length / closed.length) * 100).toFixed(2)) : 0,
    totalPnl:     parseFloat(closed.reduce((s, t) => s + Number(t.pnlAmount), 0).toFixed(8)),
  }

  return { trades, summary }
}

//  GET ALL TRADES USER — dengan filter & pagination
const getAllMyTrades = async (userId, query) => {
  const {
    page = 1, limit = 20,
    status, tradeType, coinSymbol,
    sortBy = 'trade_date', order = 'desc',
    dateFrom, dateTo,
  } = query

  const skip  = (Number(page) - 1) * Number(limit)
  const where = { journal: { userId } }

  if (status)     where.status     = status
  if (tradeType)  where.tradeType  = tradeType
  if (coinSymbol) where.coinSymbol = coinSymbol.toUpperCase()
  if (dateFrom || dateTo) {
    where.tradeDate = {}
    if (dateFrom) where.tradeDate.gte = new Date(dateFrom)
    if (dateTo)   where.tradeDate.lte = new Date(dateTo)
  }

  const orderByMap = {
    trade_date:  { tradeDate:  order },
    pnl_amount:  { pnlAmount:  order },
    pnl_percent: { pnlPercent: order },
    entry_price: { entryPrice: order },
    coin_symbol: { coinSymbol: order },
  }

  const [trades, total] = await Promise.all([
    prisma.journalTrade.findMany({
      where,
      skip,
      take:    Number(limit),
      orderBy: orderByMap[sortBy] || { tradeDate: 'desc' },
      include: {
        journal: { select: { id: true, title: true } },
      },
    }),
    prisma.journalTrade.count({ where }),
  ])

  return {
    trades,
    meta: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  }
}

//  UPDATE TRADE (close / edit)
const updateTrade = async (tradeId, userId, data) => {
  const trade = await prisma.journalTrade.findUnique({
    where:   { id: tradeId },
    include: { journal: { select: { userId: true } } },
  })
  if (!trade)                         throw { status: 404, message: 'Trade tidak ditemukan.' }
  if (trade.journal.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }
  if (trade.status === 'cancelled')   throw { status: 400, message: 'Trade yang dibatalkan tidak bisa diedit.' }

  const { exitPrice, quantity, exchange, tradeDate, status } = data

  // Recalculate PnL dengan nilai terbaru
  const newExit = exitPrice !== undefined ? exitPrice : trade.exitPrice
  const newQty  = quantity  !== undefined ? quantity  : trade.quantity
  const { pnlAmount, pnlPercent } = calculatePnL(trade.tradeType, trade.entryPrice, newExit, newQty)

  const updated = await prisma.journalTrade.update({
    where: { id: tradeId },
    data: {
      ...(exitPrice  !== undefined && { exitPrice }),
      ...(quantity   !== undefined && { quantity }),
      ...(exchange   !== undefined && { exchange }),
      ...(tradeDate  !== undefined && { tradeDate: new Date(tradeDate) }),
      ...(status     !== undefined && { status }),
      pnlAmount,
      pnlPercent,
      // Auto set status closed kalau ada exit price
      ...(exitPrice !== undefined && exitPrice !== null && { status: 'closed' }),
    },
  })

  return updated
}


//  DELETE TRADE
const deleteTrade = async (tradeId, userId) => {
  const trade = await prisma.journalTrade.findUnique({
    where:   { id: tradeId },
    include: { journal: { select: { userId: true } } },
  })
  if (!trade)                         throw { status: 404, message: 'Trade tidak ditemukan.' }
  if (trade.journal.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }

  await prisma.journalTrade.delete({ where: { id: tradeId } })
  return { deleted: true, tradeId }
}

//  STATISTIK GLOBAL — overview lengkap semua trade user
const getTradeStats = async (userId) => {
  const trades = await prisma.journalTrade.findMany({
    where:   { journal: { userId } },
    orderBy: { tradeDate: 'asc' },
  })

  const closed = trades.filter(t => t.status === 'closed' && t.pnlAmount !== null)
  const wins   = closed.filter(t => Number(t.pnlAmount) > 0)
  const losses = closed.filter(t => Number(t.pnlAmount) <= 0)

  const totalPnl   = closed.reduce((s, t) => s + Number(t.pnlAmount), 0)
  const avgPnl     = closed.length > 0 ? totalPnl / closed.length : 0
  const avgWin     = wins.length   > 0 ? wins.reduce((s,t) => s + Number(t.pnlAmount), 0) / wins.length : 0
  const avgLoss    = losses.length > 0 ? losses.reduce((s,t) => s + Number(t.pnlAmount), 0) / losses.length : 0
  const riskReward = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0

  // Best & worst trade
  const bestTrade  = closed.reduce((b, t) => !b || Number(t.pnlAmount) > Number(b.pnlAmount) ? t : b, null)
  const worstTrade = closed.reduce((w, t) => !w || Number(t.pnlAmount) < Number(w.pnlAmount) ? t : w, null)

  // Longest win streak & loss streak
  let maxWinStreak = 0, maxLossStreak = 0
  let curWin = 0, curLoss = 0
  closed.forEach(t => {
    if (Number(t.pnlAmount) > 0) {
      curWin++; curLoss = 0
      maxWinStreak = Math.max(maxWinStreak, curWin)
    } else {
      curLoss++; curWin = 0
      maxLossStreak = Math.max(maxLossStreak, curLoss)
    }
  })

  return {
    overview: {
      totalTrades:   trades.length,
      openTrades:    trades.filter(t => t.status === 'open').length,
      closedTrades:  closed.length,
      winCount:      wins.length,
      lossCount:     losses.length,
      winRate:       closed.length > 0 ? parseFloat(((wins.length / closed.length) * 100).toFixed(2)) : 0,
      totalPnl:      parseFloat(totalPnl.toFixed(2)),
      avgPnl:        parseFloat(avgPnl.toFixed(2)),
      avgWin:        parseFloat(avgWin.toFixed(2)),
      avgLoss:       parseFloat(avgLoss.toFixed(2)),
      riskRewardRatio: parseFloat(riskReward.toFixed(2)),
      maxWinStreak,
      maxLossStreak,
    },
    bestTrade,
    worstTrade,
  }
}

//  MONTHLY PnL — data untuk chart bulanan
const getMonthlyPnL = async (userId, year) => {
  const targetYear = year ? Number(year) : new Date().getFullYear()

  const trades = await prisma.journalTrade.findMany({
    where: {
      journal:  { userId },
      status:   'closed',
      tradeDate: {
        gte: new Date(`${targetYear}-01-01`),
        lte: new Date(`${targetYear}-12-31`),
      },
    },
    select: { tradeDate: true, pnlAmount: true, pnlPercent: true },
    orderBy: { tradeDate: 'asc' },
  })

  // Group by bulan
  const months = Array.from({ length: 12 }, (_, i) => ({
    month:      i + 1,
    monthName:  new Date(targetYear, i, 1).toLocaleString('id-ID', { month: 'long' }),
    pnl:        0,
    tradeCount: 0,
    winCount:   0,
  }))

  trades.forEach(t => {
    const monthIdx = new Date(t.tradeDate).getMonth()
    months[monthIdx].pnl        += Number(t.pnlAmount)
    months[monthIdx].tradeCount++
    if (Number(t.pnlAmount) > 0) months[monthIdx].winCount++
  })

  // Bulatkan & tambah cumulative PnL
  let cumulative = 0
  months.forEach(m => {
    m.pnl        = parseFloat(m.pnl.toFixed(2))
    cumulative  += m.pnl
    m.cumulative = parseFloat(cumulative.toFixed(2))
    m.winRate    = m.tradeCount > 0 ? parseFloat(((m.winCount / m.tradeCount) * 100).toFixed(1)) : 0
  })

  return { year: targetYear, months, totalYearlyPnl: parseFloat(cumulative.toFixed(2)) }
}

//  PERFORMANCE PER COIN
const getCoinPerformance = async (userId) => {
  const trades = await prisma.journalTrade.findMany({
    where: {
      journal: { userId },
      status:  'closed',
      pnlAmount: { not: null },
    },
    select: {
      coinSymbol: true, coinName: true,
      pnlAmount: true, pnlPercent: true, tradeType: true,
    },
  })

  // Group by coin
  const coinMap = {}
  trades.forEach(t => {
    const sym = t.coinSymbol
    if (!coinMap[sym]) {
      coinMap[sym] = {
        symbol:     sym,
        name:       t.coinName,
        totalPnl:   0,
        tradeCount: 0,
        winCount:   0,
        longCount:  0,
        shortCount: 0,
      }
    }
    coinMap[sym].totalPnl   += Number(t.pnlAmount)
    coinMap[sym].tradeCount++
    if (Number(t.pnlAmount) > 0) coinMap[sym].winCount++
    if (t.tradeType === 'long')  coinMap[sym].longCount++
    else                          coinMap[sym].shortCount++
  })

  const coins = Object.values(coinMap).map(c => ({
    ...c,
    totalPnl: parseFloat(c.totalPnl.toFixed(2)),
    winRate:  c.tradeCount > 0 ? parseFloat(((c.winCount / c.tradeCount) * 100).toFixed(1)) : 0,
  }))

  return {
    byPnl:       [...coins].sort((a, b) => b.totalPnl - a.totalPnl),
    byWinRate:   [...coins].sort((a, b) => b.winRate  - a.winRate),
    byFrequency: [...coins].sort((a, b) => b.tradeCount - a.tradeCount),
  }
}

//  DAILY PnL — data untuk heatmap kalender
const getDailyPnL = async (userId, year, month) => {
  const y = year  ? Number(year)  : new Date().getFullYear()
  const m = month ? Number(month) : new Date().getMonth() + 1

  const startDate = new Date(y, m - 1, 1)
  const endDate   = new Date(y, m, 0, 23, 59, 59)

  const trades = await prisma.journalTrade.findMany({
    where: {
      journal:   { userId },
      status:    'closed',
      tradeDate: { gte: startDate, lte: endDate },
    },
    select: { tradeDate: true, pnlAmount: true },
    orderBy: { tradeDate: 'asc' },
  })

  // Group by tanggal
  const dayMap = {}
  trades.forEach(t => {
    const date = new Date(t.tradeDate).toISOString().split('T')[0]
    if (!dayMap[date]) dayMap[date] = { date, pnl: 0, tradeCount: 0, winCount: 0 }
    dayMap[date].pnl        += Number(t.pnlAmount)
    dayMap[date].tradeCount++
    if (Number(t.pnlAmount) > 0) dayMap[date].winCount++
  })

  const days = Object.values(dayMap).map(d => ({
    ...d,
    pnl:    parseFloat(d.pnl.toFixed(2)),
    result: d.pnl > 0 ? 'profit' : d.pnl < 0 ? 'loss' : 'breakeven',
  }))

  return { year: y, month: m, days }
}

//  OPEN TRADES — semua trade yang masih open
const getOpenTrades = async (userId) => {
  const trades = await prisma.journalTrade.findMany({
    where:   { journal: { userId }, status: 'open' },
    orderBy: { tradeDate: 'desc' },
    include: { journal: { select: { id: true, title: true } } },
  })

  return trades
}

module.exports = {
  addTrade,
  getTradesByJournal,
  getAllMyTrades,
  updateTrade,
  deleteTrade,
  getTradeStats,
  getMonthlyPnL,
  getCoinPerformance,
  getDailyPnL,
  getOpenTrades,
}
