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

// ─── SPOT ────────────────────────────────────────────────────────────────────
// Binance Spot: startTime-endTime max 24 JAM per request
// Kita loop per hari untuk cover range panjang
const fetchSpotTrades = async (apiKey, apiSecret, symbol, options = {}) => {
  const { limit = 1000, startTime, endTime } = options

  // Kalau tidak ada range waktu, langsung fetch (dapat 500 trade terbaru)
  if (!startTime) {
    const params = { symbol: symbol.toUpperCase(), limit }
    const trades = await authFetch(BASE_SPOT, '/api/v3/myTrades', params, apiKey, apiSecret)
    return mapSpotTrades(trades)
  }

  // Loop per 24 jam (Binance limit)
  const MS_24H   = 24 * 60 * 60 * 1000
  const rangeEnd = endTime || Date.now()
  let cursor     = startTime
  const allTrades = []

  while (cursor < rangeEnd) {
    const chunkEnd = Math.min(cursor + MS_24H - 1, rangeEnd)
    const params   = {
      symbol:    symbol.toUpperCase(),
      limit:     1000,
      startTime: cursor,
      endTime:   chunkEnd,
    }
    try {
      const trades = await authFetch(BASE_SPOT, '/api/v3/myTrades', params, apiKey, apiSecret)
      allTrades.push(...trades)
    } catch (err) {
      // Log tapi jangan stop loop
      console.warn(`[SPOT] chunk ${new Date(cursor).toISOString()} error: ${err.message}`)
    }
    cursor = chunkEnd + 1
    await new Promise(r => setTimeout(r, 200)) // rate limit delay
  }

  return mapSpotTrades(allTrades)
}

const mapSpotTrades = (trades) => trades.map(t => ({
  externalTradeId: `BNC-SPOT-${t.id}`,
  symbol:          t.symbol,
  instrumentType:  'crypto',
  tradeType:       t.isBuyer ? 'buy' : 'sell',
  entryPrice:      parseFloat(t.price),
  exitPrice:       null,
  quantity:        parseFloat(t.qty),
  commission:      parseFloat(t.commission),
  commissionAsset: t.commissionAsset,
  tradeDate:       new Date(t.time).toISOString(),
  isMaker:         t.isMaker,
  exchange:        'Binance Spot',
  raw:             t,
}))

// ─── FUTURES ─────────────────────────────────────────────────────────────────
// Binance Futures: 
//   - Hanya bisa query 6 BULAN terakhir
//   - startTime-endTime max 7 HARI per request
//   - Kalau tidak ada range: dapat 7 hari terakhir
const fetchFuturesTrades = async (apiKey, apiSecret, symbol, options = {}) => {
  const MS_6_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000
  const MS_7_DAYS   = 7  * 24 * 60 * 60 * 1000
  const now         = Date.now()

  // Clamp startTime — Binance hanya support 6 bulan terakhir
  let startTime = options.startTime
  if (!startTime || (now - startTime) > MS_6_MONTHS) {
    startTime = now - MS_6_MONTHS
    console.warn(`[FUTURES] startTime di-clamp ke 6 bulan terakhir: ${new Date(startTime).toISOString()}`)
  }

  const rangeEnd  = options.endTime || now
  let cursor      = startTime
  const allTrades = []

  // Loop per 7 hari
  while (cursor < rangeEnd) {
    const chunkEnd = Math.min(cursor + MS_7_DAYS - 1, rangeEnd)
    const params   = {
      symbol:    symbol.toUpperCase(),
      limit:     1000,
      startTime: cursor,
      endTime:   chunkEnd,
    }
    try {
      const trades = await authFetch(BASE_FUTURES, '/fapi/v1/userTrades', params, apiKey, apiSecret)
      allTrades.push(...trades)
    } catch (err) {
      console.warn(`[FUTURES] chunk ${new Date(cursor).toISOString()} error: ${err.message}`)
    }
    cursor = chunkEnd + 1
    await new Promise(r => setTimeout(r, 200))
  }

  return mapFuturesTrades(allTrades)
}

const mapFuturesTrades = (trades) => trades.map(t => ({
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
  positionSide:    t.positionSide, // BOTH / LONG / SHORT (hedge mode)
  exchange:        'Binance Futures',
  raw:             t,
}))

// ─── AUTO-DETECT TRADED SYMBOLS ──────────────────────────────────────────────
const detectTradedSymbols = async (apiKey, apiSecret) => {
  const popularPairs = [
    'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
    'ADAUSDT','DOGEUSDT','MATICUSDT','DOTUSDT','AVAXUSDT',
    'SHIBUSDT','LTCUSDT','LINKUSDT','UNIUSDT','ATOMUSDT',
    'NEARUSDT','ALGOUSDT','FILUSDT','TRXUSDT','ETCUSDT',
    'WLDUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
    'APTUSDT','TIAUSDT','SEIUSDT','STXUSDT','RUNEUSDT',
  ]

  const traded = []
  for (const sym of popularPairs) {
    try {
      const trades = await authFetch(BASE_SPOT, '/api/v3/myTrades',
        { symbol: sym, limit: 1 }, apiKey, apiSecret)
      if (trades.length > 0) traded.push(sym)
    } catch {}
    await new Promise(r => setTimeout(r, 150))
  }

  return traded
}

// Auto-detect untuk futures — cek dari account positions
const detectFuturesSymbols = async (apiKey, apiSecret) => {
  try {
    // Ambil semua position dari account (termasuk yang sudah closed tapi masih punya history)
    const account = await authFetch(BASE_FUTURES, '/fapi/v2/account', {}, apiKey, apiSecret)
    const positions = account.positions || []
    // Ambil symbol yang pernah punya entry price (pernah di-trade)
    return positions
      .filter(p => parseFloat(p.entryPrice) > 0 || parseFloat(p.positionAmt) !== 0)
      .map(p => p.symbol)
  } catch (err) {
    console.warn('[FUTURES] detectFuturesSymbols gagal, pakai popular list:', err.message)
    // Fallback ke popular list
    return ['BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
            'ADAUSDT','DOGEUSDT','LINKUSDT','AVAXUSDT','ARBUSDT']
  }
}

// ─── IMPORT ALL ───────────────────────────────────────────────────────────────
const importAll = async (apiKey, apiSecret, options = {}) => {
  const { sinceDate, symbols, includeFutures = false } = options
  const startTime = sinceDate ? new Date(sinceDate).getTime() : undefined

  // Spot symbols
  let spotSymbols = symbols?.length > 0
    ? symbols
    : await detectTradedSymbols(apiKey, apiSecret)

  const result = { spot: [], futures: [], errors: [] }

  // ── SPOT ──
  for (const symbol of spotSymbols) {
    try {
      const spot = await fetchSpotTrades(apiKey, apiSecret, symbol, { startTime })
      result.spot.push(...spot)
    } catch (err) {
      result.errors.push({ symbol, type: 'spot', error: err.message })
    }
    // delay sudah ada di dalam fetchSpotTrades
  }

  // ── FUTURES ──
  if (includeFutures) {
    // Kalau user tidak kasih symbols khusus, auto-detect dari account futures
    let futSymbols = symbols?.length > 0
      ? symbols
      : await detectFuturesSymbols(apiKey, apiSecret)

    for (const symbol of futSymbols) {
      try {
        const futures = await fetchFuturesTrades(apiKey, apiSecret, symbol, { startTime })
        result.futures.push(...futures)
      } catch (err) {
        result.errors.push({ symbol, type: 'futures', error: err.message })
      }
    }
  }

  return {
    trades:       [...result.spot, ...result.futures],
    spotCount:    result.spot.length,
    futuresCount: result.futures.length,
    errors:       result.errors,
    symbols:      spotSymbols,
  }
}

module.exports = { testConnection, fetchSpotTrades, fetchFuturesTrades, detectTradedSymbols, detectFuturesSymbols, importAll }