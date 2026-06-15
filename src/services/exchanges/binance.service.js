const crypto = require('crypto')

const BASE_SPOT    = 'https://api.binance.com'
const BASE_FUTURES = 'https://fapi.binance.com'

// HELPER: sign request
const sign = (qs, secret) =>
  crypto.createHmac('sha256', secret).update(qs).digest('hex')

// HELPER: authenticated fetch
const authFetch = async (baseUrl, endpoint, params, apiKey, apiSecret) => {
  const ts  = Date.now()
  const qs  = new URLSearchParams({ ...params, timestamp: ts }).toString()
  const sig = sign(qs, apiSecret)
  const res = await fetch(`${baseUrl}${endpoint}?${qs}&signature=${sig}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  })
  const data = await res.json()
  if (!res.ok) throw { status: 400, message: `Binance error: ${data.msg || JSON.stringify(data)}` }
  return data
}

//  TEST CONNECTION
const testConnection = async (apiKey, apiSecret) => {
  const data = await authFetch(BASE_SPOT, '/api/v3/account', {}, apiKey, apiSecret)

  const balances = data.balances
    .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
    .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))

  return {
    success:     true,
    message:     'Koneksi Binance berhasil!',
    accountType: data.accountType,
    canTrade:    data.canTrade,
    balances:    balances.slice(0, 10),
    totalAssets: balances.length,
  }
}

//  FETCH SPOT TRADES per symbol
const fetchSpotTrades = async (apiKey, apiSecret, symbol, options = {}) => {
  const { limit = 500, startTime, endTime } = options
  const params = { symbol: symbol.toUpperCase(), limit }
  if (startTime) params.startTime = startTime
  if (endTime)   params.endTime   = endTime

  const trades = await authFetch(BASE_SPOT, '/api/v3/myTrades', params, apiKey, apiSecret)

  return trades.map(t => ({
    externalTradeId: `BNC-SPOT-${t.id}`,
    symbol:          t.symbol,
    instrumentType:  'crypto',
    tradeType:       t.isBuyer ? 'buy' : 'sell',
    entryPrice:      parseFloat(t.price),
    exitPrice:       null, // spot tidak punya exit price, perlu matching
    quantity:        parseFloat(t.qty),
    commission:      parseFloat(t.commission),
    commissionAsset: t.commissionAsset,
    tradeDate:       new Date(t.time).toISOString(),
    isMaker:         t.isMaker,
    exchange:        'Binance Spot',
    raw:             t,
  }))
}

//  FETCH FUTURES CLOSED POSITIONS
const fetchFuturesTrades = async (apiKey, apiSecret, symbol, options = {}) => {
  const { limit = 100, startTime, endTime } = options
  const params = { symbol: symbol.toUpperCase(), limit }
  if (startTime) params.startTime = startTime
  if (endTime)   params.endTime   = endTime

  const trades = await authFetch(BASE_FUTURES, '/fapi/v1/userTrades', params, apiKey, apiSecret)

  return trades.map(t => ({
    externalTradeId: `BNC-FUT-${t.id}`,
    symbol:          t.symbol,
    instrumentType:  'crypto_futures',
    tradeType:       t.side === 'BUY' ? 'long' : 'short',
    entryPrice:      parseFloat(t.price),
    exitPrice:       null,
    quantity:        parseFloat(t.qty),
    realizedPnl:     parseFloat(t.realizedPnl),
    commission:      parseFloat(t.commission),
    tradeDate:       new Date(t.time).toISOString(),
    positionSide:    t.positionSide,
    exchange:        'Binance Futures',
    raw:             t,
  }))
}

//  FETCH POPULAR SYMBOLS YANG PERNAH DITRADING
const detectTradedSymbols = async (apiKey, apiSecret) => {
  const popularPairs = [
    'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
    'ADAUSDT','DOGEUSDT','MATICUSDT','DOTUSDT','AVAXUSDT',
    'SHIBUSDT','LTCUSDT','LINKUSDT','UNIUSDT','ATOMUSDT',
    'NEARUSDT','ALGOUSDT','FILUSDT','TRXUSDT','ETCUSDT',
  ]

  const traded = []
  for (const sym of popularPairs) {
    try {
      const trades = await authFetch(BASE_SPOT, '/api/v3/myTrades',
        { symbol: sym, limit: 1 }, apiKey, apiSecret)
      if (trades.length > 0) traded.push(sym)
    } catch {}
    await new Promise(r => setTimeout(r, 150)) // delay untuk rate limit
  }

  return traded
}

//  IMPORT ALL — spot + futures dari semua traded symbols
const importAll = async (apiKey, apiSecret, options = {}) => {
  const { sinceDate, symbols, includeFutures = false } = options
  const startTime = sinceDate ? new Date(sinceDate).getTime() : undefined

  // Tentukan symbols
  let targetSymbols = symbols?.length > 0
    ? symbols
    : await detectTradedSymbols(apiKey, apiSecret)

  const result = { spot: [], futures: [], errors: [] }

  for (const symbol of targetSymbols) {
    try {
      const spot = await fetchSpotTrades(apiKey, apiSecret, symbol, { limit: 500, startTime })
      result.spot.push(...spot)
    } catch (err) {
      result.errors.push({ symbol, type: 'spot', error: err.message })
    }
    await new Promise(r => setTimeout(r, 200))

    if (includeFutures) {
      try {
        const futures = await fetchFuturesTrades(apiKey, apiSecret, symbol, { limit: 100, startTime })
        result.futures.push(...futures)
      } catch {}
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return {
    trades:       [...result.spot, ...result.futures],
    spotCount:    result.spot.length,
    futuresCount: result.futures.length,
    errors:       result.errors,
    symbols:      targetSymbols,
  }
}

module.exports = { testConnection, fetchSpotTrades, fetchFuturesTrades, detectTradedSymbols, importAll }
