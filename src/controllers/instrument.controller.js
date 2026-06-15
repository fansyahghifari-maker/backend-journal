const instrumentService = require('../services/instrument.service')
const { success, error, paginated } = require('../utils/response')

const getInstruments = async (req, res) => {
  try {
    const result = await instrumentService.getInstruments(req.query)
    return paginated(res, result.instruments, result.meta, 'Instrumen berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const getBySymbol = async (req, res) => {
  try {
    const instrument = await instrumentService.getBySymbol(req.params.symbol)
    return success(res, { instrument }, 'Instrumen ditemukan.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const calculatePnL = async (req, res) => {
  try {
    const result = instrumentService.calculatePnL(req.body)
    return success(res, result, 'PnL berhasil dikalkulasi.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

const calculateRisk = async (req, res) => {
  try {
    const result = instrumentService.calculateRisk(req.body)
    return success(res, result, 'Risk berhasil dikalkulasi.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = { getInstruments, getBySymbol, calculatePnL, calculateRisk }
