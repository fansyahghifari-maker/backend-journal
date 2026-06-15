const router = require('express').Router()
const ctrl   = require('../controllers/advanced.controller')
const { authenticate, requireFeature, requireAdmin } = require('../middleware/auth')
const { body } = require('express-validator')
const { validate } = require('../middleware/validate')

// PDF EXPORT butuh login + fitur export_pdf
router.get('/export/journal/:journalId',
  authenticate,
  requireFeature('export_pdf'),
  ctrl.exportJournalPDF
)

router.post('/export/journals',
  authenticate,
  requireFeature('export_pdf'),
  [body('journalIds').isArray({ min: 1 }).withMessage('journalIds harus array.')],
  validate,
  ctrl.exportMultiplePDF
)

// AI ANALYSIS butuh login + fitur ai_analysis (Elite)
router.post('/ai/analyze-journal/:journalId',
  authenticate,
  requireFeature('ai_analysis'),
  ctrl.analyzeJournal
)

router.post('/ai/analyze-trade/:tradeId',
  authenticate,
  requireFeature('ai_analysis'),
  ctrl.analyzeTrade
)

router.post('/ai/analyze-performance',
  authenticate,
  requireFeature('ai_analysis'),
  ctrl.analyzePerformance
)

router.post('/ai/chat',
  authenticate,
  requireFeature('ai_analysis'),
  [
    body('messages').isArray({ min: 1 }).withMessage('messages harus array.'),
    body('messages.*.role').isIn(['user', 'assistant']).withMessage('role harus user atau assistant.'),
    body('messages.*.content').notEmpty().withMessage('content tidak boleh kosong.'),
  ],
  validate,
  ctrl.chatWithAI
)

// CRON MANUAL admin only
router.post('/admin/cron/expire-subscriptions',
  authenticate, requireAdmin,
  ctrl.triggerExpireSubscriptions
)

router.post('/admin/cron/cleanup',
  authenticate, requireAdmin,
  ctrl.triggerCleanup
)

module.exports = router
