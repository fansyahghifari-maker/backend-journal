const tradeService = require('../services/trade.service')
const { success, error, paginated } = require('../utils/response')

const addTrade = async (req, res) => {
  try {
    const trade = await tradeService.addTrade(req.params.journalId, req.user.id, req.body)
    return success(res, { trade }, 'Trade berhasil ditambahkan.', 201)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getTradesByJournal = async (req, res) => {
  try {
    const result = await tradeService.getTradesByJournal(req.params.journalId, req.user.id)
    return success(res, result, 'Data trade berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getAllMyTrades = async (req, res) => {
  try {
    const { trades, meta } = await tradeService.getAllMyTrades(req.user.id, req.query)
    return paginated(res, trades, meta, 'Semua trade berhasil diambil.')
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

const getMonthlyPnL = async (req, res) => {
  try {
    const data = await tradeService.getMonthlyPnL(req.user.id, req.query.year)
    return success(res, data, 'Data PnL bulanan berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getCoinPerformance = async (req, res) => {
  try {
    const data = await tradeService.getCoinPerformance(req.user.id)
    return success(res, data, 'Performance per coin berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getDailyPnL = async (req, res) => {
  try {
    const data = await tradeService.getDailyPnL(req.user.id, req.query.year, req.query.month)
    return success(res, data, 'Data PnL harian berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getOpenTrades = async (req, res) => {
  try {
    const trades = await tradeService.getOpenTrades(req.user.id)
    return success(res, { trades, count: trades.length }, 'Open trades berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = {
  addTrade, getTradesByJournal, getAllMyTrades,
  updateTrade, deleteTrade, getTradeStats,
  getMonthlyPnL, getCoinPerformance, getDailyPnL, getOpenTrades,
}
