const ccxt = require('ccxt')

// ─── HELPER: buat client ccxt ────────────────────────────────────────────────
// futures = true -> pakai defaultType 'future' (Binance USD-M Futures)
const makeClient = (apiKey, apiSecret, { futures = false } = {}) => {
  return new ccxt.binance({
    apiKey,
    secret: apiSecret,
    enableRateLimit: true, // ccxt otomatis atur delay antar request sesuai limit exchange
    options: { defaultType: futures ? 'future' : 'spot' },
  })
}

// HELPER: convert 'BTCUSDT' -> 'BTC/USDT' (ccxt pakai unified symbol pakai slash)
const QUOTES = ['USDT', 'BUSD', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB', 'IDR', 'TRY', 'EUR', 'GBP']
const toCcxtSymbol = (raw) => {
  const s = raw.toUpperCase()
  if (s.includes('/')) return s
  const quote = QUOTES.find(q => s.endsWith(q) && s.length > q.length)
  if (!quote) throw { status: 400, message: `Simbol "${raw}" tidak dikenali` }
  return `${s.slice(0, s.length - quote.length)}/${quote}`
}
const fromCcxtSymbol = (symbol) => symbol.replace('/', '').replace(/:.*$/, '') // buang :USDT suffix futures kalau ada

//  TEST CONNECTION
const testConnection = async (apiKey, apiSecret) => {
  const client = makeClient(apiKey, apiSecret)
  try {
    const balance = await client.fetchBalance()

    const balances = Object.keys(balance.total || {})
      .filter(asset => (balance.total[asset] || 0) > 0)
      .map(asset => ({
        asset,
        free:   balance.free?.[asset]  || 0,
        locked: balance.used?.[asset]  || 0,
      }))

    return {
      success:     true,
      message:     'Koneksi Binance berhasil!',
      accountType: balance.info?.accountType,
      canTrade:    balance.info?.canTrade,
      balances:    balances.slice(0, 10),
      totalAssets: balances.length,
    }
  } catch (err) {
    throw { status: 400, message: `Binance error: ${err.message}` }
  }
}

// ─── SPOT ────────────────────────────────────────────────────────────────────
// Binance Spot: startTime-endTime max 24 JAM per request kalau pakai range
// Kita loop per hari untuk cover range panjang
const fetchSpotTrades = async (apiKey, apiSecret, symbol, options = {}) => {
  const { limit = 1000, startTime, endTime } = options
  const client       = makeClient(apiKey, apiSecret)
  const ccxtSymbol   = toCcxtSymbol(symbol)

  // Kalau tidak ada range waktu, langsung fetch (dapat trade terbaru)
  if (!startTime) {
    try {
      const trades = await client.fetchMyTrades(ccxtSymbol, undefined, limit)
      return mapSpotTrades(trades)
    } catch (err) {
      throw { status: 400, message: `Binance error: ${err.message}` }
    }
  }

  // Loop per 24 jam (batasan Binance untuk query startTime+endTime)
  const MS_24H    = 24 * 60 * 60 * 1000
  const rangeEnd  = endTime || Date.now()
  let cursor      = startTime
  const allTrades = []

  while (cursor < rangeEnd) {
    const chunkEnd = Math.min(cursor + MS_24H - 1, rangeEnd)
    try {
      const trades = await client.fetchMyTrades(ccxtSymbol, cursor, 1000, { endTime: chunkEnd })
      allTrades.push(...trades)
    } catch (err) {
      console.warn(`[SPOT] chunk ${new Date(cursor).toISOString()} error: ${err.message}`)
    }
    cursor = chunkEnd + 1
    // enableRateLimit di ccxt sudah handle delay, tidak perlu setTimeout manual
  }

  return mapSpotTrades(allTrades)
}

const mapSpotTrades = (trades) => trades.map(t => ({
  externalTradeId: `BNC-SPOT-${t.id}`,
  symbol:          fromCcxtSymbol(t.symbol),
  instrumentType:  'crypto',
  tradeType:       t.side, // 'buy' | 'sell'
  entryPrice:      t.price,
  exitPrice:       null,
  quantity:        t.amount,
  commission:      t.fee?.cost || 0,
  commissionAsset: t.fee?.currency,
  tradeDate:       new Date(t.timestamp).toISOString(),
  isMaker:         t.takerOrMaker === 'maker',
  exchange:        'Binance Spot',
  raw:             t.info,
}))

// ─── FUTURES ─────────────────────────────────────────────────────────────────
// Binance Futures:
//   - Hanya bisa query 6 BULAN terakhir
//   - startTime-endTime max 7 HARI per request
//   - Kalau tidak ada range: dapat trade terbaru
const fetchFuturesTrades = async (apiKey, apiSecret, symbol, options = {}) => {
  const MS_6_MONTHS = 6 * 30 * 24 * 60 * 60 * 1000
  const MS_7_DAYS   = 7  * 24 * 60 * 60 * 1000
  const now         = Date.now()

  const client     = makeClient(apiKey, apiSecret, { futures: true })
  const ccxtSymbol = toCcxtSymbol(symbol)

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
    try {
      const trades = await client.fetchMyTrades(ccxtSymbol, cursor, 1000, { endTime: chunkEnd })
      allTrades.push(...trades)
    } catch (err) {
      console.warn(`[FUTURES] chunk ${new Date(cursor).toISOString()} error: ${err.message}`)
    }
    cursor = chunkEnd + 1
  }

  return mapFuturesTrades(allTrades)
}

const mapFuturesTrades = (trades) => trades.map(t => ({
  externalTradeId: `BNC-FUT-${t.id}`,
  symbol:          fromCcxtSymbol(t.symbol),
  instrumentType:  'crypto_futures',
  tradeType:       t.side === 'buy' ? 'long' : 'short',
  entryPrice:      t.price,
  exitPrice:       null,
  quantity:        t.amount,
  realizedPnl:     parseFloat(t.info?.realizedPnl || 0),
  commission:      t.fee?.cost || 0,
  tradeDate:       new Date(t.timestamp).toISOString(),
  positionSide:    t.info?.positionSide, // BOTH / LONG / SHORT (hedge mode)
  exchange:        'Binance Futures',
  raw:             t.info,
}))

// ─── AUTO-DETECT TRADED SYMBOLS ──────────────────────────────────────────────
const POPULAR_PAIRS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','MATICUSDT','DOTUSDT','AVAXUSDT',
  'SHIBUSDT','LTCUSDT','LINKUSDT','UNIUSDT','ATOMUSDT',
  'NEARUSDT','ALGOUSDT','FILUSDT','TRXUSDT','ETCUSDT',
  'WLDUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
  'APTUSDT','TIAUSDT','SEIUSDT','STXUSDT','RUNEUSDT',
]

const detectTradedSymbols = async (apiKey, apiSecret) => {
  const client = makeClient(apiKey, apiSecret)
  const traded = []

  for (const sym of POPULAR_PAIRS) {
    try {
      const trades = await client.fetchMyTrades(toCcxtSymbol(sym), undefined, 1)
      if (trades.length > 0) traded.push(sym)
    } catch {}
  }

  return traded
}

// Auto-detect untuk futures — cek dari account positions
const detectFuturesSymbols = async (apiKey, apiSecret) => {
  const client = makeClient(apiKey, apiSecret, { futures: true })
  try {
    const positions = await client.fetchPositions()
    return positions
      .filter(p => (p.contracts && p.contracts > 0) || (p.entryPrice && p.entryPrice > 0))
      .map(p => fromCcxtSymbol(p.symbol))
  } catch (err) {
    console.warn('[FUTURES] detectFuturesSymbols gagal, pakai popular list:', err.message)
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
  }

  // ── FUTURES ──
  if (includeFutures) {
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