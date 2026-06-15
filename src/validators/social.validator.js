const { body } = require('express-validator')

const addCommentRules = [
  body('content')
    .trim()
    .notEmpty().withMessage('Konten komentar wajib diisi.')
    .isLength({ min: 1, max: 1000 }).withMessage('Komentar maksimal 1000 karakter.'),
  body('parentId')
    .optional({ nullable: true })
    .isUUID().withMessage('Parent ID tidak valid.'),
]

const updateCommentRules = [
  body('content')
    .trim()
    .notEmpty().withMessage('Konten komentar wajib diisi.')
    .isLength({ min: 1, max: 1000 }).withMessage('Komentar maksimal 1000 karakter.'),
]

module.exports = { addCommentRules, updateCommentRules }
