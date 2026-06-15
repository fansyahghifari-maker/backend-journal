const prisma = require('../utils/prisma')

//  PRICE CACHE — simpan harga terbaru di memory
//  Tidak pakai Redis supaya simple, tapi bisa diganti nanti
const priceCache = new Map()
// Format: priceCache.set('BTCUSDT', { price, change24h, high24h, low24h, volume, updatedAt })

const updateCache = (symbol, data) => {
  priceCache.set(symbol.toUpperCase(), { ...data, updatedAt: Date.now() })
}

const getCache = (symbol) => priceCache.get(symbol.toUpperCase()) || null

const getAllCache = () => {
  const result = {}
  for (const [key, value] of priceCache.entries()) {
    result[key] = value
  }
  return result
}

//  FETCH HARGA DARI BINANCE REST (fallback / initial load)
const fetchBinancePrices = async (symbols) => {
  try {
    // Fetch 24hr ticker untuk semua symbols sekaligus
    const symbolsParam = JSON.stringify(symbols.map(s => s.toUpperCase()))
    const res  = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`)
    if (!res.ok) return {}

    const data = await res.json()
    const result = {}

    for (const ticker of data) {
      const priceData = {
        price:     parseFloat(ticker.lastPrice),
        change24h: parseFloat(ticker.priceChangePercent),
        high24h:   parseFloat(ticker.highPrice),
        low24h:    parseFloat(ticker.lowPrice),
        volume:    parseFloat(ticker.volume),
        source:    'binance',
      }
      updateCache(ticker.symbol, priceData)
      result[ticker.symbol] = priceData
    }
    return result
  } catch (err) {
    console.error('[PRICE] Binance REST error:', err.message)
    return {}
  }
}

//  FETCH HARGA INDODAX (crypto IDR pairs)
const fetchIndodaxPrices = async (pairs) => {
  try {
    const result = {}
    for (const pair of pairs) {
      try {
        const res  = await fetch(`https://indodax.com/api/${pair.toLowerCase()}/ticker`)
        if (!res.ok) continue
        const data = await res.json()
        const t    = data.ticker

        const priceData = {
          price:     parseFloat(t.last),
          change24h: null,
          high24h:   parseFloat(t.high),
          low24h:    parseFloat(t.low),
          volume:    parseFloat(t.vol_idr || 0),
          source:    'indodax',
        }

        const symbol = pair.toUpperCase().replace('_', '')
        updateCache(symbol, priceData)
        result[symbol] = priceData
        await new Promise(r => setTimeout(r, 100))
      } catch {}
    }
    return result
  } catch (err) {
    console.error('[PRICE] Indodax error:', err.message)
    return {}
  }
}

//  FETCH HARGA FOREX & COMMODITY (pakai CoinGecko untuk XAU)
//  dan exchangerate-api untuk forex
const fetchForexPrices = async () => {
  try {
    // CoinGecko untuk gold (XAUUSD) - gratis
    const goldRes  = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=gold&vs_currencies=usd')
    if (goldRes.ok) {
      const goldData = await goldRes.json()
      if (goldData.gold) {
        updateCache('XAUUSD', {
          price:     goldData.gold.usd,
          change24h: goldData.gold.usd_24h_change || null,
          source:    'coingecko',
        })
      }
    }

    // ExchangeRate API untuk forex pairs (gratis tier)
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD')
    if (fxRes.ok) {
      const fxData = await fxRes.json()
      const rates  = fxData.rates || {}

      const fxPairs = {
        'EURUSD': rates.EUR ? 1 / rates.EUR : null,
        'GBPUSD': rates.GBP ? 1 / rates.GBP : null,
        'USDJPY': rates.JPY || null,
        'USDCHF': rates.CHF || null,
        'AUDUSD': rates.AUD ? 1 / rates.AUD : null,
        'USDCAD': rates.CAD || null,
        'NZDUSD': rates.NZD ? 1 / rates.NZD : null,
        'USDIDR': rates.IDR || null,
      }

      for (const [symbol, price] of Object.entries(fxPairs)) {
        if (price) {
          updateCache(symbol, { price: parseFloat(price.toFixed(5)), change24h: null, source: 'exchangerate' })
        }
      }
    }
  } catch (err) {
    console.error('[PRICE] Forex fetch error:', err.message)
  }
}

//  GET PRICES — ambil dari cache atau fetch fresh
const getPrices = async (symbols) => {
  const result  = {}
  const missing = []

  for (const sym of symbols) {
    const cached = getCache(sym)
    // Cache valid 30 detik
    if (cached && Date.now() - cached.updatedAt < 30000) {
      result[sym] = cached
    } else {
      missing.push(sym)
    }
  }

  if (missing.length === 0) return result

  // Kelompokkan per source
  const cryptoUsdt   = missing.filter(s => s.endsWith('USDT') || s.endsWith('BTC'))
  const cryptoIdr    = missing.filter(s => s.endsWith('IDR'))
  const forexComm    = missing.filter(s =>
    ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','USDCAD','NZDUSD','XAUUSD','XAGUSD','USDIDR'].includes(s)
  )

  // Binance diblokir di ID, convert USDT symbols ke IDR untuk Indodax
const usdtAsIdr = cryptoUsdt.map(s => s.replace('USDT', '_idr').toLowerCase())
const allIdrPairs = [
  ...usdtAsIdr,
  ...cryptoIdr.map(s => s.replace('IDR', '_IDR').toLowerCase())
]

const indodaxPrices = allIdrPairs.length > 0 ? await fetchIndodaxPrices(allIdrPairs) : {}
const binancePrices = {}

  if (forexComm.length > 0) await fetchForexPrices()

  // Gabungkan semua hasil
  for (const sym of missing) {
    const cached = getCache(sym)
    if (cached) result[sym] = cached
  }

  return result
}

//  GET WATCHLIST PRICES — harga semua coin di watchlist user
const getWatchlistPrices = async (userId) => {
  const watchlists = await prisma.watchlist.findMany({
    where:   { userId },
    include: { items: { select: { symbol: true, symbolName: true, instrumentType: true, alertPriceHigh: true, alertPriceLow: true } } },
  })

  const allSymbols = [...new Set(watchlists.flatMap(w => w.items.map(i => i.symbol)))]
  if (allSymbols.length === 0) return { prices: {}, alerts: [] }

  const prices = await getPrices(allSymbols)

  // Cek apakah ada alert yang terpicu
  const triggeredAlerts = []
  for (const wl of watchlists) {
    for (const item of wl.items) {
      const priceData = prices[item.symbol]
      if (!priceData) continue

      const current = priceData.price
      const high    = item.alertPriceHigh ? Number(item.alertPriceHigh) : null
      const low     = item.alertPriceLow  ? Number(item.alertPriceLow)  : null

      if (high && current >= high) {
        triggeredAlerts.push({ symbol: item.symbol, type: 'high', alertPrice: high, currentPrice: current })
      }
      if (low && current <= low) {
        triggeredAlerts.push({ symbol: item.symbol, type: 'low', alertPrice: low, currentPrice: current })
      }
    }
  }

  return { prices, alerts: triggeredAlerts, symbols: allSymbols }
}

module.exports = {
  getPrices, getWatchlistPrices,
  fetchBinancePrices, fetchForexPrices,
  updateCache, getCache, getAllCache, priceCache,
}
