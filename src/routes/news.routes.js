/**
 * NEWS ROUTES — v3
 * Base: /api/v1/news
 *
 * GET /api/v1/news                       → semua berita
 *      ?filter=all|crypto|forex|macro|bullish|bearish
 * GET /api/v1/news/macro                 → CPI, NFP, Powell, Fed, GDP (real-time RSS)
 * GET /api/v1/news/symbol/:symbol        → per simbol: BTC, EURUSD, XAUUSD, US30
 * GET /api/v1/news/calendar              → economic calendar
 * GET /api/v1/news/sentiment?coin=btc    → sentiment score crypto
 */

const router             = require('express').Router()
const { authenticate }   = require('../middleware/auth.middleware')
const {
  getNews,
  getNewsBySymbol,
  getMacro,
  getCalendar,
  getSentiment,
} = require('../controllers/news.controller')

router.use(authenticate)

router.get('/',               getNews)
router.get('/macro',          getMacro)        // ← NEW: CPI/NFP/Powell/Fed
router.get('/calendar',       getCalendar)
router.get('/sentiment',      getSentiment)
router.get('/symbol/:symbol', getNewsBySymbol)

module.exports = router
