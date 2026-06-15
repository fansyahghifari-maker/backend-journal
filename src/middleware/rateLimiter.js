const rateLimit = require('express-rate-limit')

// Rate limit ketat untuk auth endpoint
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10,
  message: { success: false, message: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limit umum untuk API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 100,
  message: { success: false, message: 'Rate limit exceeded. Coba lagi sebentar.' },
})

module.exports = { authLimiter, apiLimiter }
