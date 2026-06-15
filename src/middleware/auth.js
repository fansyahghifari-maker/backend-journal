const { verifyAccessToken } = require('../utils/jwt')
const { error } = require('../utils/response')
const prisma = require('../utils/database')

// Wajib login — verifikasi Bearer token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) return error(res, 'Token tidak ditemukan.', 401)
    const decoded = verifyAccessToken(authHeader.split(' ')[1])
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id:true, email:true, username:true, role:true, isVerified:true, avatarUrl:true },
    })
    if (!user) return error(res, 'Akun tidak ditemukan.', 401)
    req.user = user
    next()
  } catch (err) {
    if (err.name === 'TokenExpiredError') return error(res, 'Token expired. Silakan refresh.', 401)
    return error(res, 'Token tidak valid.', 401)
  }
}

// Wajib membership aktif
const requireMembership = async (req, res, next) => {
  try {
    const sub = await prisma.userSubscription.findFirst({
      where: { userId: req.user.id, status: 'active', endDate: { gt: new Date() } },
      include: { plan: true },
    })
    if (!sub) return error(res, 'Fitur ini hanya untuk member aktif. Upgrade dulu.', 403)
    req.subscription = sub
    req.plan = sub.plan
    next()
  } catch { return error(res, 'Gagal verifikasi membership.', 500) }
}

// Cek feature spesifik di JSON plan
const requireFeature = (featureKey) => async (req, res, next) => {
  try {
    if (!req.plan) {
      const sub = await prisma.userSubscription.findFirst({
        where: { userId: req.user.id, status: 'active', endDate: { gt: new Date() } },
        include: { plan: true },
      })
      if (!sub) return error(res, 'Upgrade membership untuk fitur ini.', 403)
      req.plan = sub.plan
    }
    const feat = req.plan.features.find(f => f.key === featureKey)
    if (!feat || feat.value === false) {
      return error(res, `Fitur "${featureKey}" tidak tersedia di paket ${req.plan.name}.`, 403)
    }
    next()
  } catch { return error(res, 'Gagal verifikasi akses fitur.', 500) }
}

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return error(res, 'Admin only.', 403)
  next()
}

module.exports = { authenticate, requireMembership, requireFeature, requireAdmin }
