const prisma = require('../utils/prisma')

//  HELPER: cek apakah viewer bisa akses journal
const assertJournalVisible = async (journalId, viewerId) => {
  const journal = await prisma.journal.findUnique({
    where: { id: journalId },
    select: { id: true, userId: true, visibility: true, title: true },
  })
  if (!journal) throw { status: 404, message: 'Jurnal tidak ditemukan.' }

  const isOwner = journal.userId === viewerId

  if (!isOwner) {
    if (journal.visibility === 'private') {
      throw { status: 403, message: 'Jurnal ini bersifat private.' }
    }
    if (journal.visibility === 'members_only') {
      if (!viewerId) throw { status: 401, message: 'Login diperlukan.' }
      const sub = await prisma.userSubscription.findFirst({
        where: { userId: viewerId, status: 'active', endDate: { gt: new Date() } },
      })
      if (!sub) throw { status: 403, message: 'Jurnal ini hanya untuk member aktif.' }
    }
  }

  return journal
}

//  LIKE / UNLIKE JOURNAL — toggle
const toggleLike = async (journalId, userId) => {
  const journal = await assertJournalVisible(journalId, userId)

  if (journal.userId === userId) {
    throw { status: 400, message: 'Tidak bisa like jurnal sendiri.' }
  }

  const existing = await prisma.journalLike.findUnique({
    where: { journalId_userId: { journalId, userId } },
  })

  if (existing) {
    // Unlike
    await prisma.journalLike.delete({
      where: { journalId_userId: { journalId, userId } },
    })
    const likeCount = await prisma.journalLike.count({ where: { journalId } })
    return { liked: false, likeCount }
  }

  // Like + notifikasi ke pemilik jurnal
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

  const likeCount = await prisma.journalLike.count({ where: { journalId } })
  return { liked: true, likeCount }
}

//  GET LIKES — siapa saja yang like journal ini
const getLikes = async (journalId, viewerId) => {
  await assertJournalVisible(journalId, viewerId)

  const likes = await prisma.journalLike.findMany({
    where:   { journalId },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, username: true, avatarUrl: true } },
    },
  })

  return { likes: likes.map(l => ({ ...l.user, likedAt: l.createdAt })), count: likes.length }
}

//  ADD COMMENT — support reply (nested 1 level)
const addComment = async (journalId, userId, content, parentId = null) => {
  const journal = await assertJournalVisible(journalId, userId)

  // Validasi parentId kalau reply
  if (parentId) {
    const parent = await prisma.journalComment.findUnique({
      where: { id: parentId },
    })
    if (!parent || parent.journalId !== journalId) {
      throw { status: 400, message: 'Parent comment tidak valid.' }
    }
    // Tidak boleh reply ke reply (max 1 level nesting)
    if (parent.parentId) {
      throw { status: 400, message: 'Hanya bisa reply ke komentar utama, bukan ke reply.' }
    }
  }

  const comment = await prisma.journalComment.create({
    data:    { journalId, userId, content, parentId },
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  })

  // Notifikasi ke pemilik jurnal (kalau bukan komentar sendiri)
  if (journal.userId !== userId) {
    await prisma.notification.create({
      data: {
        userId:  journal.userId,
        type:    'journal_commented',
        title:   'Komentar baru di jurnal kamu 💬',
        message: `Seseorang berkomentar di "${journal.title}": "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
        data:    { journalId, journalTitle: journal.title, commentId: comment.id },
      },
    })
  }

  // Kalau ini reply, notif ke pemilik komentar parent
  if (parentId) {
    const parent = await prisma.journalComment.findUnique({
      where: { id: parentId },
      select: { userId: true },
    })
    if (parent && parent.userId !== userId && parent.userId !== journal.userId) {
      await prisma.notification.create({
        data: {
          userId:  parent.userId,
          type:    'comment_replied',
          title:   'Komentar kamu dibalas 💬',
          message: `Seseorang membalas komentar kamu di "${journal.title}".`,
          data:    { journalId, commentId: comment.id, parentId },
        },
      })
    }
  }

  return comment
}

//  GET COMMENTS — dengan nested replies
const getComments = async (journalId, viewerId, query) => {
  await assertJournalVisible(journalId, viewerId)

  const { page = 1, limit = 20 } = query
  const skip = (Number(page) - 1) * Number(limit)

  const [comments, total] = await Promise.all([
    prisma.journalComment.findMany({
      where:   { journalId, parentId: null }, // top-level only
      skip,
      take:    Number(limit),
      orderBy: { createdAt: 'asc' },
      include: {
        user:    { select: { id: true, username: true, avatarUrl: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { id: true, username: true, avatarUrl: true } },
          },
        },
      },
    }),
    prisma.journalComment.count({ where: { journalId, parentId: null } }),
  ])

  return {
    comments,
    meta: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  }
}

//  UPDATE COMMENT — hanya pemilik komentar
const updateComment = async (commentId, userId, content) => {
  const comment = await prisma.journalComment.findUnique({ where: { id: commentId } })
  if (!comment)                throw { status: 404, message: 'Komentar tidak ditemukan.' }
  if (comment.userId !== userId) throw { status: 403, message: 'Hanya pemilik yang bisa edit komentar.' }

  const updated = await prisma.journalComment.update({
    where: { id: commentId },
    data:  { content },
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  })

  return updated
}

//  DELETE COMMENT — pemilik komentar ATAU pemilik jurnal
const deleteComment = async (commentId, userId) => {
  const comment = await prisma.journalComment.findUnique({
    where:   { id: commentId },
    include: { journal: { select: { userId: true } } },
  })
  if (!comment) throw { status: 404, message: 'Komentar tidak ditemukan.' }

  const canDelete = comment.userId === userId || comment.journal.userId === userId
  if (!canDelete) throw { status: 403, message: 'Akses ditolak.' }

  // Hapus comment + semua replynya (cascade)
  await prisma.journalComment.delete({ where: { id: commentId } })
  return { deleted: true }
}

//  PUBLIC FEED — jurnal public + members_only (kalau member)
const getFeed = async (viewerId, query) => {
  const {
    page = 1, limit = 10,
    search, tag, coinSymbol,
    sortBy = 'published_at', order = 'desc',
    tradeType,
  } = query

  const skip = (Number(page) - 1) * Number(limit)

  // Cek apakah viewer member aktif
  let isMember = false
  if (viewerId) {
    const sub = await prisma.userSubscription.findFirst({
      where: { userId: viewerId, status: 'active', endDate: { gt: new Date() } },
    })
    isMember = !!sub
  }

  // Visibility yang bisa dilihat
  const visibilityFilter = isMember
    ? { in: ['public', 'members_only'] }
    : { equals: 'public' }

  // Build filter
  const where = {
    visibility:  visibilityFilter,
    publishedAt: { not: null },
  }

  if (search) {
    where.OR = [
      { title:   { contains: search } },
      { content: { contains: search } },
    ]
  }

  if (tag)        where.tags   = { path: '$', array_contains: tag }
  if (coinSymbol) where.trades = { some: { coinSymbol: coinSymbol.toUpperCase() } }
  if (tradeType)  where.trades = { some: { tradeType } }

  const orderByMap = {
    published_at: { publishedAt: order },
    view_count:   { viewCount:   order },
    created_at:   { createdAt:   order },
  }

  const [journals, total] = await Promise.all([
    prisma.journal.findMany({
      where,
      skip,
      take:    Number(limit),
      orderBy: orderByMap[sortBy] || { publishedAt: 'desc' },
      include: {
        user:    { select: { id: true, username: true, avatarUrl: true } },
        trades:  { select: { id: true, coinSymbol: true, tradeType: true, pnlPercent: true, status: true } },
        _count:  { select: { likes: true, comments: true } },
      },
    }),
    prisma.journal.count({ where }),
  ])

  // Tandai jurnal mana yang sudah di-like viewer
  let likedIds = new Set()
  if (viewerId && journals.length > 0) {
    const liked = await prisma.journalLike.findMany({
      where: {
        userId:    viewerId,
        journalId: { in: journals.map(j => j.id) },
      },
      select: { journalId: true },
    })
    likedIds = new Set(liked.map(l => l.journalId))
  }

  const result = journals.map(j => ({
    ...j,
    isLiked: likedIds.has(j.id),
  }))

  return {
    journals: result,
    meta: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      isMember,
    },
  }
}

//  TRENDING FEED — jurnal dengan like + view terbanyak 7 hari
const getTrending = async (viewerId) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  let isMember = false
  if (viewerId) {
    const sub = await prisma.userSubscription.findFirst({
      where: { userId: viewerId, status: 'active', endDate: { gt: new Date() } },
    })
    isMember = !!sub
  }

  const visibilityFilter = isMember
    ? { in: ['public', 'members_only'] }
    : { equals: 'public' }

  const journals = await prisma.journal.findMany({
    where: {
      visibility:  visibilityFilter,
      publishedAt: { gte: sevenDaysAgo },
    },
    take:    10,
    orderBy: [
      { likes: { _count: 'desc' } },
      { viewCount: 'desc' },
    ],
    include: {
      user:   { select: { id: true, username: true, avatarUrl: true } },
      trades: { select: { coinSymbol: true, tradeType: true, pnlPercent: true } },
      _count: { select: { likes: true, comments: true } },
    },
  })

  return { journals, period: '7 hari terakhir' }
}


//  NOTIFIKASI
const getNotifications = async (userId, query) => {
  const { page = 1, limit = 20, unreadOnly } = query
  const skip  = (Number(page) - 1) * Number(limit)
  const where = { userId }
  if (unreadOnly === 'true') where.isRead = false

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      skip,
      take:    Number(limit),
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ])

  return {
    notifications,
    meta: {
      total,
      unreadCount,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  }
}

const markNotificationRead = async (notificationId, userId) => {
  const notif = await prisma.notification.findUnique({ where: { id: notificationId } })
  if (!notif)                throw { status: 404, message: 'Notifikasi tidak ditemukan.' }
  if (notif.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }

  return prisma.notification.update({
    where: { id: notificationId },
    data:  { isRead: true, readAt: new Date() },
  })
}

const markAllRead = async (userId) => {
  const { count } = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data:  { isRead: true, readAt: new Date() },
  })
  return { updated: count }
}

const deleteNotification = async (notificationId, userId) => {
  const notif = await prisma.notification.findUnique({ where: { id: notificationId } })
  if (!notif)                throw { status: 404, message: 'Notifikasi tidak ditemukan.' }
  if (notif.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }
  await prisma.notification.delete({ where: { id: notificationId } })
  return { deleted: true }
}

//  USER PROFILE PUBLIK
const getUserProfile = async (username, viewerId) => {
  const user = await prisma.user.findUnique({
    where:  { username },
    select: {
      id: true, username: true, avatarUrl: true,
      createdAt: true, role: true,
    },
  })
  if (!user) throw { status: 404, message: 'User tidak ditemukan.' }

  // Jurnal publik user ini
  let isMember = false
  if (viewerId) {
    const sub = await prisma.userSubscription.findFirst({
      where: { userId: viewerId, status: 'active', endDate: { gt: new Date() } },
    })
    isMember = !!sub
  }

  const visibilityFilter = isMember
    ? { in: ['public', 'members_only'] }
    : { equals: 'public' }

  const [journals, totalLikes, totalJournals] = await Promise.all([
    prisma.journal.findMany({
      where:   { userId: user.id, visibility: visibilityFilter },
      take:    6,
      orderBy: { publishedAt: 'desc' },
      include: {
        _count:  { select: { likes: true, comments: true } },
        trades:  { select: { coinSymbol: true, pnlPercent: true }, take: 3 },
      },
    }),
    prisma.journalLike.count({ where: { journal: { userId: user.id } } }),
    prisma.journal.count({ where: { userId: user.id, visibility: { not: 'private' } } }),
  ])

  return {
    user,
    stats: {
      totalPublicJournals: totalJournals,
      totalLikesReceived:  totalLikes,
    },
    recentJournals: journals,
  }
}

// LEADERBOARD — Top Trader by Performance
const getLeaderboard = async (query = {}) => {
  const { period = 'weekly', category = 'winrate', limit = 10 } = query

  // Tentukan range waktu
  const now = new Date()
  let startDate
  if (period === 'weekly') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (period === 'monthly') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
  } else if (period === 'alltime') {
    startDate = new Date('2020-01-01')
  } else {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  // Ambil semua user yang punya trade closed di periode ini (dari journal public)
  const journals = await prisma.journal.findMany({
    where: {
      visibility: { in: ['public', 'members_only'] },
    },
    select: {
      userId: true,
      user: {
        select: {
          id:        true,
          username:  true,
          avatarUrl: true,
        },
      },
      trades: {
        where: {
          status:    'closed',
          closeDate: { gte: startDate },
        },
        select: {
          pnlAmount:  true,
          pnlPercent: true,
          status:     true,
        },
      },
    },
  })

  // Agregasi per user
  const userMap = {}
  for (const journal of journals) {
    const uid = journal.userId
    if (!userMap[uid]) {
      userMap[uid] = {
        userId:     journal.user.id,
        username:   journal.user.username,
        avatarUrl:  journal.user.avatarUrl,
        totalTrade: 0,
        winTrade:   0,
        lossTrade:  0,
        totalPnl:   0,
        bestTrade:  null,
      }
    }

    for (const trade of journal.trades) {
      const pnl = parseFloat(trade.pnlAmount || 0)
      const pct = parseFloat(trade.pnlPercent || 0)

      userMap[uid].totalTrade++
      userMap[uid].totalPnl += pnl

      if (pnl > 0) {
        userMap[uid].winTrade++
        // Track best single trade
        if (!userMap[uid].bestTrade || pct > userMap[uid].bestTrade) {
          userMap[uid].bestTrade = pct
        }
      } else {
        userMap[uid].lossTrade++
      }
    }
  }

  // Filter user yang punya minimal 3 trade (biar fair)
  let leaderboard = Object.values(userMap).filter(u => u.totalTrade >= 3)

  // Hitung winRate
  leaderboard = leaderboard.map(u => ({
    ...u,
    winRate:   u.totalTrade > 0 ? Math.round((u.winTrade / u.totalTrade) * 100) : 0,
    totalPnl:  parseFloat(u.totalPnl.toFixed(2)),
    bestTrade: u.bestTrade ? parseFloat(u.bestTrade.toFixed(2)) : 0,
  }))

  // Sort berdasarkan category
  if (category === 'winrate') {
    leaderboard.sort((a, b) => b.winRate - a.winRate || b.totalTrade - a.totalTrade)
  } else if (category === 'pnl') {
    leaderboard.sort((a, b) => b.totalPnl - a.totalPnl)
  } else if (category === 'trades') {
    leaderboard.sort((a, b) => b.totalTrade - a.totalTrade)
  }

  // Tambah rank
  leaderboard = leaderboard.slice(0, Number(limit)).map((u, i) => ({
    rank: i + 1,
    ...u,
  }))

  return {
    leaderboard,
    period,
    category,
    startDate: startDate.toISOString(),
    endDate:   now.toISOString(),
    meta: {
      description: period === 'weekly'
        ? 'Top trader minggu ini'
        : period === 'monthly'
        ? 'Top trader bulan ini'
        : 'Top trader sepanjang masa',
      minTrades: 3,
    },
  }
}

module.exports = {
  toggleLike, getLikes,
  addComment, getComments, updateComment, deleteComment,
  getFeed, getTrending, getLeaderboard,
  getNotifications, markNotificationRead, markAllRead, deleteNotification,
  getUserProfile,
}