const router  = require('express').Router()
const multer  = require('multer')
const { authenticate } = require('../middleware/auth.middleware')
const { uploadStatement } = require('../controllers/mt.controller')

// CATATAN: rute webhook EA (.mq5) sudah DIHAPUS. Integrasi live MT4/MT5 sekarang
// pakai MetaApi cloud (lihat /api/v1/exchanges/connect dengan platform mt4/mt5),
// jadi tidak butuh EA yang ke-attach di MT5 desktop lagi — bisa dipakai dari HP juga.

// Simpan file di memory (bukan disk) — kita cuma butuh baca isinya sekali lalu parse
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // max 10MB
})

// POST /api/v1/mt/upload  — upload statement MT4/MT5/MIFX manual (buat import histori lama sekali klik)
router.post('/upload', authenticate, upload.single('file'), uploadStatement)

module.exports = router
