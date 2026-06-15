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

module.exports = {
  toggleLike, getLikes,
  addComment, getComments, updateComment, deleteComment,
  getFeed, getTrending,
  getNotifications, markNotificationRead, markAllRead, deleteNotification,
  getUserProfile,
}
