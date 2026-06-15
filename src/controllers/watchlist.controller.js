const watchlistService = require('../services/watchlist.service')
const { success, error } = require('../utils/response')

// WATCHLIST CRUD 
const createWatchlist = async (req, res) => {
  try {
    const wl = await watchlistService.createWatchlist(req.user.id, req.body.name)
    return success(res, { watchlist: wl }, 'Watchlist berhasil dibuat.', 201)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getMyWatchlists = async (req, res) => {
  try {
    const watchlists = await watchlistService.getMyWatchlists(req.user.id)
    return success(res, { watchlists, count: watchlists.length }, 'Watchlist berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getWatchlistById = async (req, res) => {
  try {
    const wl = await watchlistService.getWatchlistById(req.params.id, req.user.id)
    return success(res, { watchlist: wl }, 'Watchlist berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const updateWatchlist = async (req, res) => {
  try {
    const wl = await watchlistService.updateWatchlist(req.params.id, req.user.id, req.body.name)
    return success(res, { watchlist: wl }, 'Watchlist berhasil diupdate.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const deleteWatchlist = async (req, res) => {
  try {
    await watchlistService.deleteWatchlist(req.params.id, req.user.id)
    return success(res, null, 'Watchlist berhasil dihapus.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const setDefault = async (req, res) => {
  try {
    const result = await watchlistService.setDefaultWatchlist(req.params.id, req.user.id)
    return success(res, result, 'Watchlist default berhasil diubah.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getSummary = async (req, res) => {
  try {
    const summary = await watchlistService.getWatchlistSummary(req.user.id)
    return success(res, summary, 'Summary watchlist berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// WATCHLIST ITEMS
const addItem = async (req, res) => {
  try {
    const item = await watchlistService.addItem(req.params.id, req.user.id, req.body)
    return success(res, { item }, 'Coin berhasil ditambahkan ke watchlist.', 201)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const updateItem = async (req, res) => {
  try {
    const item = await watchlistService.updateItem(req.params.itemId, req.user.id, req.body)
    return success(res, { item }, 'Item berhasil diupdate.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const removeItem = async (req, res) => {
  try {
    await watchlistService.removeItem(req.params.itemId, req.user.id)
    return success(res, null, 'Coin berhasil dihapus dari watchlist.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const reorderItems = async (req, res) => {
  try {
    await watchlistService.reorderItems(req.params.id, req.user.id, req.body.orderedIds)
    return success(res, null, 'Urutan coin berhasil disimpan.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const moveItem = async (req, res) => {
  try {
    const item = await watchlistService.moveItem(req.params.itemId, req.body.targetWatchlistId, req.user.id)
    return success(res, { item }, 'Coin berhasil dipindahkan ke watchlist lain.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// PRICE ALERTS
const checkPriceAlerts = async (req, res) => {
  try {
    const result = await watchlistService.checkPriceAlerts(req.user.id, req.body.prices)
    return success(res, result, result.count > 0 ? `${result.count} alert terpicu!` : 'Tidak ada alert yang terpicu.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = {
  createWatchlist, getMyWatchlists, getWatchlistById,
  updateWatchlist, deleteWatchlist, setDefault, getSummary,
  addItem, updateItem, removeItem, reorderItems, moveItem,
  checkPriceAlerts,
}
