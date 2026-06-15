const { body } = require('express-validator')

const createWatchlistRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Nama watchlist wajib diisi.')
    .isLength({ min: 1, max: 100 }).withMessage('Nama watchlist maksimal 100 karakter.'),
]

const addItemRules = [
  body('coinSymbol')
    .trim()
    .notEmpty().withMessage('Symbol coin wajib diisi.')
    .isLength({ max: 20 }).withMessage('Symbol maksimal 20 karakter.')
    .matches(/^[A-Za-z0-9]+$/).withMessage('Symbol hanya boleh huruf dan angka.'),
  body('coinName')
    .trim()
    .notEmpty().withMessage('Nama coin wajib diisi.')
    .isLength({ max: 100 }),
  body('alertPriceHigh')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Alert harga tinggi harus angka positif.'),
  body('alertPriceLow')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Alert harga rendah harus angka positif.'),
]

const updateItemRules = [
  body('alertPriceHigh')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Alert harga tinggi harus angka positif.'),
  body('alertPriceLow')
    .optional({ nullable: true })
    .isFloat({ min: 0 }).withMessage('Alert harga rendah harus angka positif.'),
  body('coinName')
    .optional()
    .trim()
    .isLength({ max: 100 }),
]

const reorderRules = [
  body('orderedIds')
    .isArray({ min: 1 }).withMessage('orderedIds harus berupa array.')
    .custom(ids => ids.every(id => typeof id === 'string')).withMessage('Setiap ID harus berupa string.'),
]

const moveItemRules = [
  body('targetWatchlistId')
    .notEmpty().withMessage('Target watchlist ID wajib diisi.')
    .isUUID().withMessage('Target watchlist ID tidak valid.'),
]

const checkAlertsRules = [
  body('prices')
    .isArray({ min: 1 }).withMessage('prices harus berupa array.')
    .custom(prices => prices.every(p => p.coinSymbol && p.currentPrice !== undefined))
    .withMessage('Setiap item harus punya coinSymbol dan currentPrice.'),
]

module.exports = {
  createWatchlistRules, addItemRules, updateItemRules,
  reorderRules, moveItemRules, checkAlertsRules,
}
