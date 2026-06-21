const authService = require('../services/auth.service')
const { success, error } = require('../utils/response')
const { sendVerificationEmail, sendResetPasswordEmail } = require('../utils/mailer')

// REGISTER - Pendaftaran User Baru
const register = async (req, res) => {
  try {
    const { user, verifyToken } = await authService.register(req.body)

    // Kirim email verifikasi via Nodemailer (Gmail SMTP)
    await sendVerificationEmail({
      to:       user.email,
      username: user.username,
      token:    verifyToken,
    })

    return success(res, { user }, 'Registrasi berhasil! Cek email kamu untuk verifikasi akun.', 201)
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

// LOGIN
const login = async (req, res) => {
  try {
    const result = await authService.login({
      ...req.body,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    })
    return success(res, result, 'Login berhasil.')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

// REFRESH TOKEN
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return error(res, 'Refresh token dibutuhkan.', 400)
    const tokens = await authService.refreshTokens(refreshToken)
    return success(res, tokens, 'Token berhasil diperbarui.')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

// LOGOUT
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body
    await authService.logout(refreshToken)
    return success(res, null, 'Logout berhasil.')
  } catch (err) {
    return error(res, 'Logout gagal.', 500)
  }
}

// LOGOUT ALL DEVICES
const logoutAll = async (req, res) => {
  try {
    await authService.logoutAll(req.user.id)
    return success(res, null, 'Logout dari semua perangkat berhasil.')
  } catch (err) {
    return error(res, 'Gagal logout semua perangkat.', 500)
  }
}

// VERIFY EMAIL - Validasi Token dari Klik Email User
const verifyEmail = async (req, res) => {
  try {
    await authService.verifyEmail(req.params.token)
    return success(res, null, 'Email berhasil diverifikasi! Silakan login.')
  } catch (err) {
    return error(res, err.message, err.status || 400)
  }
}

// RESEND VERIFICATION - Kirim Ulang Email Verifikasi jika Expired
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body
    if (!email) return error(res, 'Email dibutuhkan.', 400)

    const result = await authService.resendVerification(email)
    if (!result) return success(res, null, 'Jika email terdaftar dan belum diverifikasi, email verifikasi sudah dikirim ulang.')

    // Kirim ulang via Nodemailer (Gmail SMTP)
    await sendVerificationEmail({
      to:       result.user.email,
      username: result.user.username,
      token:    result.verifyToken,
    })

    return success(res, null, 'Email verifikasi berhasil dikirim ulang. Cek inbox kamu.')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

// FORGOT PASSWORD - Request Link Reset Password
const forgotPassword = async (req, res) => {
  try {
    const result = await authService.forgotPassword(req.body.email)

    // Kirim email reset password via Nodemailer (Gmail SMTP)
    if (result) {
      await sendResetPasswordEmail({
        to:       result.user.email,
        username: result.user.username,
        token:    result.resetToken,
      })
    }

    // Selalu return success demi keamanan (mencegah user enumeration)
    return success(res, null, 'Jika email terdaftar, link reset password sudah dikirim.')
  } catch (err) {
    return error(res, 'Gagal memproses request.', 500)
  }
}

// RESET PASSWORD - Setup Password Baru
const resetPassword = async (req, res) => {
  try {
    await authService.resetPassword(req.params.token, req.body.password)
    return success(res, null, 'Password berhasil direset. Silakan login dengan password baru.')
  } catch (err) {
    return error(res, err.message, err.status || 400)
  }
}

// GET ME - Ambil Data User Berdasarkan Token yang Valid
const getMe = async (req, res) => {
  try {
    return success(res, { user: req.user }, 'Data user berhasil diambil.')
  } catch (err) {
    return error(res, 'Gagal mengambil data user.', 500)
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getMe,
}