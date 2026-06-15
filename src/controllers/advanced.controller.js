const pdfService  = require('../services/pdf.service')
const aiService   = require('../services/ai.service')
const cronService = require('../services/cron.service')
const { success, error } = require('../utils/response')

// PDF EXPORT 
const exportJournalPDF = async (req, res) => {
  try {
    const result = await pdfService.exportJournal(req.params.journalId, req.user.id)

    // Return HTML — frontend handle print/save as PDF
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    return res.send(result.html)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const exportMultiplePDF = async (req, res) => {
  try {
    const { journalIds } = req.body
    if (!Array.isArray(journalIds) || journalIds.length === 0) {
      return error(res, 'journalIds harus berupa array dan tidak boleh kosong.', 400)
    }
    if (journalIds.length > 20) {
      return error(res, 'Maksimal 20 jurnal per export.', 400)
    }

    const result = await pdfService.exportMultipleJournals(req.user.id, journalIds)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    return res.send(result.html)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// AI ANALYSIS
const analyzeJournal = async (req, res) => {
  try {
    const result = await aiService.analyzeJournal(req.params.journalId, req.user.id)
    return success(res, result, 'Analisis AI journal selesai.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const analyzeTrade = async (req, res) => {
  try {
    const result = await aiService.analyzeTrade(req.params.tradeId, req.user.id)
    return success(res, result, 'Analisis AI trade selesai.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const analyzePerformance = async (req, res) => {
  try {
    const result = await aiService.analyzePerformance(req.user.id)
    return success(res, result, 'Analisis performa AI selesai.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const chatWithAI = async (req, res) => {
  try {
    const { messages } = req.body
    if (!Array.isArray(messages) || messages.length === 0) {
      return error(res, 'messages harus berupa array dan tidak boleh kosong.', 400)
    }
    if (messages.length > 20) {
      return error(res, 'Maksimal 20 pesan per request.', 400)
    }
    const result = await aiService.chatWithAI(req.user.id, messages)
    return success(res, result, 'AI response berhasil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// CRON MANUAL TRIGGER (admin only)
const triggerExpireSubscriptions = async (req, res) => {
  try {
    await cronService.expireSubscriptions()
    return success(res, null, 'Job expire subscriptions selesai dijalankan.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const triggerCleanup = async (req, res) => {
  try {
    await Promise.all([
      cronService.cleanupExpiredTokens(),
      cronService.cleanupOldNotifications(),
    ])
    return success(res, null, 'Cleanup job selesai dijalankan.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = {
  exportJournalPDF, exportMultiplePDF,
  analyzeJournal, analyzeTrade, analyzePerformance, chatWithAI,
  triggerExpireSubscriptions, triggerCleanup,
}
