const crypto = require('crypto')

// Tokocrypto pakai Binance API base dengan endpoint berbeda
const BASE_URL = 'https://www.tokocrypto.com'

// HELPER: sign & fetch
const sign = (qs, secret) =>
  crypto.createHmac('sha256', secret).update(qs).digest('hex')

const tokoFetch = async (endpoint, params, apiKey, apiSecret) => {
  const ts  = Date.now()
  const qs  = new URLSearchParams({ ...params, timestamp: ts }).toString()
  const sig = sign(qs, apiSecret)
  const url = `${BASE_URL}${endpoint}?${qs}&signature=${sig}`

  const res  = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } })
  const data = await res.json()

  // Tokocrypto: code 0 = sukses. code lain (atau tidak ok) = error.
  if (!res.ok || (data.code !== undefined && data.code !== 0)) {
    throw { status: 400, message: `Tokocrypto: ${data.msg || data.message || 'Request gagal'}` }
  }
  return data
}

//  TEST CONNECTION
const testConnection = async (apiKey, apiSecret) => {
  const data = await tokoFetch('/open/v1/account/spot', {}, apiKey, apiSecret)

  const balances = (data.data?.balances || [])
    .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))

  return {
    success:     true,
    message:     'Koneksi Tokocrypto berhasil!',
    canTrade:    data.data?.canTrade,
    balances:    balances.slice(0, 10),
    totalAssets: balances.length,
  }
}

//  FETCH TRADE HISTORY per symbol
const fetchTrades = async (apiKey, apiSecret, symbol, options = {}) => {
  const { limit = 500, startTime, endTime } = options
  const params = { symbol: symbol.toUpperCase(), limit }
  if (startTime) params.startTime = startTime
  if (endTime)   params.endTime   = endTime

  const data   = await tokoFetch('/open/v1/orders/trades', params, apiKey, apiSecret)
  const trades = data.data?.list || []

  return trades.map(t => ({
    externalTradeId: `TOKO-${t.id}`,
    symbol:          t.symbol,
    instrumentType:  'crypto',
    tradeType:       t.isBuyer ? 'buy' : 'sell',
    entryPrice:      parseFloat(t.price),
    exitPrice:       null,
    quantity:        parseFloat(t.qty),
    commission:      parseFloat(t.commission),
    commissionAsset: t.commissionAsset,
    tradeDate:       new Date(t.time).toISOString(),
    exchange:        'Tokocrypto',
    raw:             t,
  }))
}

//  GET ACCOUNT BALANCE
const getBalance = async (apiKey, apiSecret) => {
  const data = await tokoFetch('/open/v1/account/spot', {}, apiKey, apiSecret)
  return (data.data?.balances || [])
    .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
}

//  DETECT TRADED SYMBOLS
const detectTradedSymbols = async (apiKey, apiSecret) => {
  const popularPairs = [
  'BTC_USDT','ETH_USDT','BNB_USDT','SOL_USDT','XRP_USDT',
  'ADA_USDT','DOGE_USDT','MATIC_USDT','LTC_USDT','LINK_USDT',
  'BTC_IDR', 'ETH_IDR',  'BNB_IDR',  'SOL_IDR',
  'TKO_IDR', 'TKO_USDT',
]

  const traded = []
  for (const sym of popularPairs) {
    try {
      const data = await tokoFetch('/open/v1/orders/trades', { symbol: sym, limit: 1 }, apiKey, apiSecret)
      if ((data.data?.list || []).length > 0) traded.push(sym)
    } catch {}
    await new Promise(r => setTimeout(r, 200))
  }

  return traded
}

//  IMPORT ALL TRADES
const importAll = async (apiKey, apiSecret, options = {}) => {
  const { sinceDate, symbols } = options
  const startTime = sinceDate ? new Date(sinceDate).getTime() : undefined

  let targetSymbols = symbols?.length > 0
    ? symbols
    : await detectTradedSymbols(apiKey, apiSecret)

  const allTrades = []
  const errors    = []

  for (const symbol of targetSymbols) {
    try {
      const trades = await fetchTrades(apiKey, apiSecret, symbol, { limit: 500, startTime })
      allTrades.push(...trades)
    } catch (err) {
      errors.push({ symbol, error: err.message })
    }
    await new Promise(r => setTimeout(r, 250))
  }

  return {
    trades:  allTrades,
    count:   allTrades.length,
    errors,
    symbols: targetSymbols,
  }
}

module.exports = { testConnection, fetchTrades, getBalance, detectTradedSymbols, importAll }
