const socialService = require('../services/social.service')
const { success, error, paginated } = require('../utils/response')

// LIKES
const toggleLike = async (req, res) => {
  try {
    const result = await socialService.toggleLike(req.params.journalId, req.user.id)
    return success(res, result, result.liked ? 'Jurnal disukai ❤️' : 'Like dibatalkan.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getLikes = async (req, res) => {
  try {
    const result = await socialService.getLikes(req.params.journalId, req.user?.id || null)
    return success(res, result, 'Data likes berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// COMMENTS
const addComment = async (req, res) => {
  try {
    const comment = await socialService.addComment(
      req.params.journalId,
      req.user.id,
      req.body.content,
      req.body.parentId || null
    )
    return success(res, { comment }, 'Komentar berhasil ditambahkan.', 201)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getComments = async (req, res) => {
  try {
    const result = await socialService.getComments(
      req.params.journalId,
      req.user?.id || null,
      req.query
    )
    return paginated(res, result.comments, result.meta, 'Komentar berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const updateComment = async (req, res) => {
  try {
    const comment = await socialService.updateComment(
      req.params.commentId,
      req.user.id,
      req.body.content
    )
    return success(res, { comment }, 'Komentar berhasil diupdate.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const deleteComment = async (req, res) => {
  try {
    await socialService.deleteComment(req.params.commentId, req.user.id)
    return success(res, null, 'Komentar berhasil dihapus.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// FEED
const getFeed = async (req, res) => {
  try {
    const result = await socialService.getFeed(req.user?.id || null, req.query)
    return paginated(res, result.journals, result.meta, 'Feed berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getTrending = async (req, res) => {
  try {
    const result = await socialService.getTrending(req.user?.id || null)
    return success(res, result, 'Trending journals berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// NOTIFIKASI
const getNotifications = async (req, res) => {
  try {
    const result = await socialService.getNotifications(req.user.id, req.query)
    return paginated(res, result.notifications, result.meta, 'Notifikasi berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const markNotificationRead = async (req, res) => {
  try {
    await socialService.markNotificationRead(req.params.id, req.user.id)
    return success(res, null, 'Notifikasi ditandai sudah dibaca.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const markAllRead = async (req, res) => {
  try {
    const result = await socialService.markAllRead(req.user.id)
    return success(res, result, `${result.updated} notifikasi ditandai sudah dibaca.`)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const deleteNotification = async (req, res) => {
  try {
    await socialService.deleteNotification(req.params.id, req.user.id)
    return success(res, null, 'Notifikasi berhasil dihapus.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// USER PROFILE
const getUserProfile = async (req, res) => {
  try {
    const result = await socialService.getUserProfile(req.params.username, req.user?.id || null)
    return success(res, result, 'Profil user berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = {
  toggleLike, getLikes,
  addComment, getComments, updateComment, deleteComment,
  getFeed, getTrending,
  getNotifications, markNotificationRead, markAllRead, deleteNotification,
  getUserProfile,
}
