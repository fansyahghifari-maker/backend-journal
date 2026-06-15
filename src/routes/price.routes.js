const router = require('express').Router()
const ctrl   = require('../controllers/price.controller')
const { authenticate, requireAdmin } = require('../middleware/auth')

// Public — bisa akses tanpa login (untuk halaman landing)
router.get('/prices',          ctrl.getPrices)          // ?symbols=BTCUSDT,ETHUSDT,XAUUSD
router.get('/prices/:symbol',  ctrl.getPrice)           // /prices/BTCUSDT

// Protected
router.get('/watchlist-prices', authenticate, ctrl.getWatchlistPrices)

// Admin
router.get('/ws-stats', authenticate, requireAdmin, ctrl.getWsStats)

module.exports = router
