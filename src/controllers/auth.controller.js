const authService = require('../services/auth.service')
const { success, error } = require('../utils/response')

const register = async (req, res) => {
  try {
    const { user, verifyToken } = await authService.register(req.body)
    // TODO: kirim email verifikasi dengan verifyToken
    return success(res, { user }, 'Registrasi berhasil! Cek email untuk verifikasi akun.', 201)
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

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

const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body
    await authService.logout(refreshToken)
    return success(res, null, 'Logout berhasil.')
  } catch (err) {
    return error(res, 'Logout gagal.', 500)
  }
}

const logoutAll = async (req, res) => {
  try {
    await authService.logoutAll(req.user.id)
    return success(res, null, 'Logout dari semua perangkat berhasil.')
  } catch (err) {
    return error(res, 'Gagal logout semua perangkat.', 500)
  }
}

const verifyEmail = async (req, res) => {
  try {
    await authService.verifyEmail(req.params.token)
    return success(res, null, 'Email berhasil diverifikasi. Silakan login.')
  } catch (err) {
    return error(res, err.message, err.status || 400)
  }
}

const forgotPassword = async (req, res) => {
  try {
    const result = await authService.forgotPassword(req.body.email)
    // TODO: kirim email reset dengan result.resetToken
    // Selalu return success — jangan reveal apakah email ada atau tidak
    return success(res, null, 'Jika email terdaftar, link reset password sudah dikirim.')
  } catch (err) {
    return error(res, 'Gagal memproses request.', 500)
  }
}

const resetPassword = async (req, res) => {
  try {
    await authService.resetPassword(req.params.token, req.body.password)
    return success(res, null, 'Password berhasil direset. Silakan login dengan password baru.')
  } catch (err) {
    return error(res, err.message, err.status || 400)
  }
}

const getMe = async (req, res) => {
  try {
    return success(res, { user: req.user }, 'Data user berhasil diambil.')
  } catch (err) {
    return error(res, 'Gagal mengambil data user.', 500)
  }
}

module.exports = { register, login, refresh, logout, logoutAll, verifyEmail, forgotPassword, resetPassword, getMe }
