const { body, query } = require('express-validator')

const createJournalRules = [
  body('title')
    .trim()
    .notEmpty().withMessage('Judul jurnal wajib diisi.')
    .isLength({ min: 3, max: 255 }).withMessage('Judul harus 3-255 karakter.'),
  body('content')
    .notEmpty().withMessage('Konten jurnal wajib diisi.')
    .isLength({ min: 10 }).withMessage('Konten minimal 10 karakter.'),
  body('visibility')
    .optional()
    .isIn(['private', 'public', 'members_only']).withMessage('Visibility tidak valid.'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags harus berupa array.')
    .custom(tags => tags.every(t => typeof t === 'string')).withMessage('Setiap tag harus berupa string.'),
  body('isPinned')
    .optional()
    .isBoolean().withMessage('isPinned harus boolean.'),
]

const updateJournalRules = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 255 }).withMessage('Judul harus 3-255 karakter.'),
  body('content')
    .optional()
    .isLength({ min: 10 }).withMessage('Konten minimal 10 karakter.'),
  body('visibility')
    .optional()
    .isIn(['private', 'public', 'members_only']).withMessage('Visibility tidak valid.'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags harus berupa array.'),
]

const addTradeRules = [
  body('coinSymbol').trim().notEmpty().withMessage('Symbol coin wajib diisi.').isLength({ max: 20 }),
  body('coinName').trim().notEmpty().withMessage('Nama coin wajib diisi.'),
  body('tradeType').isIn(['long', 'short']).withMessage('Trade type harus "long" atau "short".'),
  body('entryPrice').isFloat({ min: 0 }).withMessage('Entry price harus angka positif.'),
  body('exitPrice').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Exit price harus angka positif.'),
  body('quantity').isFloat({ min: 0 }).withMessage('Quantity harus angka positif.'),
  body('exchange').optional().isString(),
  body('tradeDate').isISO8601().withMessage('Trade date harus format ISO8601 (YYYY-MM-DD).'),
]

const addCommentRules = [
  body('content').trim().notEmpty().withMessage('Konten komentar wajib diisi.').isLength({ min: 1, max: 1000 }),
  body('parentId').optional({ nullable: true }).isUUID().withMessage('Parent ID tidak valid.'),
]

module.exports = { createJournalRules, updateJournalRules, addTradeRules, addCommentRules }
