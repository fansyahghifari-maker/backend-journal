const router = require('express').Router()
const ctrl = require('../controllers/membership.controller')
const { createPaymentRules } = require('../validators/membership.validator')
const { validate } = require('../middleware/validate')
const { authenticate } = require('../middleware/auth')

// Public: lihat paket membership
router.get('/plans', ctrl.getPlans)

// Webhook Xendit — tidak pakai authenticate (dipanggil Xendit server)
router.post('/webhook', ctrl.handleWebhook)

// Protected: butuh login
router.get('/my-subscription', authenticate, ctrl.getMySubscription)
router.post('/pay', authenticate, createPaymentRules, validate, ctrl.createPayment)
router.post('/cancel', authenticate, ctrl.cancelSubscription)

module.exports = router
