/**
 * NEWS SERVICE — v4
 * Fix: better error handling, timeout lebih pendek, fallback jika RSS diblokir
 */

require('dotenv').config()

const cache    = new Map()
const CACHE_TTL = 5 * 60 * 1000

const setCache = (key, data) => cache.set(key, { data, ts: Date.now() })
const getCache = (key) => {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > CACHE_TTL) { cache.delete(key); return null }
  return hit.data
}

const normalize = ({
  id, title, url, source, publishedAt,
  sentiment = 'neutral', imageUrl = null,
  currencies = [], categories = [], tags = []
}) => ({ id, title, url, source, publishedAt, sentiment, imageUrl, currencies, categories, tags })

// ─── PARSE RSS XML ────────────────────────────────────────────────────────────
const parseRSS = (xml, sourceName, extraTags = []) => {
  const items = []
  const re    = /<item>([\s\S]*?)<\/item>/g
  let   match

  const getText = (block, tag) => {
    const m = block.match(new RegExp(
      `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`
    ))
    return m ? (m[1] || m[2] || '').trim().replace(/<[^>]+>/g, '') : ''
  }

  while ((match = re.exec(xml)) !== null && items.length < 20) {
    const block = match[1]
    const title = getText(block, 'title')
    if (!title || title.length < 5) continue

    const titleLow = title.toLowerCase()
    const tags     = [...extraTags]
    if (/\bcpi\b|inflation|consumer price/.test(titleLow))       tags.push('CPI')
    if (/\bnfp\b|nonfarm|non-farm|payroll/.test(titleLow))       tags.push('NFP')
    if (/powell|fed chair/.test(titleLow))                       tags.push('POWELL')
    if (/federal reserve|fomc|fed rate|interest rate/.test(titleLow)) tags.push('FED')
    if (/\bgdp\b|gross domestic/.test(titleLow))                 tags.push('GDP')
    if (/unemployment|jobless/.test(titleLow))                   tags.push('UNEMPLOYMENT')
    if (/\bgold\b|xauusd/.test(titleLow))                       tags.push('GOLD')
    if (/\bbtc\b|bitcoin/.test(titleLow))                       tags.push('BTC')
    if (/\beth\b|ethereum/.test(titleLow))                      tags.push('ETH')

    items.push(normalize({
      id:          getText(block, 'guid') || `rss_${sourceName}_${items.length}_${Date.now()}`,
      title,
      url:         getText(block, 'link'),
      source:      sourceName,
      publishedAt: getText(block, 'pubDate') || new Date().toISOString(),
      tags,
      categories:  extraTags,
    }))
  }
  return items
}

// ─── FETCH RSS dengan timeout pendek + multiple URL fallback ──────────────────
const fetchRSS = async (urls, sourceName, extraTags = []) => {
  // urls bisa string atau array (fallback URLs)
  const urlList = Array.isArray(urls) ? urls : [urls]
  const cacheKey = `rss_${urlList[0]}`
  const cached   = getCache(cacheKey)
  if (cached) return cached

  for (const url of urlList) {
    try {
      const controller = new AbortController()
      const timeout    = setTimeout(() => controller.abort(), 6000) // 6 detik timeout

      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradingJournalBot/1.0)',
          'Accept':     'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml     = await res.text()
      const results = parseRSS(xml, sourceName, extraTags)

      if (results.length > 0) {
        setCache(cacheKey, results)
        return results
      }
    } catch (err) {
      console.warn(`[RSS] ${sourceName} (${url}): ${err.message}`)
    }
  }

  console.warn(`[RSS] ${sourceName}: semua URL gagal, return []`)
  return []
}

// ─── RSS SOURCES dengan multiple fallback URLs ────────────────────────────────
const RSS_SOURCES = {
  forexlive: () => fetchRSS(
    ['https://www.forexlive.com/feed/news', 'https://www.forexlive.com/feed'],
    'ForexLive', ['macro','forex']
  ),
  fxstreet: () => fetchRSS(
    ['https://www.fxstreet.com/rss/news', 'https://www.fxstreet.com/rss'],
    'FXStreet', ['macro','forex']
  ),
  investing: () => fetchRSS(
    ['https://www.investing.com/rss/news.rss', 'https://www.investing.com/rss/news_285.rss'],
    'Investing.com', ['macro']
  ),
  marketwatch: () => fetchRSS(
    ['https://feeds.marketwatch.com/marketwatch/realtimeheadlines'],
    'MarketWatch', ['macro','stocks']
  ),
  reuters: () => fetchRSS(
    ['https://feeds.reuters.com/reuters/businessNews', 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best'],
    'Reuters', ['macro','business']
  ),
  cnbc: () => fetchRSS(
    ['https://www.cnbc.com/id/10000664/device/rss/rss.html', 'https://www.cnbc.com/id/100003114/device/rss/rss.html'],
    'CNBC', ['macro','stocks']
  ),
}

// ─── NEWSDATA.IO ──────────────────────────────────────────────────────────────
const fetchNewsDataCrypto = async ({ coin = '', sentiment = '', page = null } = {}) => {
  const apiKey = process.env.NEWSDATA_KEY
  if (!apiKey) {
    console.warn('[NEWSDATA] NEWSDATA_KEY belum di-set di .env')
    return []
  }

  const cacheKey = `ndc_${coin}_${sentiment}_${page || 'p1'}`
  const cached   = getCache(cacheKey)
  if (cached) return cached

  try {
    const params = new URLSearchParams({ apikey: apiKey, language: 'en' })
    if (coin)      params.set('coin', coin.toLowerCase())
    if (sentiment) params.set('sentiment', sentiment)
    if (page)      params.set('page', page)

    const controller = new AbortController()
    const timeout    = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(`https://newsdata.io/api/1/crypto?${params}`,
      { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const json = await res.json()
    if (json.status !== 'success') throw new Error(json.message || 'API error')

    const results = (json.results || []).map((item, idx) => normalize({
      id:          `ndc_${idx}_${Date.now()}`,
      title:       item.title,
      url:         item.link,
      source:      item.source_name || 'NewsData',
      publishedAt: item.pubDate,
      sentiment:   item.sentiment || 'neutral',
      imageUrl:    item.image_url || null,
      currencies: Array.isArray(item.coin) ? item.coin.map(c => c.toUpperCase()) : [],
      categories:  ['crypto'],
      tags:        Array.isArray(item.coin) ? item.coin.map(c => c.toUpperCase()) : [],
    }))

    setCache(cacheKey, results)
    return results
  } catch (err) {
    console.error('[NEWSDATA] Crypto error:', err.message)
    return []
  }
}

// ─── MACRO FILTER ─────────────────────────────────────────────────────────────
const MACRO_RE = /\bcpi\b|inflation|nonfarm|non-farm|payroll|\bnfp\b|powell|federal reserve|fomc|interest rate|fed rate|\bgdp\b|gross domestic|unemployment|jobless|\bpmi\b|ecb|boj|rba|boe|central bank|rate hike|rate cut/i

const filterMacro = (items) => items.filter(i => MACRO_RE.test(i.title))

// ─── PUBLIC API ───────────────────────────────────────────────────────────────
const CRYPTO_LIST = ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','MATIC','DOT',
                     'AVAX','LINK','UNI','LTC','TRX','SHIB','TON','SUI','APT','OP']

const getLatestNews = async (filter = 'all', page = null) => {
  if (filter === 'crypto')  return fetchNewsDataCrypto({ page })
  if (filter === 'bullish') return fetchNewsDataCrypto({ sentiment: 'positive', page })
  if (filter === 'bearish') return fetchNewsDataCrypto({ sentiment: 'negative', page })

  if (filter === 'macro') {
    const results = await Promise.allSettled([
      RSS_SOURCES.forexlive(),
      RSS_SOURCES.fxstreet(),
      RSS_SOURCES.investing(),
      RSS_SOURCES.reuters(),
    ])
    const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    return filterMacro(all).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  }

  if (filter === 'forex') {
    const results = await Promise.allSettled([
      RSS_SOURCES.forexlive(),
      RSS_SOURCES.fxstreet(),
      RSS_SOURCES.investing(),
    ])
    const all = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
    return all.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  }

  // all
  const results = await Promise.allSettled([
    fetchNewsDataCrypto({ page }),
    RSS_SOURCES.forexlive(),
    RSS_SOURCES.fxstreet(),
    RSS_SOURCES.investing(),
    RSS_SOURCES.marketwatch(),
  ])
  return results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
}

const getNewsForSymbol = async (symbol = '', page = null) => {
  const sym = symbol.toUpperCase().replace(/USDT|BUSD|IDR|USD$/g, '')

  if (CRYPTO_LIST.includes(sym)) {
    return fetchNewsDataCrypto({ coin: sym.toLowerCase(), page })
  }

  const keywordMap = {
    'EUR': /euro|eur\/usd|eurusd/i,
    'GBP': /pound|sterling|gbp/i,
    'JPY': /yen|jpy/i,
    'XAU': /gold|xauusd/i,
    'XAG': /silver|xagusd/i,
    'OIL': /crude oil|wti|brent/i,
    'US30': /dow jones|us30|djia/i,
    'NAS': /nasdaq|nas100/i,
    'SPX': /s&p|spx/i,
  }
  const regex = keywordMap[sym] || new RegExp(sym, 'i')

  const results = await Promise.allSettled([
    RSS_SOURCES.forexlive(),
    RSS_SOURCES.fxstreet(),
    RSS_SOURCES.investing(),
  ])
  return results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(i => regex.test(i.title))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
}

const getMacroEvents = async () => {
  const results = await Promise.allSettled([
    RSS_SOURCES.forexlive(),
    RSS_SOURCES.fxstreet(),
    RSS_SOURCES.investing(),
    RSS_SOURCES.reuters(),
    RSS_SOURCES.cnbc(),
  ])
  return results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .filter(i => MACRO_RE.test(i.title))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
}

const getSentimentSummary = async (coin = 'btc') => {
  const [positive, negative, all] = await Promise.all([
    fetchNewsDataCrypto({ coin, sentiment: 'positive' }),
    fetchNewsDataCrypto({ coin, sentiment: 'negative' }),
    fetchNewsDataCrypto({ coin }),
  ])
  const total = all.length || 1
  return {
    coin:            coin.toUpperCase(),
    positive:        positive.length,
    negative:        negative.length,
    neutral:         Math.max(0, total - positive.length - negative.length),
    total,
    score:           Math.round(((positive.length - negative.length) / total) * 100),
    latestHeadlines: all.slice(0, 5),
  }
}

const getEconomicCalendar = async () => getMacroEvents()

module.exports = {
  getLatestNews,
  getNewsForSymbol,
  getMacroEvents,
  getSentimentSummary,
  getEconomicCalendar,
  fetchNewsDataCrypto,
}
