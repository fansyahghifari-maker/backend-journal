const { body } = require('express-validator')

const registerRules = [
  body('email')
    .isEmail().withMessage('Format email tidak valid.')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email terlalu panjang.'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 }).withMessage('Username harus 3-30 karakter.')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username hanya boleh huruf, angka, dan underscore.'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password minimal 8 karakter.')
    .matches(/[A-Z]/).withMessage('Password harus ada huruf kapital.')
    .matches(/[0-9]/).withMessage('Password harus ada angka.'),
]

const loginRules = [
  body('email').isEmail().withMessage('Format email tidak valid.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password tidak boleh kosong.'),
]

const resetPasswordRules = [
  body('password')
    .isLength({ min: 8 }).withMessage('Password minimal 8 karakter.')
    .matches(/[A-Z]/).withMessage('Password harus ada huruf kapital.')
    .matches(/[0-9]/).withMessage('Password harus ada angka.'),
]

const forgotPasswordRules = [
  body('email').isEmail().withMessage('Format email tidak valid.').normalizeEmail(),
]

module.exports = { registerRules, loginRules, resetPasswordRules, forgotPasswordRules }
