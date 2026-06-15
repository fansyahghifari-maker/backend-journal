const { body, query } = require('express-validator')

const addTradeRules = [
  body('coinSymbol')
    .trim().notEmpty().withMessage('Symbol coin wajib diisi.')
    .isLength({ max: 20 }).withMessage('Symbol maksimal 20 karakter.')
    .matches(/^[A-Za-z0-9]+$/).withMessage('Symbol hanya boleh huruf dan angka.'),
  body('coinName')
    .trim().notEmpty().withMessage('Nama coin wajib diisi.'),
  body('tradeType')
    .isIn(['long', 'short']).withMessage('Trade type harus "long" atau "short".'),
  body('entryPrice')
    .isFloat({ min: 0.000001 }).withMessage('Entry price harus angka positif.'),
  body('exitPrice')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Exit price harus angka positif.'),
  body('quantity')
    .isFloat({ min: 0.000001 }).withMessage('Quantity harus angka positif.'),
  body('exchange')
    .optional().isString().isLength({ max: 100 }),
  body('tradeDate')
    .isISO8601().withMessage('Trade date harus format ISO8601. Contoh: 2024-01-15'),
]

const updateTradeRules = [
  body('exitPrice')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Exit price harus angka positif.'),
  body('quantity')
    .optional()
    .isFloat({ min: 0.000001 }).withMessage('Quantity harus angka positif.'),
  body('status')
    .optional()
    .isIn(['open', 'closed', 'cancelled']).withMessage('Status tidak valid.'),
  body('exchange')
    .optional().isString(),
  body('tradeDate')
    .optional().isISO8601().withMessage('Trade date harus format ISO8601.'),
]

module.exports = { addTradeRules, updateTradeRules }
