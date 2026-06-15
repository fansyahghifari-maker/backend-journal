const journalService = require('../services/journal.service')
const { success, error } = require('../utils/response')

// GET /api/v1/calendar/monthly?year=2024&month=5
// Return: kalender sebulan + jurnal per hari
const getMonthlyCalendar = async (req, res) => {
  try {
    const data = await journalService.getJournalCalendar(req.user.id, req.query)
    return success(res, data, 'Kalender jurnal berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// GET /api/v1/calendar/date/2024-05-15
// Return: semua jurnal + trades di tanggal tersebut
const getByDate = async (req, res) => {
  try {
    const data = await journalService.getJournalsByDate(req.user.id, req.params.date)
    return success(res, data, 'Jurnal hari ini berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// GET /api/v1/calendar/yearly?year=2024
// Return: overview 12 bulan untuk year view
const getYearlyCalendar = async (req, res) => {
  try {
    const data = await journalService.getYearCalendar(req.user.id, req.query.year)
    return success(res, data, 'Kalender tahunan berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// GET /api/v1/calendar/today
// Shortcut — langsung ambil jurnal hari ini
const getToday = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0]
    const data  = await journalService.getJournalsByDate(req.user.id, today)
    return success(res, data, 'Jurnal hari ini berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = { getMonthlyCalendar, getByDate, getYearlyCalendar, getToday }
