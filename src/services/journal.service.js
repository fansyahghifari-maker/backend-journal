const prisma = require('../utils/prisma')

// HELPER: cek limit journal untuk user free
const checkJournalLimit = async (userId) => {
  // Cek apakah user punya subscription aktif
  const subscription = await prisma.userSubscription.findFirst({
    where: { userId, status: 'active', endDate: { gt: new Date() } },
    include: { plan: true },
  })

  // Kalau tidak ada subscription aktif = user free
  const isFreePlan = !subscription

  if (isFreePlan) {
    const count = await prisma.journal.count({ where: { userId } })
    if (count >= 5) {
      throw {
        status: 403,
        message: 'Batas jurnal untuk paket Free adalah 5. Upgrade ke Pro untuk jurnal unlimited.',
      }
    }
  }

  return { isFreePlan, plan: subscription?.plan || null }
}

// HELPER: cek visibility sesuai plan
const checkVisibilityAccess = (visibility, plan) => {
  // Free user hanya bisa private
  if (!plan && visibility !== 'private') {
    throw {
      status: 403,
      message: 'Paket Free hanya bisa membuat jurnal Private. Upgrade untuk akses Public & Members Only.',
    }
  }

  // Pro user tidak bisa members_only
  if (plan?.slug === 'pro' && visibility === 'members_only') {
    throw {
      status: 403,
      message: 'Visibilitas Members Only hanya tersedia di paket Elite.',
    }
  }
}

//  CREATE JOURNAL
const createJournal = async (userId, data) => {
  const { title, content, visibility = 'private', tags = [], isPinned = false } = data

  // Cek limit & plan
  const { plan } = await checkJournalLimit(userId)

  // Cek visibility sesuai plan
  checkVisibilityAccess(visibility, plan)

  const journal = await prisma.journal.create({
    data: {
      userId,
      title,
      content,
      visibility,
      isPinned,
      tags,
      publishedAt: visibility !== 'private' ? new Date() : null,
    },
    include: {
      user: { select: { id: true, username: true, avatarUrl: true } },
      trades: true,
      _count: { select: { likes: true, comments: true } },
    },
  })

  return journal
}

//  GET ALL JOURNALS (milik user sendiri)
const getMyJournals = async (userId, query) => {
  const {
    page = 1,
    limit = 10,
    visibility,
    search,
    tag,
    sortBy = 'created_at',
    order = 'desc',
    isPinned,
  } = query

  const skip = (Number(page) - 1) * Number(limit)

  // Build filter dinamis
  const where = { userId }

  if (visibility) where.visibility = visibility
  if (isPinned !== undefined) where.isPinned = isPinned === 'true'
  if (tag) where.tags = { path: '$', array_contains: tag }

  // Full text search di title dan content
  if (search) {
    where.OR = [
      { title:   { contains: search } },
      { content: { contains: search } },
    ]
  }

  // Map sortBy ke field Prisma
  const orderByMap = {
    created_at: { createdAt: order },
    updated_at: { updatedAt: order },
    title:      { title: order },
    view_count: { viewCount: order },
  }
  const orderBy = orderByMap[sortBy] || { createdAt: 'desc' }

  const [journals, total] = await Promise.all([
    prisma.journal.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: [
        { isPinned: 'desc' }, // pinned selalu di atas
        orderBy,
      ],
      include: {
        user:   { select: { id: true, username: true, avatarUrl: true } },
        trades: { select: { id: true, symbol: true, tradeType: true, pnlAmount: true, pnlPercent: true, status: true } },
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.journal.count({ where }),
  ])

  return {
    journals,
    meta: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  }
}

//  GET PUBLIC FEED (jurnal public + members_only untuk member)
const getPublicFeed = async (viewerUserId, query) => {
  const { page = 1, limit = 10, search, tag, coinSymbol } = query
  const skip = (Number(page) - 1) * Number(limit)

  // Cek apakah viewer adalah member aktif
  let isMember = false
  if (viewerUserId) {
    const sub = await prisma.userSubscription.findFirst({
      where: { userId: viewerUserId, status: 'active', endDate: { gt: new Date() } },
    })
    isMember = !!sub
  }

  // Tentukan visibility yang bisa dilihat
  const visibilityFilter = isMember
    ? { in: ['public', 'members_only'] }
    : { equals: 'public' }

  const where = { visibility: visibilityFilter }
  if (search) {
    where.OR = [
      { title:   { contains: search } },
      { content: { contains: search } },
    ]
  }
  if (tag) where.tags = { path: '$', array_contains: tag }
  if (coinSymbol) {
  where.trades = { some: { symbol: { equals: coinSymbol.toUpperCase() } } }
}

  const [journals, total] = await Promise.all([
    prisma.journal.findMany({
      where,
      skip,
      take: Number(limit),
      orderBy: { publishedAt: 'desc' },
      include: {
        user:   { select: { id: true, username: true, avatarUrl: true } },
        trades: { select: { id: true, symbol: true, tradeType: true, pnlPercent: true, status: true } },
        _count: { select: { likes: true, comments: true } },
      },
    }),
    prisma.journal.count({ where }),
  ])

  return {
    journals,
    meta: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      isMember,
    },
  }
}

//  GET JOURNAL BY ID
const getJournalById = async (journalId, viewerUserId) => {
  const journal = await prisma.journal.findUnique({
    where: { id: journalId },
    include: {
      user:    { select: { id: true, username: true, avatarUrl: true } },
      trades:  true,
      _count:  { select: { likes: true, comments: true } },
    },
  })

  if (!journal) throw { status: 404, message: 'Jurnal tidak ditemukan.' }

  const isOwner = journal.userId === viewerUserId

  // Kalau bukan owner, cek akses visibility
  if (!isOwner) {
    if (journal.visibility === 'private') {
      throw { status: 403, message: 'Jurnal ini bersifat private.' }
    }

    if (journal.visibility === 'members_only') {
      if (!viewerUserId) throw { status: 401, message: 'Login diperlukan untuk melihat jurnal ini.' }

      const sub = await prisma.userSubscription.findFirst({
        where: { userId: viewerUserId, status: 'active', endDate: { gt: new Date() } },
      })
      if (!sub) throw { status: 403, message: 'Jurnal ini hanya untuk member aktif.' }
    }

    // Tambah view count kalau bukan owner
    await prisma.journal.update({
      where: { id: journalId },
      data:  { viewCount: { increment: 1 } },
    })
  }

  // Cek apakah viewer sudah like jurnal ini
  let isLiked = false
  if (viewerUserId) {
    const like = await prisma.journalLike.findUnique({
      where: { journalId_userId: { journalId, userId: viewerUserId } },
    })
    isLiked = !!like
  }

  return { ...journal, isLiked, isOwner }
}

//  UPDATE JOURNAL
const updateJournal = async (journalId, userId, data) => {
  // Pastikan journal milik user ini
  const journal = await prisma.journal.findUnique({ where: { id: journalId } })
  if (!journal)              throw { status: 404, message: 'Jurnal tidak ditemukan.' }
  if (journal.userId !== userId) throw { status: 403, message: 'Akses ditolak. Bukan jurnal kamu.' }

  const { title, content, visibility, tags, isPinned } = data

  // Kalau visibility diubah, cek akses plan
  if (visibility && visibility !== journal.visibility) {
    const sub = await prisma.userSubscription.findFirst({
      where: { userId, status: 'active', endDate: { gt: new Date() } },
      include: { plan: true },
    })
    checkVisibilityAccess(visibility, sub?.plan || null)
  }

  const updated = await prisma.journal.update({
    where: { id: journalId },
    data: {
      ...(title      !== undefined && { title }),
      ...(content    !== undefined && { content }),
      ...(visibility !== undefined && { visibility }),
      ...(tags       !== undefined && { tags }),
      ...(isPinned   !== undefined && { isPinned }),
      // Update publishedAt kalau visibility berubah dari private ke public
      ...(visibility && visibility !== 'private' && !journal.publishedAt && { publishedAt: new Date() }),
    },
    include: {
      user:   { select: { id: true, username: true, avatarUrl: true } },
      trades: true,
      _count: { select: { likes: true, comments: true } },
    },
  })

  return updated
}

//  DELETE JOURNAL
const deleteJournal = async (journalId, userId) => {
  const journal = await prisma.journal.findUnique({ where: { id: journalId } })
  if (!journal)                  throw { status: 404, message: 'Jurnal tidak ditemukan.' }
  if (journal.userId !== userId) throw { status: 403, message: 'Akses ditolak. Bukan jurnal kamu.' }

  // Cascade delete otomatis hapus trades, comments, likes juga (sudah diset di schema)
  await prisma.journal.delete({ where: { id: journalId } })
  return { deleted: true, journalId }
}

//  PIN / UNPIN JOURNAL
const togglePin = async (journalId, userId) => {
  const journal = await prisma.journal.findUnique({ where: { id: journalId } })
  if (!journal)                  throw { status: 404, message: 'Jurnal tidak ditemukan.' }
  if (journal.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }

  const updated = await prisma.journal.update({
    where: { id: journalId },
    data:  { isPinned: !journal.isPinned },
    select: { id: true, isPinned: true },
  })

  return updated
}

//  LIKE / UNLIKE JOURNAL
const toggleLike = async (journalId, userId) => {
  const journal = await prisma.journal.findUnique({ where: { id: journalId } })
  if (!journal) throw { status: 404, message: 'Jurnal tidak ditemukan.' }
  if (journal.userId === userId) throw { status: 400, message: 'Tidak bisa like jurnal sendiri.' }

  // Cek apakah sudah like
  const existing = await prisma.journalLike.findUnique({
    where: { journalId_userId: { journalId, userId } },
  })

  if (existing) {
    // Unlike
    await prisma.journalLike.delete({ where: { journalId_userId: { journalId, userId } } })
    const count = await prisma.journalLike.count({ where: { journalId } })
    return { liked: false, likeCount: count }
  } else {
    // Like + kirim notifikasi ke pemilik jurnal
    await prisma.$transaction([
      prisma.journalLike.create({ data: { journalId, userId } }),
      prisma.notification.create({
        data: {
          userId:  journal.userId,
          type:    'journal_liked',
          title:   'Jurnal kamu disukai! ❤️',
          message: `Seseorang menyukai jurnal "${journal.title}".`,
          data:    { journalId, journalTitle: journal.title },
        },
      }),
    ])
    const count = await prisma.journalLike.count({ where: { journalId } })
    return { liked: true, likeCount: count }
  }
}


//  GET COMMENTS
const getComments = async (journalId, query) => {
  const { page = 1, limit = 20 } = query
  const skip = (Number(page) - 1) * Number(limit)

  const journal = await prisma.journal.findUnique({ where: { id: journalId } })
  if (!journal) throw { status: 404, message: 'Jurnal tidak ditemukan.' }

  const [comments, total] = await Promise.all([
    prisma.journalComment.findMany({
      where:   { journalId, parentId: null }, // hanya top-level comment
      skip,
      take:    Number(limit),
      orderBy: { createdAt: 'asc' },
      include: {
        user:    { select: { id: true, username: true, avatarUrl: true } },
        replies: {
          include: { user: { select: { id: true, username: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.journalComment.count({ where: { journalId, parentId: null } }),
  ])

  return { comments, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } }
}

//  ADD COMMENT
const addComment = async (journalId, userId, content, parentId = null) => {
  const journal = await prisma.journal.findUnique({ where: { id: journalId } })
  if (!journal) throw { status: 404, message: 'Jurnal tidak ditemukan.' }

  // Validasi parentId kalau ada (reply)
  if (parentId) {
    const parent = await prisma.journalComment.findUnique({ where: { id: parentId } })
    if (!parent || parent.journalId !== journalId) {
      throw { status: 400, message: 'Parent comment tidak valid.' }
    }
  }

  const [comment] = await prisma.$transaction([
    prisma.journalComment.create({
      data: { journalId, userId, content, parentId },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    }),
    // Notifikasi ke pemilik jurnal (kalau bukan komentar sendiri)
    ...(journal.userId !== userId ? [prisma.notification.create({
      data: {
        userId:  journal.userId,
        type:    'journal_commented',
        title:   'Komentar baru di jurnal kamu 💬',
        message: `Seseorang berkomentar di "${journal.title}".`,
        data:    { journalId, journalTitle: journal.title },
      },
    })] : []),
  ])

  return comment
}

//  DELETE COMMENT
const deleteComment = async (commentId, userId) => {
  const comment = await prisma.journalComment.findUnique({
    where: { id: commentId },
    include: { journal: { select: { userId: true } } },
  })
  if (!comment) throw { status: 404, message: 'Komentar tidak ditemukan.' }

  // Boleh hapus kalau: pemilik komentar ATAU pemilik jurnal
  const canDelete = comment.userId === userId || comment.journal.userId === userId
  if (!canDelete) throw { status: 403, message: 'Akses ditolak.' }

  await prisma.journalComment.delete({ where: { id: commentId } })
  return { deleted: true }
}

module.exports = {
  createJournal, getMyJournals, getPublicFeed, getJournalById,
  updateJournal, deleteJournal, togglePin, toggleLike,
  getComments, addComment, deleteComment,
}

//  JOURNAL CALENDAR — data jurnal digroup per tanggal
//  Return: tiap hari dalam bulan + jurnal yang ada di hari itu
const getJournalCalendar = async (userId, query) => {
  const now   = new Date()
  const year  = query.year  ? Number(query.year)  : now.getFullYear()
  const month = query.month ? Number(query.month) : now.getMonth() + 1

  if (month < 1 || month > 12) throw { status: 400, message: 'Bulan harus antara 1-12.' }

  const startDate = new Date(year, month - 1, 1)
  const endDate   = new Date(year, month, 0, 23, 59, 59) // last day of month

  // Ambil semua jurnal bulan ini milik user
  const journals = await prisma.journal.findMany({
    where: {
      userId,
      createdAt: { gte: startDate, lte: endDate },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, title: true, visibility: true,
      isPinned: true, tags: true, createdAt: true,
      instrumentType: true,
      trades:  { select: { id: true, symbol: true, tradeType: true, pnlAmount: true, status: true } },
      _count:  { select: { likes: true, comments: true } },
    },
  })

  // Ambil data trade per hari (untuk PnL harian)
  const trades = await prisma.journalTrade.findMany({
    where: {
      journal: { userId },
      status:  'closed',
      tradeDate: { gte: startDate, lte: endDate },
    },
    select: { tradeDate: true, pnlAmount: true, symbol: true },
  })

  // ── Build kalender: setiap hari dalam bulan ──
  const daysInMonth = new Date(year, month, 0).getDate()
  const calendar    = []

  for (let day = 1; day <= daysInMonth; day++) {
    const date      = new Date(year, month - 1, day)
    const dateStr   = date.toISOString().split('T')[0] // YYYY-MM-DD
    const dayOfWeek = date.getDay() // 0=Minggu, 6=Sabtu

    // Jurnal yang dibuat di hari ini
    const dayJournals = journals.filter(j => {
      const jDate = new Date(j.createdAt).toISOString().split('T')[0]
      return jDate === dateStr
    })

    // Trade yang closed di hari ini
    const dayTrades = trades.filter(t => {
      const tDate = new Date(t.tradeDate).toISOString().split('T')[0]
      return tDate === dateStr
    })

    // Hitung PnL hari ini
    const dayPnl = dayTrades.reduce((sum, t) => sum + Number(t.pnlAmount || 0), 0)
    const dayWins = dayTrades.filter(t => Number(t.pnlAmount) > 0).length

    calendar.push({
      date:        dateStr,
      day,
      dayOfWeek,
      isToday:     dateStr === now.toISOString().split('T')[0],
      isWeekend:   dayOfWeek === 0 || dayOfWeek === 6,

      // Summary aktivitas hari ini
      activity: {
        journalCount: dayJournals.length,
        tradeCount:   dayTrades.length,
        winCount:     dayWins,
        lossCount:    dayTrades.length - dayWins,
        pnl:          parseFloat(dayPnl.toFixed(2)),
        hasActivity:  dayJournals.length > 0 || dayTrades.length > 0,
        result:       dayTrades.length > 0
          ? dayPnl > 0 ? 'profit' : dayPnl < 0 ? 'loss' : 'breakeven'
          : 'none',
      },

      // Detail jurnal di hari ini
      journals: dayJournals.map(j => ({
        id:             j.id,
        title:          j.title,
        visibility:     j.visibility,
        isPinned:       j.isPinned,
        tags:           j.tags,
        instrumentType: j.instrumentType,
        tradeCount:     j.trades.length,
        likeCount:      j._count.likes,
        commentCount:   j._count.comments,
        pnlSummary:     j.trades.length > 0 ? {
          total:    parseFloat(j.trades.reduce((s, t) => s + Number(t.pnlAmount || 0), 0).toFixed(2)),
          symbols:  [...new Set(j.trades.map(t => t.symbol))],
        } : null,
        createdAt: j.createdAt,
      })),
    })
  }

  // ── Summary bulan ini ──
  const activeDays   = calendar.filter(d => d.activity.hasActivity)
  const profitDays   = calendar.filter(d => d.activity.result === 'profit')
  const lossDays     = calendar.filter(d => d.activity.result === 'loss')
  const totalPnl     = calendar.reduce((s, d) => s + d.activity.pnl, 0)
  const totalJournals = journals.length

  // Streak aktif saat ini (hari berturut-turut dari hari ini mundur)
  const todayIdx  = calendar.findIndex(d => d.isToday)
  let   streak    = 0
  if (todayIdx >= 0) {
    for (let i = todayIdx; i >= 0; i--) {
      if (calendar[i].activity.hasActivity) streak++
      else break
    }
  }

  return {
    year, month,
    monthName:    startDate.toLocaleString('id-ID', { month: 'long' }),
    daysInMonth,
    firstDayOfWeek: new Date(year, month - 1, 1).getDay(), // untuk padding awal kalender di frontend

    summary: {
      totalJournals,
      totalTrades:  trades.length,
      activeDays:   activeDays.length,
      profitDays:   profitDays.length,
      lossDays:     lossDays.length,
      totalPnl:     parseFloat(totalPnl.toFixed(2)),
      currentStreak: streak,
      winRate:       trades.length > 0
        ? parseFloat(((trades.filter(t => Number(t.pnlAmount) > 0).length / trades.length) * 100).toFixed(1))
        : 0,
    },

    // Data untuk navigasi bulan sebelum/sesudah
    navigation: {
      prev: { year: month === 1 ? year - 1 : year, month: month === 1 ? 12 : month - 1 },
      next: { year: month === 12 ? year + 1 : year, month: month === 12 ? 1 : month + 1 },
    },

    calendar,
  }
}

//  GET JOURNAL BY DATE — ambil semua jurnal di tanggal tertentu
const getJournalsByDate = async (userId, date) => {
  const targetDate = new Date(date)
  if (isNaN(targetDate)) throw { status: 400, message: 'Format tanggal tidak valid. Gunakan YYYY-MM-DD.' }

  const startOfDay = new Date(targetDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(targetDate)
  endOfDay.setHours(23, 59, 59, 999)

  const journals = await prisma.journal.findMany({
    where: {
      userId,
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'asc' }],
    include: {
      user:    { select: { id: true, username: true, avatarUrl: true } },
      trades:  true,
      _count:  { select: { likes: true, comments: true } },
    },
  })

  // PnL summary untuk tanggal ini
  const trades  = journals.flatMap(j => j.trades)
  const closed  = trades.filter(t => t.status === 'closed' && t.pnlAmount !== null)
  const wins    = closed.filter(t => Number(t.pnlAmount) > 0)
  const totalPnl = closed.reduce((s, t) => s + Number(t.pnlAmount), 0)

  return {
    date,
    dateFormatted: targetDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    journals,
    summary: {
      journalCount:  journals.length,
      tradeCount:    trades.length,
      closedTrades:  closed.length,
      winCount:      wins.length,
      lossCount:     closed.length - wins.length,
      totalPnl:      parseFloat(totalPnl.toFixed(2)),
      result:        closed.length > 0 ? totalPnl > 0 ? 'profit' : totalPnl < 0 ? 'loss' : 'breakeven' : 'none',
    },
  }
}

//  CALENDAR YEAR VIEW — overview 12 bulan sekaligus
const getYearCalendar = async (userId, year) => {
  const targetYear = year ? Number(year) : new Date().getFullYear()
  const startYear  = new Date(targetYear, 0, 1)
  const endYear    = new Date(targetYear, 11, 31, 23, 59, 59)

  const [journals, trades] = await Promise.all([
    prisma.journal.findMany({
      where:  { userId, createdAt: { gte: startYear, lte: endYear } },
      select: { id: true, createdAt: true },
    }),
    prisma.journalTrade.findMany({
      where:  { journal: { userId }, status: 'closed', tradeDate: { gte: startYear, lte: endYear } },
      select: { tradeDate: true, pnlAmount: true },
    }),
  ])

  // Group by bulan
  const months = Array.from({ length: 12 }, (_, i) => {
    const m         = i + 1
    const monthDate = new Date(targetYear, i, 1)

    const mJournals = journals.filter(j => new Date(j.createdAt).getMonth() === i)
    const mTrades   = trades.filter(t => new Date(t.tradeDate).getMonth() === i)
    const mPnl      = mTrades.reduce((s, t) => s + Number(t.pnlAmount || 0), 0)
    const mWins     = mTrades.filter(t => Number(t.pnlAmount) > 0)

    // Active days dalam bulan ini
    const activeDates = new Set([
      ...mJournals.map(j => new Date(j.createdAt).toISOString().split('T')[0]),
      ...mTrades.map(t => new Date(t.tradeDate).toISOString().split('T')[0]),
    ])

    return {
      month:      m,
      monthName:  monthDate.toLocaleString('id-ID', { month: 'long' }),
      monthShort: monthDate.toLocaleString('id-ID', { month: 'short' }),
      journalCount:  mJournals.length,
      tradeCount:    mTrades.length,
      activeDays:    activeDates.size,
      pnl:           parseFloat(mPnl.toFixed(2)),
      winRate:       mTrades.length > 0 ? parseFloat(((mWins.length / mTrades.length) * 100).toFixed(1)) : 0,
      result:        mTrades.length > 0 ? mPnl > 0 ? 'profit' : mPnl < 0 ? 'loss' : 'breakeven' : 'none',
      hasActivity:   activeDates.size > 0,
    }
  })

  // Hitung cumulative PnL per bulan
  let cumulative = 0
  months.forEach(m => { cumulative += m.pnl; m.cumulativePnl = parseFloat(cumulative.toFixed(2)) })

  const bestMonth  = [...months].filter(m => m.tradeCount > 0).sort((a, b) => b.pnl - a.pnl)[0] || null
  const worstMonth = [...months].filter(m => m.tradeCount > 0).sort((a, b) => a.pnl - b.pnl)[0] || null

  return {
    year: targetYear,
    months,
    yearly: {
      totalJournals: journals.length,
      totalTrades:   trades.length,
      totalPnl:      parseFloat(cumulative.toFixed(2)),
      activeDays:    new Set(journals.map(j => new Date(j.createdAt).toISOString().split('T')[0])).size,
      winRate:       trades.length > 0
        ? parseFloat(((trades.filter(t => Number(t.pnlAmount) > 0).length / trades.length) * 100).toFixed(1))
        : 0,
      bestMonth,
      worstMonth,
    },
  }
}

module.exports = Object.assign(module.exports || {}, {
  getJournalCalendar,
  getJournalsByDate,
  getYearCalendar,
})
