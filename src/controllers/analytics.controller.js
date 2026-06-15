const analyticsService = require('../services/analytics.service')
const { success, error } = require('../utils/response')

const getOverview = async (req, res) => {
  try {
    const data = await analyticsService.getOverview(req.user.id)
    return success(res, data, 'Overview berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getMonthlyPnlChart = async (req, res) => {
  try {
    const data = await analyticsService.getMonthlyPnlChart(req.user.id, req.query.year)
    return success(res, data, 'Data chart PnL bulanan berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getDailyPnlHeatmap = async (req, res) => {
  try {
    const data = await analyticsService.getDailyPnlHeatmap(req.user.id, req.query.year, req.query.month)
    return success(res, data, 'Data heatmap PnL harian berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getCoinPerformance = async (req, res) => {
  try {
    const data = await analyticsService.getCoinPerformance(req.user.id)
    return success(res, data, 'Performance per coin berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getTradePerformance = async (req, res) => {
  try {
    const data = await analyticsService.getTradePerformance(req.user.id)
    return success(res, data, 'Statistik performa trade berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getJournalStats = async (req, res) => {
  try {
    const data = await analyticsService.getJournalStats(req.user.id)
    return success(res, data, 'Statistik journal berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getActivityStreak = async (req, res) => {
  try {
    const data = await analyticsService.getActivityStreak(req.user.id)
    return success(res, data, 'Data streak aktivitas berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getFullDashboard = async (req, res) => {
  try {
    const data = await analyticsService.getFullDashboard(req.user.id)
    return success(res, data, 'Data dashboard berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = {
  getOverview, getMonthlyPnlChart, getDailyPnlHeatmap,
  getCoinPerformance, getTradePerformance, getJournalStats,
  getActivityStreak, getFullDashboard,
}
