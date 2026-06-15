const express = require('express')
const helmet  = require('helmet')
const cors    = require('cors')
require('dotenv').config()

const { apiLimiter } = require('./middleware/rateLimiter')
const { error }      = require('./utils/response')
const routes         = require('./routes')

const app = express()

// Security headers
app.use(helmet())

// CORS
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true)
  },
  credentials: true
}))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Trust proxy (untuk di balik Nginx/reverse proxy)
app.set('trust proxy', 1)

// Global rate limit
app.use('/api', apiLimiter)

// Routes
app.use('/api/v1', routes)

// 404 handler
app.use((req, res) => {
  return error(res, `Endpoint ${req.method} ${req.path} tidak ditemukan.`, 404)
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err)
  return error(res, 'Terjadi kesalahan di server.', 500)
})

module.exports = app
