const ccxt = require('ccxt')

// ─── HELPER: buat client ccxt ────────────────────────────────────────────────
const makeClient = (apiKey, apiSecret) => new ccxt.tokocrypto({
  apiKey,
  secret: apiSecret,
  enableRateLimit: true,
})

// HELPER: convert 'BTCUSDT' -> 'BTC/USDT'
const QUOTES = ['USDT', 'BUSD', 'USDC', 'IDR', 'BTC', 'ETH', 'BNB']
const toCcxtSymbol = (raw) => {
  const s = raw.toUpperCase()
  if (s.includes('/')) return s
  const quote = QUOTES.find(q => s.endsWith(q) && s.length > q.length)
  if (!quote) throw { status: 400, message: `Simbol "${raw}" tidak dikenali` }
  return `${s.slice(0, s.length - quote.length)}/${quote}`
}
const fromCcxtSymbol = (symbol) => symbol.replace('/', '')

//  TEST CONNECTION
const testConnection = async (apiKey, apiSecret) => {
  const client = makeClient(apiKey, apiSecret)
  try {
    const balance = await client.fetchBalance()

    const balances = Object.keys(balance.total || {})
      .filter(asset => (balance.total[asset] || 0) > 0)
      .map(asset => ({
        asset,
        free:   balance.free?.[asset] || 0,
        locked: balance.used?.[asset] || 0,
      }))

    return {
      success:     true,
      message:     'Koneksi Tokocrypto berhasil!',
      canTrade:    balance.info?.data?.canTrade,
      balances:    balances.slice(0, 10),
      totalAssets: balances.length,
    }
  } catch (err) {
    throw { status: 400, message: `Tokocrypto: ${err.message}` }
  }
}

//  FETCH TRADE HISTORY per symbol
const fetchTrades = async (apiKey, apiSecret, symbol, options = {}) => {
  const { limit = 500, startTime, endTime } = options
  const client     = makeClient(apiKey, apiSecret)
  const ccxtSymbol = toCcxtSymbol(symbol)

  try {
    const params = {}
    if (endTime) params.endTime = endTime

    const trades = await client.fetchMyTrades(ccxtSymbol, startTime, limit, params)

    return trades.map(t => ({
      externalTradeId: `TOKO-${t.id}`,
      symbol:          fromCcxtSymbol(t.symbol),
      instrumentType:  'crypto',
      tradeType:       t.side, // 'buy' | 'sell'
      entryPrice:      t.price,
      exitPrice:       null,
      quantity:        t.amount,
      commission:      t.fee?.cost || 0,
      commissionAsset: t.fee?.currency,
      tradeDate:       new Date(t.timestamp).toISOString(),
      exchange:        'Tokocrypto',
      raw:             t.info,
    }))
  } catch (err) {
    throw { status: 400, message: `Tokocrypto: ${err.message}` }
  }
}

//  GET ACCOUNT BALANCE
const getBalance = async (apiKey, apiSecret) => {
  const client = makeClient(apiKey, apiSecret)
  const balance = await client.fetchBalance()

  return Object.keys(balance.total || {})
    .filter(asset => (balance.total[asset] || 0) > 0)
    .map(asset => ({
      asset,
      free:   balance.free?.[asset] || 0,
      locked: balance.used?.[asset] || 0,
    }))
}

//  DETECT TRADED SYMBOLS
const POPULAR_PAIRS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','MATICUSDT','LTCUSDT','LINKUSDT',
  'BTCIDR', 'ETHIDR',  'BNBIDR',  'SOLIDR',
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
  }

  return {
    trades:  allTrades,
    count:   allTrades.length,
    errors,
    symbols: targetSymbols,
  }
}

module.exports = { testConnection, fetchTrades, getBalance, detectTradedSymbols, importAll }