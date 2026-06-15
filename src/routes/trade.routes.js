const router = require('express').Router()
const ctrl   = require('../controllers/trade.controller')
const { addTradeRules, updateTradeRules } = require('../validators/trade.validator')
const { validate }     = require('../middleware/validate')
const { authenticate } = require('../middleware/auth')

// Semua route trade wajib login
router.use(authenticate)

// ANALYTICS & STATS
// Urutan penting: route spesifik harus di atas route dengan :param
router.get('/stats',            ctrl.getTradeStats)       // Overview statistik global
router.get('/open',             ctrl.getOpenTrades)        // Semua open trades
router.get('/monthly-pnl',      ctrl.getMonthlyPnL)        // ?year=2024
router.get('/coin-performance', ctrl.getCoinPerformance)   // Performance per coin
router.get('/daily-pnl',        ctrl.getDailyPnL)          // ?year=2024&month=1 (heatmap)
router.get('/',                 ctrl.getAllMyTrades)        // Semua trade dengan filter

// PER JOURNAL 
router.post('/:journalId',              addTradeRules, validate, ctrl.addTrade)
router.get('/:journalId',              ctrl.getTradesByJournal)

// PER TRADE
router.patch('/:journalId/:tradeId',   updateTradeRules, validate, ctrl.updateTrade)
router.delete('/:journalId/:tradeId',  ctrl.deleteTrade)

module.exports = router
