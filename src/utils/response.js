const success   = (res, data = null, message = 'Success', code = 200) =>
  res.status(code).json({ success: true, message, data, timestamp: new Date().toISOString() })

const error = (res, message = 'Internal server error', code = 500, errors = null) => {
  const body = { success: false, message, timestamp: new Date().toISOString() }
  if (errors) body.errors = errors
  return res.status(code).json(body)
}

const unauthorized = (res, message = 'Unauthorized') => {
  return res.status(401).json({ success: false, message, timestamp: new Date().toISOString() })
}

const forbidden = (res, message = 'Forbidden') => {
  return res.status(403).json({ success: false, message, timestamp: new Date().toISOString() })
}

const paginated = (res, data, meta, message = 'Success') =>
  res.status(200).json({ success: true, message, data, meta, timestamp: new Date().toISOString() })

module.exports = { success, error, paginated, unauthorized, forbidden }
