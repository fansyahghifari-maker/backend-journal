const jwt = require('jsonwebtoken')
const crypto = require('crypto')

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET  || 'access_secret_dev'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret_dev'

const generateAccessToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email, role: user.role }, ACCESS_SECRET, { expiresIn: '1d' })

const generateRefreshToken = (userId) =>
  jwt.sign({ sub: userId, jti: crypto.randomUUID() }, REFRESH_SECRET, { expiresIn: '7d' })

const verifyAccessToken  = (t) => jwt.verify(t, ACCESS_SECRET)
const verifyRefreshToken = (t) => jwt.verify(t, REFRESH_SECRET)

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken, REFRESH_EXP_MS: 7*24*60*60*1000 }
