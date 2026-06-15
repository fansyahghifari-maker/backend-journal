const router = require('express').Router()
const ctrl   = require('../controllers/instrument.controller')
const { authenticate } = require('../middleware/auth')
const { body } = require('express-validator')
const { validate } = require('../middleware/validate')

// Public — lihat instrumen tidak butuh login
router.get('/',           ctrl.getInstruments)
router.get('/:symbol',    ctrl.getBySymbol)

// Protected — kalkulasi butuh login
router.post('/calculate/pnl', authenticate, [
  body('instrumentType').isIn(['crypto','forex','commodity','index','stock','crypto_futures']),
  body('tradeType').isIn(['long','short','buy','sell']),
  body('entryPrice').isFloat({ min: 0 }),
  body('quantity').isFloat({ min: 0 }),
], validate, ctrl.calculatePnL)

router.post('/calculate/risk', authenticate, [
  body('accountBalance').isFloat({ min: 0 }),
  body('riskPercent').isFloat({ min: 0.01, max: 100 }),
  body('entryPrice').isFloat({ min: 0 }),
  body('stopLoss').isFloat({ min: 0 }),
], validate, ctrl.calculateRisk)

module.exports = router
