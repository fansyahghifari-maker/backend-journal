const crypto = require('crypto')

const BASE_URL    = 'https://indodax.com'
const BASE_PUBLIC = 'https://indodax.com/api'

// HELPER: signed POST request
const indodaxPost = async (method, params, apiKey, apiSecret) => {
  const nonce     = Date.now()
  const body      = new URLSearchParams({ method, nonce, ...params }).toString()
  const signature = crypto.createHmac('sha512', apiSecret).update(body).digest('hex')

  const res = await fetch(`${BASE_URL}/tapi`, {
    method:  'POST',
    headers: {
      'Key':          apiKey,
      'Sign':         signature,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = await res.json()
  if (!data.success) throw { status: 400, message: `Indodax: ${data.error || 'Request gagal'}` }
  return data.return
}

//  TEST CONNECTION + GET ACCOUNT INFO
const testConnection = async (apiKey, apiSecret) => {
  const data = await indodaxPost('getInfo', {}, apiKey, apiSecret)

  // Ambil balance yang tidak nol
  const balances = Object.entries(data.balance || {})
    .filter(([, v]) => parseFloat(v) > 0)
    .map(([asset, amount]) => ({ asset: asset.toUpperCase(), amount: parseFloat(amount) }))

  return {
    success:       true,
    message:       'Koneksi Indodax berhasil!',
    userId:        data.user_id,
    email:         data.email,
    balances:      balances.slice(0, 10),
    totalAssets:   balances.length,
    serverTime:    new Date(data.server_time * 1000).toISOString(),
  }
}

//  FETCH TRADE HISTORY
const fetchTradeHistory = async (apiKey, apiSecret, pair, options = {}) => {
  const { count = 100, startTime, endTime } = options
  const params = { pair: pair.toLowerCase(), count }
  if (startTime) params.since = Math.floor(new Date(startTime).getTime() / 1000)
  if (endTime)   params.end   = Math.floor(new Date(endTime).getTime() / 1000)

  const data = await indodaxPost('tradeHistory', params, apiKey, apiSecret)

  const trades = data.trades || []
  return trades.map(t => ({
    externalTradeId: `IDX-${t.trade_id}`,
    symbol:          pair.toUpperCase().replace('_', ''),
    instrumentType:  'crypto',
    tradeType:       t.type === 'buy' ? 'buy' : 'sell',
    entryPrice:      parseFloat(t.price),
    exitPrice:       null,
    quantity:        parseFloat(t.amount),
    commission:      parseFloat(t.fee) || 0,
    tradeDate:       new Date(t.trade_time * 1000).toISOString(),
    exchange:        'Indodax',
    quoteCurrency:   pair.split('_')[1]?.toUpperCase() || 'IDR',
    raw:             t,
  }))
}

//  GET AVAILABLE PAIRS
const getAvailablePairs = async () => {
  const res  = await fetch(`${BASE_PUBLIC}/pairs`)
  const data = await res.json()
  return data.map(p => ({
    id:          p.id,
    symbol:      p.id.toUpperCase(),
    description: p.description,
    baseAsset:   p.base_currency.toUpperCase(),
    quoteAsset:  p.traded_currency.toUpperCase(),
    minPrice:    p.trade_min_base_currency,
    minAmount:   p.trade_min_traded_currency,
  }))
}

//  FETCH OPEN ORDERS
const fetchOpenOrders = async (apiKey, apiSecret, pair) => {
  const data   = await indodaxPost('openOrders', { pair: pair.toLowerCase() }, apiKey, apiSecret)
  const orders = data.orders || []

  return orders.map(o => ({
    externalTradeId: `IDX-ORD-${o.order_id}`,
    symbol:          pair.toUpperCase().replace('_', ''),
    instrumentType:  'crypto',
    tradeType:       o.type === 'buy' ? 'buy' : 'sell',
    entryPrice:      parseFloat(o.price),
    quantity:        parseFloat(o.remain_amount),
    status:          'open',
    tradeDate:       new Date(o.submit_time * 1000).toISOString(),
    exchange:        'Indodax',
    raw:             o,
  }))
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
    await new Promise(r => setTimeout(r, 300)) // delay untuk rate limit Indodax
  }

  return {
    trades: allTrades,
    count:  allTrades.length,
    errors,
    pairs:  popularPairs,
  }
}

module.exports = { testConnection, fetchTradeHistory, getAvailablePairs, fetchOpenOrders, importAll }
