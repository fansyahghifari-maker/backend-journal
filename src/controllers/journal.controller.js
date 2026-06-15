const journalService = require('../services/journal.service')
const tradeService   = require('../services/trade.service')
const { success, error, paginated } = require('../utils/response')

// JOURNAL CRUD
const createJournal = async (req, res) => {
  try {
    const journal = await journalService.createJournal(req.user.id, req.body)
    return success(res, { journal }, 'Jurnal berhasil dibuat.', 201)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getMyJournals = async (req, res) => {
  try {
    const { journals, meta } = await journalService.getMyJournals(req.user.id, req.query)
    return paginated(res, journals, meta, 'Daftar jurnal berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getPublicFeed = async (req, res) => {
  try {
    const { journals, meta } = await journalService.getPublicFeed(req.user?.id || null, req.query)
    return paginated(res, journals, meta, 'Feed berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getJournalById = async (req, res) => {
  try {
    const journal = await journalService.getJournalById(req.params.id, req.user?.id || null)
    return success(res, { journal }, 'Jurnal berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const updateJournal = async (req, res) => {
  try {
    const journal = await journalService.updateJournal(req.params.id, req.user.id, req.body)
    return success(res, { journal }, 'Jurnal berhasil diupdate.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const deleteJournal = async (req, res) => {
  try {
    await journalService.deleteJournal(req.params.id, req.user.id)
    return success(res, null, 'Jurnal berhasil dihapus.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const togglePin = async (req, res) => {
  try {
    const result = await journalService.togglePin(req.params.id, req.user.id)
    return success(res, result, result.isPinned ? 'Jurnal di-pin.' : 'Jurnal di-unpin.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const toggleLike = async (req, res) => {
  try {
    const result = await journalService.toggleLike(req.params.id, req.user.id)
    return success(res, result, result.liked ? 'Jurnal disukai.' : 'Like dibatalkan.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// COMMENTS
const getComments = async (req, res) => {
  try {
    const result = await journalService.getComments(req.params.id, req.query)
    return paginated(res, result.comments, result.meta, 'Komentar berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const addComment = async (req, res) => {
  try {
    const comment = await journalService.addComment(
      req.params.id, req.user.id, req.body.content, req.body.parentId
    )
    return success(res, { comment }, 'Komentar berhasil ditambahkan.', 201)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const deleteComment = async (req, res) => {
  try {
    await journalService.deleteComment(req.params.commentId, req.user.id)
    return success(res, null, 'Komentar berhasil dihapus.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// TRADES
const addTrade = async (req, res) => {
  try {
    const trade = await tradeService.addTrade(req.params.id, req.user.id, req.body)
    return success(res, { trade }, 'Trade berhasil ditambahkan.', 201)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getTradesByJournal = async (req, res) => {
  try {
    const result = await tradeService.getTradesByJournal(req.params.id, req.user.id)
    return success(res, result, 'Data trade berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const updateTrade = async (req, res) => {
  try {
    const trade = await tradeService.updateTrade(req.params.tradeId, req.user.id, req.body)
    return success(res, { trade }, 'Trade berhasil diupdate.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const deleteTrade = async (req, res) => {
  try {
    await tradeService.deleteTrade(req.params.tradeId, req.user.id)
    return success(res, null, 'Trade berhasil dihapus.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getTradeStats = async (req, res) => {
  try {
    const stats = await tradeService.getTradeStats(req.user.id)
    return success(res, stats, 'Statistik trade berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = {
  createJournal, getMyJournals, getPublicFeed, getJournalById,
  updateJournal, deleteJournal, togglePin, toggleLike,
  getComments, addComment, deleteComment,
  addTrade, getTradesByJournal, updateTrade, deleteTrade, getTradeStats,
}
