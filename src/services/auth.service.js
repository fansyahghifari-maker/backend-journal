const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const prisma = require('../utils/database')
const { generateAccessToken, generateRefreshToken, verifyRefreshToken, REFRESH_EXP_MS } = require('../utils/jwt')

const SALT_ROUNDS = 12

// REGISTER
const register = async ({ email, username, password }) => {
  // Cek duplikat email dan username dalam satu query paralel
  const [emailExists, usernameExists] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { username } }),
  ])
  if (emailExists)    throw { status: 409, message: 'Email sudah terdaftar.' }
  if (usernameExists) throw { status: 409, message: 'Username sudah dipakai.' }

  const passwordHash  = await bcrypt.hash(password, SALT_ROUNDS)
  const verifyToken   = crypto.randomBytes(32).toString('hex')

  // Buat user + default watchlist dalam satu transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: { email, username, passwordHash, verifyToken },
      select: { id:true, email:true, username:true, role:true, createdAt:true },
    })

    // Auto-buat watchlist default untuk user baru
    await tx.watchlist.create({
      data: { userId: newUser.id, name: 'Watchlist Utama', isDefault: true },
    })

    // Buat notifikasi selamat datang
    await tx.notification.create({
      data: {
        userId: newUser.id,
        type: 'welcome',
        title: 'Selamat datang di CryptoJournal! 🎉',
        message: 'Akun kamu sudah berhasil dibuat. Mulai catat trading journey kamu sekarang.',
        data: { action: 'explore' },
      },
    })

    return newUser
  })

  return { user, verifyToken }
}

// LOGIN
const login = async ({ email, password, userAgent, ip }) => {
  // Fetch user dengan semua field yang dibutuhkan
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id:true, email:true, username:true, passwordHash:true, role:true, isVerified:true, avatarUrl:true },
  })

  // Selalu jalankan bcrypt compare meski user tidak ada — cegah timing attack
  const dummyHash = '$2a$12$dummyhashtopreventtimingattacksonnonexistentaccounts'
  const isValid = await bcrypt.compare(password, user ? user.passwordHash : dummyHash)

  if (!user || !isValid) throw { status: 401, message: 'Email atau password salah.' }

  // Generate kedua token
  const accessToken  = generateAccessToken(user)
  const refreshToken = generateRefreshToken(user.id)

  // Simpan refresh token ke DB dengan TTL
  await prisma.refreshToken.create({
    data: {
      userId:    user.id,
      token:     refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_EXP_MS),
    },
  })

  // Fetch subscription aktif untuk response
  const activeSubscription = await prisma.userSubscription.findFirst({
    where: { userId: user.id, status: 'active', endDate: { gt: new Date() } },
    include: { plan: { select: { name:true, slug:true } } },
  })

  const { passwordHash: _, verifyToken: __, ...safeUser } = user

  return {
    user: { ...safeUser, subscription: activeSubscription?.plan || null },
    accessToken,
    refreshToken,
  }
}

// REFRESH TOKEN
const refreshTokens = async (token) => {
  let decoded
  try { decoded = verifyRefreshToken(token) }
  catch { throw { status: 401, message: 'Refresh token tidak valid atau sudah expired.' } }

  // Cek token ada di DB dan belum expired
  const stored = await prisma.refreshToken.findUnique({ where: { token } })
  if (!stored || stored.expiresAt < new Date()) {
    // Hapus kalau sudah invalid
    if (stored) await prisma.refreshToken.delete({ where: { token } })
    throw { status: 401, message: 'Refresh token tidak ditemukan atau sudah kadaluarsa.' }
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id:true, email:true, role:true },
  })
  if (!user) throw { status: 401, message: 'User tidak ditemukan.' }

  // Rotate: hapus token lama, buat token baru
  const newAccessToken  = generateAccessToken(user)
  const newRefreshToken = generateRefreshToken(user.id)

  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { token } }),
    prisma.refreshToken.create({
      data: { userId: user.id, token: newRefreshToken, expiresAt: new Date(Date.now() + REFRESH_EXP_MS) },
    }),
  ])

  return { accessToken: newAccessToken, refreshToken: newRefreshToken }
}

// LOGOUT
const logout = async (token) => {
  // Hapus refresh token dari DB — access token expire sendiri
  await prisma.refreshToken.deleteMany({ where: { token } })
}

// LOGOUT ALL DEVICES
const logoutAll = async (userId) => {
  await prisma.refreshToken.deleteMany({ where: { userId } })
}

// VERIFY EMAIL
const verifyEmail = async (token) => {
  const user = await prisma.user.findFirst({ where: { verifyToken: token } })
  if (!user) throw { status: 400, message: 'Token verifikasi tidak valid atau sudah dipakai.' }

  await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: true, verifyToken: null },
  })
}

// FORGOT PASSWORD
const forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } })
  // Jangan reveal apakah email terdaftar atau tidak
  if (!user) return null

  const resetToken    = crypto.randomBytes(32).toString('hex')
  const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000) // 1 jam

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExp },
  })

  return { user, resetToken }
}

// RESET PASSWORD 
const resetPassword = async (token, newPassword) => {
  const user = await prisma.user.findFirst({
    where: { resetToken: token, resetTokenExp: { gt: new Date() } },
  })
  if (!user) throw { status: 400, message: 'Token reset tidak valid atau sudah expired.' }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExp: null },
    }),
    // Logout semua device setelah reset password
    prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
  ])
}

module.exports = { register, login, refreshTokens, logout, logoutAll, verifyEmail, forgotPassword, resetPassword }
