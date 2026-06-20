/**
 * NEWS CONTROLLER — v3
 * NewsData.io (crypto) + RSS macro real-time (CPI, NFP, Powell, Fed)
 */

const { success, error } = require('../utils/response')
const {
  getLatestNews,
  getNewsForSymbol,
  getMacroEvents,
  getSentimentSummary,
  getEconomicCalendar,
} = require('../services/news.service')

// GET /api/v1/news?filter=all|crypto|forex|macro|bullish|bearish
const getNews = async (req, res) => {
  try {
    const { filter = 'all', page } = req.query
    const valid = ['all', 'crypto', 'forex', 'macro', 'bullish', 'bearish']
    if (!valid.includes(filter))
      return error(res, `Filter tidak valid. Pilihan: ${valid.join(', ')}`, 400)

    const news = await getLatestNews(filter, page || null)
    return success(res, { news, total: news.length, filter, page: page || 1 })
  } catch (err) {
    console.error('[NEWS] getNews:', err.message)
    return error(res, 'Gagal mengambil berita.', 500)
  }
}

// GET /api/v1/news/symbol/:symbol
// BTC, ETH, SOL, EURUSD, XAUUSD, US30, dll
const getNewsBySymbol = async (req, res) => {
  try {
    const { symbol } = req.params
    const { page }   = req.query
    if (!symbol || symbol.length < 2 || symbol.length > 12)
      return error(res, 'Symbol tidak valid.', 400)

    const news = await getNewsForSymbol(symbol, page || null)
    return success(res, { symbol: symbol.toUpperCase(), news, total: news.length })
  } catch (err) {
    console.error('[NEWS] getNewsBySymbol:', err.message)
    return error(res, 'Gagal mengambil berita untuk symbol ini.', 500)
  }
}

// GET /api/v1/news/macro
// Khusus CPI, NFP, Powell, Fed, GDP dari RSS real-time
const getMacro = async (req, res) => {
  try {
    const events = await getMacroEvents()
    return success(res, {
      events,
      total: events.length,
      note:  'Real-time dari ForexLive, FXStreet, Investing.com, Reuters',
    })
  } catch (err) {
    console.error('[NEWS] getMacro:', err.message)
    return error(res, 'Gagal mengambil macro events.', 500)
  }
}

// GET /api/v1/news/calendar
const getCalendar = async (req, res) => {
  try {
    const events = await getEconomicCalendar()
    return success(res, { events, total: events.length })
  } catch (err) {
    console.error('[NEWS] getCalendar:', err.message)
    return error(res, 'Gagal mengambil economic calendar.', 500)
  }
}

// GET /api/v1/news/sentiment?coin=btc
const getSentiment = async (req, res) => {
  try {
    const { coin = 'btc' } = req.query
    const sentiment = await getSentimentSummary(coin.toLowerCase())
    return success(res, { sentiment })
  } catch (err) {
    console.error('[NEWS] getSentiment:', err.message)
    return error(res, 'Gagal mengambil data sentiment.', 500)
  }
}

module.exports = { getNews, getNewsBySymbol, getMacro, getCalendar, getSentiment }
