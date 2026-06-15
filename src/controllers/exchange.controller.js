const exchangeService = require('../services/exchange.service')
const { success, error } = require('../utils/response')

const connectAccount = async (req, res) => {
  try {
    const account = await exchangeService.connectAccount(req.user.id, req.body)
    return success(res, { account }, 'Akun exchange berhasil dihubungkan.', 201)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getMyAccounts = async (req, res) => {
  try {
    const accounts = await exchangeService.getMyAccounts(req.user.id)
    return success(res, { accounts, count: accounts.length }, 'Daftar akun berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const updateAccount = async (req, res) => {
  try {
    const account = await exchangeService.updateAccount(req.params.id, req.user.id, req.body)
    return success(res, { account }, 'Akun berhasil diupdate.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const disconnectAccount = async (req, res) => {
  try {
    const result = await exchangeService.disconnectAccount(req.params.id, req.user.id)
    return success(res, result, 'Akun berhasil diputus.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const testConnection = async (req, res) => {
  try {
    const result = await exchangeService.testConnection(req.params.id, req.user.id)
    return success(res, result, result.message)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const importTrades = async (req, res) => {
  try {
    const result = await exchangeService.importTrades(req.params.id, req.user.id, req.body)
    return success(res, result, `Import selesai: ${result.imported} trade berhasil diimport.`)
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getImportHistory = async (req, res) => {
  try {
    const result = await exchangeService.getImportHistory(req.params.id, req.user.id)
    return success(res, result, 'Riwayat import berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = {
  connectAccount, getMyAccounts, updateAccount,
  disconnectAccount, testConnection,
  importTrades, getImportHistory,
}
