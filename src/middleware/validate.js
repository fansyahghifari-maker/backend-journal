const { validationResult } = require('express-validator')
const { error } = require('../utils/response')

// Collect validation errors dan return 422
const validate = (req, res, next) => {
  const errs = validationResult(req)
  if (!errs.isEmpty()) {
    return error(res, 'Validasi gagal.', 422, errs.array().map(e => ({ field: e.path, message: e.msg })))
  }
  next()
}

module.exports = { validate }
