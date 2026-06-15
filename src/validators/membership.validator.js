const { body } = require('express-validator')

const createPaymentRules = [
  body('planId').notEmpty().isUUID().withMessage('Plan ID tidak valid.'),
  body('billingCycle')
    .notEmpty()
    .isIn(['monthly', 'yearly'])
    .withMessage('Billing cycle harus "monthly" atau "yearly".'),
]

module.exports = { createPaymentRules }
