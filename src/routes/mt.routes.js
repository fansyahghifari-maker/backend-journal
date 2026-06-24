const router  = require('express').Router()
const multer  = require('multer')
const { authenticate } = require('../middleware/auth.middleware')
const { uploadStatement } = require('../controllers/mt.controller')
const { receiveTradeFromEA, getWebhookToken } = require('../controllers/mtWebhook.controller')

// Simpan file di memory (bukan disk) — kita cuma butuh baca isinya sekali lalu parse
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // max 10MB
})

// POST /api/v1/mt/upload  — upload statement MT4/MT5/MIFX manual (one-time import history lama)
router.post('/upload', authenticate, upload.single('file'), uploadStatement)

// GET /api/v1/mt/webhook-token/:accountId — ambil/generate webhook token (butuh login, dipanggil dari frontend)
router.get('/webhook-token/:accountId', authenticate, getWebhookToken)

// POST /api/v1/mt/webhook/:webhookToken — endpoint yang dipanggil EA, TANPA JWT (auth via token di URL)
router.post('/webhook/:webhookToken', receiveTradeFromEA)

module.exports = router
