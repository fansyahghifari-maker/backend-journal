const router = require('express').Router()
const ctrl   = require('../controllers/watchlist.controller')
const {
  createWatchlistRules, addItemRules, updateItemRules,
  reorderRules, moveItemRules, checkAlertsRules,
} = require('../validators/watchlist.validator')
const { validate }     = require('../middleware/validate')
const { authenticate } = require('../middleware/auth')

// Semua route watchlist wajib login
router.use(authenticate)

// WATCHLIST CRUD
router.get('/',              ctrl.getMyWatchlists)
router.get('/summary',       ctrl.getSummary)
router.post('/',             createWatchlistRules, validate, ctrl.createWatchlist)
router.get('/:id',           ctrl.getWatchlistById)
router.patch('/:id',         createWatchlistRules, validate, ctrl.updateWatchlist)
router.delete('/:id',        ctrl.deleteWatchlist)
router.patch('/:id/default', ctrl.setDefault)

// ITEMS
router.post('/:id/items',              addItemRules,    validate, ctrl.addItem)
router.patch('/:id/items/reorder',     reorderRules,    validate, ctrl.reorderItems)
router.patch('/items/:itemId',         updateItemRules, validate, ctrl.updateItem)
router.delete('/items/:itemId',        ctrl.removeItem)
router.patch('/items/:itemId/move',    moveItemRules,   validate, ctrl.moveItem)

// PRICE ALERTS
router.post('/check-alerts', checkAlertsRules, validate, ctrl.checkPriceAlerts)

module.exports = router
