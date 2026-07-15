const ccxt = require('ccxt')

// ─── HELPER: buat client ccxt ────────────────────────────────────────────────
const makeClient = (apiKey, apiSecret) => new ccxt.indodax({
  apiKey,
  secret: apiSecret,
  enableRateLimit: true,
})

// HELPER: convert 'btc_idr' -> 'BTC/IDR'
const toCcxtSymbol = (pair) => {
  if (pair.includes('/')) return pair.toUpperCase()
  const [base, quote] = pair.split('_')
  if (!base || !quote) throw { status: 400, message: `Pair "${pair}" tidak valid, pakai format base_quote (mis. btc_idr)` }
  return `${base.toUpperCase()}/${quote.toUpperCase()}`
}
const fromCcxtSymbol = (symbol) => symbol.replace('/', '') // 'BTC/IDR' -> 'BTCIDR'

//  TEST CONNECTION + GET ACCOUNT INFO
const testConnection = async (apiKey, apiSecret) => {
  const client = makeClient(apiKey, apiSecret)
  try {
    const balance = await client.fetchBalance()

    const balances = Object.keys(balance.total || {})
      .filter(asset => (balance.total[asset] || 0) > 0)
      .map(asset => ({ asset: asset.toUpperCase(), amount: balance.total[asset] }))

    return {
      success:     true,
      message:     'Koneksi Indodax berhasil!',
      userId:      balance.info?.return?.user_id,
      email:       balance.info?.return?.email,
      balances:    balances.slice(0, 10),
      totalAssets: balances.length,
      serverTime:  balance.info?.return?.server_time
        ? new Date(balance.info.return.server_time * 1000).toISOString()
        : new Date().toISOString(),
    }
  } catch (err) {
    throw { status: 400, message: `Indodax: ${err.message}` }
  }
}

//  FETCH TRADE HISTORY
const fetchTradeHistory = async (apiKey, apiSecret, pair, options = {}) => {
  const { count = 100, startTime, endTime } = options
  const client     = makeClient(apiKey, apiSecret)
  const ccxtSymbol = toCcxtSymbol(pair)
  const since      = startTime ? new Date(startTime).getTime() : undefined

  try {
    const params = {}
    if (endTime) params.end = Math.floor(new Date(endTime).getTime() / 1000)

    const trades = await client.fetchMyTrades(ccxtSymbol, since, count, params)

    return trades.map(t => ({
      externalTradeId: `IDX-${t.id}`,
      symbol:          fromCcxtSymbol(t.symbol),
      instrumentType:  'crypto',
      tradeType:       t.side, // 'buy' | 'sell'
      entryPrice:      t.price,
      exitPrice:       null,
      quantity:        t.amount,
      commission:      t.fee?.cost || 0,
      tradeDate:       new Date(t.timestamp).toISOString(),
      exchange:        'Indodax',
      quoteCurrency:   ccxtSymbol.split('/')[1],
      raw:             t.info,
    }))
  } catch (err) {
    throw { status: 400, message: `Indodax: ${err.message}` }
  }
}

//  GET AVAILABLE PAIRS (public, tidak perlu API key)
const getAvailablePairs = async () => {
  const client = new ccxt.indodax({ enableRateLimit: true })
  const markets = await client.loadMarkets()

  return Object.values(markets).map(m => ({
    id:          m.id,
    symbol:      fromCcxtSymbol(m.symbol),
    description: `${m.base}/${m.quote}`,
    baseAsset:   m.base,
    quoteAsset:  m.quote,
    minPrice:    m.limits?.price?.min,
    minAmount:   m.limits?.amount?.min,
  }))
}

//  FETCH OPEN ORDERS
const fetchOpenOrders = async (apiKey, apiSecret, pair) => {
  const client     = makeClient(apiKey, apiSecret)
  const ccxtSymbol = toCcxtSymbol(pair)

  try {
    const orders = await client.fetchOpenOrders(ccxtSymbol)

    return orders.map(o => ({
      externalTradeId: `IDX-ORD-${o.id}`,
      symbol:          fromCcxtSymbol(ccxtSymbol),
      instrumentType:  'crypto',
      tradeType:       o.side,
      entryPrice:      o.price,
      quantity:        o.remaining,
      status:          'open',
      tradeDate:       new Date(o.timestamp).toISOString(),
      exchange:        'Indodax',
      raw:             o.info,
    }))
  } catch (err) {
    throw { status: 400, message: `Indodax: ${err.message}` }
  }
}

//  IMPORT ALL TRADES dari semua pair
const importAll = async (apiKey, apiSecret, options = {}) => {
  const { sinceDate, pairs } = options

  // Pair IDR yang populer di Indodax
  const popularPairs = pairs?.length > 0 ? pairs : [
    'btc_idr', 'eth_idr', 'bnb_idr', 'sol_idr', 'xrp_idr',
    'ada_idr', 'doge_idr', 'matic_idr', 'dot_idr', 'ltc_idr',
    'link_idr', 'uni_idr', 'trx_idr', 'etc_idr', 'shib_idr',
  ]

  const allTrades = []
  const errors    = []

  for (const pair of popularPairs) {
    try {
      const trades = await fetchTradeHistory(apiKey, apiSecret, pair, {
        count:     100,
        startTime: sinceDate,
      })
      allTrades.push(...trades)
    } catch (err) {
      if (!err.message?.includes('insufficient')) {
        errors.push({ pair, error: err.message })
      }
    }
  }

  return {
    trades: allTrades,
    count:  allTrades.length,
    errors,
    pairs:  popularPairs,
  }
}

module.exports = { testConnection, fetchTradeHistory, getAvailablePairs, fetchOpenOrders, importAll }