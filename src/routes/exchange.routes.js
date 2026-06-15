const router = require('express').Router()
const ctrl   = require('../controllers/exchange.controller')
const { authenticate } = require('../middleware/auth')
const { body } = require('express-validator')
const { validate } = require('../middleware/validate')

router.use(authenticate)

// ACCOUNT MANAGEMENT
router.get('/', ctrl.getMyAccounts)

router.post('/connect', [
  body('platform')
    .isIn(['binance','indodax','tokocrypto','triv','floq','mifx','mt4','mt5','manual','csv_import'])
    .withMessage('Platform tidak valid.'),
  body('accountName')
    .trim().notEmpty().withMessage('Nama akun wajib diisi.')
    .isLength({ max: 100 }).withMessage('Nama akun maksimal 100 karakter.'),
  body('apiKey')
    .optional().isString().isLength({ max: 500 }),
  body('apiSecret')
    .optional().isString().isLength({ max: 500 }),
], validate, ctrl.connectAccount)

router.patch('/:id',           ctrl.updateAccount)
router.delete('/:id',          ctrl.disconnectAccount)

// CONNECTION TEST & IMPORT
router.post('/:id/test',           ctrl.testConnection)
router.post('/:id/import', [
  body('sinceDate').optional().isISO8601().withMessage('Format tanggal tidak valid.'),
  body('symbols').optional().isArray().withMessage('Symbols harus array.'),
  body('includeFutures').optional().isBoolean(),
], validate, ctrl.importTrades)

router.get('/:id/import-history',  ctrl.getImportHistory)

module.exports = router
