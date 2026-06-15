const router = require('express').Router()
const ctrl   = require('../controllers/riskCalculator.controller')
const {
  lotSizeRules, marginRules, pipValueRules, riskRewardRules,
  breakEvenRules, drawdownRules, tradePlanRules,
} = require('../validators/riskCalculator.validator')
const { validate }     = require('../middleware/validate')
const { authenticate } = require('../middleware/auth')

// Semua kalkulasi butuh login
router.use(authenticate)

// KALKULASI INDIVIDUAL
router.post('/lot-size',       lotSizeRules,    validate, ctrl.lotSize)
router.post('/margin',         marginRules,     validate, ctrl.margin)
router.post('/pip-value',      pipValueRules,   validate, ctrl.pipValue)
router.post('/risk-reward',    riskRewardRules, validate, ctrl.riskReward)
router.post('/break-even',     breakEvenRules,  validate, ctrl.breakEven)
router.post('/multi-scenario', lotSizeRules,    validate, ctrl.multiScenario)
router.post('/drawdown',       drawdownRules,   validate, ctrl.drawdown)

// ALL-IN-ONE
router.post('/trade-plan',     tradePlanRules,  validate, ctrl.tradePlan)

module.exports = router
