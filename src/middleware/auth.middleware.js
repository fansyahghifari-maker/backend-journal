const { verifyAccessToken } = require('../utils/jwt');
const { unauthorized, forbidden } = require('../utils/response');
const prisma = require('../utils/prisma');

/**
 * MIDDLEWARE 1: Autentikasi — wajib login
 * Cek JWT di header Authorization: Bearer <token>
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'Access token required');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    // Ambil user fresh dari DB — pastikan masih exist dan tidak di-suspend
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        role: true,
        isVerified: true,
      },
    });

    if (!user) return unauthorized(res, 'User not found');

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return unauthorized(res, 'Access token expired');
    }
    if (err.name === 'JsonWebTokenError') {
      return unauthorized(res, 'Invalid access token');
    }
    return unauthorized(res, 'Authentication failed');
  }
};

/**
 * MIDDLEWARE 2: Otorisasi by role
 * Contoh: authorize('admin'), authorize('member', 'admin')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (!roles.includes(req.user.role)) {
      return forbidden(res, `Access requires one of these roles: ${roles.join(', ')}`);
    }
    next();
  };
};

/**
 * MIDDLEWARE 3: Cek membership aktif
 * Dipakai untuk route yang butuh subscription (bukan cuma role)
 * Attach info subscription ke req.subscription
 */
const requireActiveMembership = async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res);

    // Admin bypass — selalu boleh akses
    if (req.user.role === 'admin') return next();

    const now = new Date();
    const subscription = await prisma.userSubscription.findFirst({
      where: {
        userId: req.user.id,
        status: 'active',
        endDate: { gt: now },
      },
      include: { plan: true },
      orderBy: { endDate: 'desc' },
    });

    if (!subscription) {
      return forbidden(res, 'Active membership required. Please upgrade your plan.');
    }

    req.subscription = subscription;
    req.plan = subscription.plan;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * MIDDLEWARE 4: Cek fitur spesifik dari plan
 * Contoh: requireFeature('ai_analysis'), requireFeature('export_pdf')
 */
const requireFeature = (featureKey) => {
  return async (req, res, next) => {
    try {
      if (!req.user) return unauthorized(res);
      if (req.user.role === 'admin') return next();

      const now = new Date();
      const subscription = await prisma.userSubscription.findFirst({
        where: {
          userId: req.user.id,
          status: 'active',
          endDate: { gt: now },
        },
        include: { plan: true },
      });

      if (!subscription) {
        return forbidden(res, 'Active membership required');
      }

      const features = subscription.plan.features;
      const feature = features.find(f => f.key === featureKey);

      if (!feature || feature.value === false) {
        return forbidden(res, `Feature "${featureKey}" not available on your current plan. Please upgrade.`);
      }

      req.subscription = subscription;
      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * MIDDLEWARE 5: Cek limit jurnal (untuk user free)
 */
const checkJournalLimit = async (req, res, next) => {
  try {
    if (!req.user) return unauthorized(res);
    if (req.user.role === 'admin') return next();

    const now = new Date();
    const subscription = await prisma.userSubscription.findFirst({
      where: {
        userId: req.user.id,
        status: 'active',
        endDate: { gt: now },
      },
      include: { plan: true },
    });

    // User tanpa subscription = pakai plan free default
    let maxJournals = 5;
    if (subscription) {
      const limitFeature = subscription.plan.features.find(f => f.key === 'max_journals');
      maxJournals = limitFeature ? limitFeature.value : 5;
    }

    // -1 = unlimited
    if (maxJournals === -1) return next();

    const journalCount = await prisma.journal.count({
      where: { userId: req.user.id },
    });

    if (journalCount >= maxJournals) {
      return forbidden(res, `Journal limit reached (${maxJournals}). Upgrade your plan for unlimited journals.`);
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  authenticate,
  authorize,
  requireActiveMembership,
  requireFeature,
  checkJournalLimit,
};
