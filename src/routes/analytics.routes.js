const router = require('express').Router()
const ctrl   = require('../controllers/analytics.controller')
const { authenticate } = require('../middleware/auth')

// Semua route analytics wajib login
router.use(authenticate)

// FULL DASHBOARD 1 request semua data
router.get('/',                  ctrl.getFullDashboard)

// PER SECTION
router.get('/overview',          ctrl.getOverview)           // Ringkasan utama
router.get('/trade-performance', ctrl.getTradePerformance)   // Win rate, R:R, streak
router.get('/journal-stats',     ctrl.getJournalStats)       // Aktivitas journaling
router.get('/streak',            ctrl.getActivityStreak)     // Streak harian
router.get('/monthly-pnl',       ctrl.getMonthlyPnlChart)    // ?year=2024
router.get('/daily-heatmap',     ctrl.getDailyPnlHeatmap)    // ?year=2024&month=5
router.get('/coin-performance',  ctrl.getCoinPerformance)    // Ranking per coin

module.exports = router
