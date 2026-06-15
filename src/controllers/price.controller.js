const priceService = require('../services/price.service')
const wsService    = require('../services/websocket.service')
const { success, error } = require('../utils/response')

// GET HARGA SAAT INI
const getPrices = async (req, res) => {
  try {
    const symbols = req.query.symbols
      ? req.query.symbols.split(',').map(s => s.trim().toUpperCase())
      : []

    if (symbols.length === 0) return error(res, 'Parameter "symbols" wajib diisi. Contoh: ?symbols=BTCUSDT,ETHUSDT,XAUUSD', 400)
    if (symbols.length > 50)  return error(res, 'Maksimal 50 symbols per request.', 400)

    const prices = await priceService.getPrices(symbols)
    return success(res, { prices, count: Object.keys(prices).length }, 'Harga berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// GET HARGA WATCHLIST USER
const getWatchlistPrices = async (req, res) => {
  try {
    const result = await priceService.getWatchlistPrices(req.user.id)
    return success(res, result, 'Harga watchlist berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// GET HARGA SATU SYMBOL
const getPrice = async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase()
    const prices = await priceService.getPrices([symbol])
    const price  = prices[symbol]

    if (!price) return error(res, `Harga untuk ${symbol} tidak tersedia.`, 404)
    return success(res, { symbol, ...price }, 'Harga berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

// WEBSOCKET STATS (admin)
const getWsStats = async (req, res) => {
  try {
    const stats = wsService.getStats()
    return success(res, stats, 'WebSocket stats berhasil diambil.')
  } catch (err) { return error(res, err.message, err.status || 500) }
}

module.exports = { getPrices, getWatchlistPrices, getPrice, getWsStats }
