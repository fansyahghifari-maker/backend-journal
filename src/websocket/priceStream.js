const { WebSocketServer, WebSocket } = require('ws')
const prisma = require('../utils/prisma')


//  PRICE CACHE — harga terbaru semua instrumen di memory
//  Format: { 'BTCUSDT': { price, change24h, high24h, low24h, volume, updatedAt } }
const priceCache = new Map()

//  CLIENT REGISTRY — track siapa subscribe instrumen apa
//  Format: Map<wsClient, Set<symbol>>
const clientSubscriptions = new Map()

//  BINANCE WEBSOCKET — harga crypto realtime
class BinancePriceStream {
  constructor() {
    this.ws         = null
    this.symbols    = new Set()
    this.reconnectDelay = 3000
    this.isRunning  = false
  }

  // Tambah symbol ke stream
  addSymbol(symbol) {
    const sym = symbol.toUpperCase()
    if (!this.symbols.has(sym)) {
      this.symbols.add(sym)
      this.restart() // restart stream dengan symbol baru
    }
  }

  // Hapus symbol dari stream
  removeSymbol(symbol) {
    this.symbols.delete(symbol.toUpperCase())
    if (this.symbols.size > 0) this.restart()
    else this.stop()
  }

  // Build stream URL — multi ticker
  buildStreamUrl() {
    const streams = [...this.symbols]
      .map(s => `${s.toLowerCase()}@ticker`)
      .join('/')
    return `wss://stream.binance.com:9443/stream?streams=${streams}`
  }

  start(symbols = []) {
    symbols.forEach(s => this.symbols.add(s.toUpperCase()))
    if (this.symbols.size === 0) return
    this._connect()
  }

  _connect() {
    if (this.ws) {
      this.ws.terminate()
      this.ws = null
    }

    const url = this.buildStreamUrl()
    console.log(`[WS-Binance] Connecting to ${this.symbols.size} symbols...`)

    this.ws = new WebSocket(url)
    this.isRunning = true

    this.ws.on('open', () => {
      console.log(`[WS-Binance] ✅ Connected — streaming ${this.symbols.size} symbols`)
    })

    this.ws.on('message', (raw) => {
      try {
        const msg  = JSON.parse(raw)
        const data = msg.data || msg

        const symbol = data.s  // e.g. "BTCUSDT"
        const price  = {
          symbol,
          price:     parseFloat(data.c),   // current price
          change24h: parseFloat(data.P),   // 24h price change %
          high24h:   parseFloat(data.h),   // 24h high
          low24h:    parseFloat(data.l),   // 24h low
          volume:    parseFloat(data.v),   // 24h volume
          quoteVolume: parseFloat(data.q), // 24h quote volume
          updatedAt: Date.now(),
          source:    'binance',
        }

        // Update cache
        priceCache.set(symbol, price)

        // Broadcast ke semua client yang subscribe symbol ini
        broadcastPrice(symbol, price)

        // Cek alert
        checkAlerts(symbol, price.price)

      } catch (err) {
        console.error('[WS-Binance] Parse error:', err.message)
      }
    })

    this.ws.on('error', (err) => {
      console.error('[WS-Binance] Error:', err.message)
    })

    this.ws.on('close', () => {
      if (this.isRunning) {
        console.log(`[WS-Binance] Disconnected. Reconnecting in ${this.reconnectDelay}ms...`)
        setTimeout(() => this._connect(), this.reconnectDelay)
      }
    })

    // Ping setiap 30 detik agar koneksi tidak drop
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping()
      }
    }, 30000)
  }

  restart() {
    if (this.pingInterval) clearInterval(this.pingInterval)
    setTimeout(() => this._connect(), 500)
  }

  stop() {
    this.isRunning = false
    if (this.pingInterval) clearInterval(this.pingInterval)
    if (this.ws) { this.ws.terminate(); this.ws = null }
    console.log('[WS-Binance] Stopped.')
  }
}

//  FOREX/COMMODITY PRICE POLLER
//  Poll harga forex, XAU, indeks setiap N detik
//  Pakai CoinGecko untuk crypto fallback, dan Open Exchange Rates / exchangerate-api untuk forex
class ForexPricePoller {
  constructor() {
    this.interval   = null
    this.symbols    = new Set()
    this.pollMs     = 10000 // 10 detik
  }

  addSymbol(symbol) {
    this.symbols.add(symbol.toUpperCase())
  }

  start() {
    if (this.interval) return
    this.interval = setInterval(() => this._poll(), this.pollMs)
    console.log('[POLLER-Forex] Started polling forex/commodity prices')
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null }
  }

  async _poll() {
    if (this.symbols.size === 0) return

    try {
      await this._pollForex()
      await this._pollCommodities()
    } catch (err) {
      console.error('[POLLER-Forex] Poll error:', err.message)
    }
  }

  // Poll forex rates pakai exchangerate-api (free tier)
  async _pollForex() {
    const forexSymbols = [...this.symbols].filter(s =>
      ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','USDCAD','NZDUSD',
       'EURGBP','EURJPY','GBPJPY','USDIDR'].includes(s)
    )
    if (forexSymbols.length === 0) return

    const apiKey = process.env.EXCHANGE_RATE_API_KEY
    const baseUrl = apiKey
      ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
      : 'https://open.er-api.com/v6/latest/USD' // free tier tanpa key

    const res  = await fetch(baseUrl)
    const data = await res.json()
    if (!data.rates) return

    const usdRates = data.rates

    // Convert ke pair format
    const pairMap = {
      'EURUSD': 1 / (usdRates.EUR || 1),
      'GBPUSD': 1 / (usdRates.GBP || 1),
      'USDJPY': usdRates.JPY || 0,
      'USDCHF': usdRates.CHF || 0,
      'AUDUSD': 1 / (usdRates.AUD || 1),
      'USDCAD': usdRates.CAD || 0,
      'NZDUSD': 1 / (usdRates.NZD || 1),
      'EURGBP': (usdRates.GBP || 1) / (usdRates.EUR || 1),
      'EURJPY': (usdRates.JPY || 1) / (usdRates.EUR || 1),
      'GBPJPY': (usdRates.JPY || 1) / (usdRates.GBP || 1),
      'USDIDR': usdRates.IDR || 0,
    }

    forexSymbols.forEach(sym => {
      if (pairMap[sym]) {
        const price = {
          symbol:    sym,
          price:     parseFloat(pairMap[sym].toFixed(5)),
          change24h: 0, // free tier tidak ada change data
          updatedAt: Date.now(),
          source:    'exchangerate-api',
        }
        priceCache.set(sym, price)
        broadcastPrice(sym, price)
        checkAlerts(sym, price.price)
      }
    })
  }

  // Poll commodity prices (XAU, XAG, Oil)
  async _pollCommodities() {
    const commSymbols = [...this.symbols].filter(s =>
      ['XAUUSD','XAGUSD','XPTUSD','USOIL','UKOIL'].includes(s)
    )
    if (commSymbols.length === 0) return

    try {
      // Metals.live API (free) untuk XAU, XAG
      const res  = await fetch('https://metals.live/api/spot')
      const data = await res.json()

      const metalMap = {
        'XAUUSD': data.gold,
        'XAGUSD': data.silver,
        'XPTUSD': data.platinum,
      }

      commSymbols.forEach(sym => {
        if (metalMap[sym] !== undefined) {
          const price = {
            symbol:    sym,
            price:     parseFloat(metalMap[sym]),
            change24h: 0,
            updatedAt: Date.now(),
            source:    'metals.live',
          }
          priceCache.set(sym, price)
          broadcastPrice(sym, price)
          checkAlerts(sym, price.price)
        }
      })
    } catch {
      // Fallback: pakai CoinGecko untuk metals
    }
  }
}


//  BROADCAST — kirim harga ke semua client yang subscribe
const broadcastPrice = (symbol, priceData) => {
  const message = JSON.stringify({
    type:   'price_update',
    symbol,
    data:   priceData,
  })

  clientSubscriptions.forEach((symbols, ws) => {
    if (symbols.has(symbol) && ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  })
}

//  CHECK ALERTS — cek price alert untuk semua user
const alertCooldowns = new Map() // cegah alert spam per item

const checkAlerts = async (symbol, currentPrice) => {
  try {
    const items = await prisma.watchlistItem.findMany({
      where: {
        symbol,
        OR: [
          { alertPriceHigh: { not: null } },
          { alertPriceLow:  { not: null } },
        ],
      },
      include: {
        watchlist: { select: { userId: true, name: true } },
      },
    })

    for (const item of items) {
      const cooldownKey = `${item.id}-${Math.floor(Date.now() / (10 * 60 * 1000))}` // cooldown 10 menit
      if (alertCooldowns.has(cooldownKey)) continue

      const high = item.alertPriceHigh ? Number(item.alertPriceHigh) : null
      const low  = item.alertPriceLow  ? Number(item.alertPriceLow)  : null

      if (high && currentPrice >= high) {
        alertCooldowns.set(cooldownKey, true)
        await prisma.notification.create({
          data: {
            userId:  item.watchlist.userId,
            type:    'price_alert_high',
            title:   `🚀 ${symbol} mencapai target!`,
            message: `${symbol} sekarang $${currentPrice.toLocaleString()} — menyentuh alert HIGH $${high.toLocaleString()} kamu.`,
            data:    { symbol, alertPrice: high, currentPrice, alertType: 'high' },
          },
        })

        // Broadcast alert ke client user tersebut
        broadcastToUser(item.watchlist.userId, {
          type:    'price_alert',
          symbol,
          alertType: 'high',
          alertPrice: high,
          currentPrice,
          message: `🚀 ${symbol} menyentuh $${currentPrice.toLocaleString()}!`,
        })
      }

      if (low && currentPrice <= low) {
        alertCooldowns.set(cooldownKey + '-low', true)
        await prisma.notification.create({
          data: {
            userId:  item.watchlist.userId,
            type:    'price_alert_low',
            title:   `📉 ${symbol} menyentuh harga rendah!`,
            message: `${symbol} sekarang $${currentPrice.toLocaleString()} — menyentuh alert LOW $${low.toLocaleString()} kamu.`,
            data:    { symbol, alertPrice: low, currentPrice, alertType: 'low' },
          },
        })

        broadcastToUser(item.watchlist.userId, {
          type:    'price_alert',
          symbol,
          alertType: 'low',
          alertPrice: low,
          currentPrice,
          message: `📉 ${symbol} menyentuh $${currentPrice.toLocaleString()}!`,
        })
      }
    }

    // Bersihkan cooldown lama
    if (alertCooldowns.size > 10000) alertCooldowns.clear()

  } catch (err) {
    console.error('[ALERT] checkAlerts error:', err.message)
  }
}

//  BROADCAST KE USER SPESIFIK
const userConnections = new Map() // Map<userId, Set<wsClient>>

const broadcastToUser = (userId, data) => {
  const connections = userConnections.get(userId)
  if (!connections) return

  const message = JSON.stringify(data)
  connections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(message)
  })
}

//  INIT WEBSOCKET SERVER — dipanggil dari index.js
const binanceStream = new BinancePriceStream()
const forexPoller   = new ForexPricePoller()

const initWebSocketServer = (server) => {
  const wss = new WebSocketServer({ server, path: '/ws/prices' })

  console.log('🔌 WebSocket server initialized at /ws/prices')

  wss.on('connection', async (ws, req) => {
    // Extract userId dari query param token (JWT)
    let userId = null
    try {
      const url    = new URL(req.url, 'http://localhost')
      const token  = url.searchParams.get('token')
      if (token) {
        const { verifyAccessToken } = require('../utils/jwt')
        const decoded = verifyAccessToken(token)
        userId = decoded.sub
      }
    } catch {}

    console.log(`[WS] Client connected. userId: ${userId || 'anonymous'}`)

    // Register client
    clientSubscriptions.set(ws, new Set())

    if (userId) {
      if (!userConnections.has(userId)) userConnections.set(userId, new Set())
      userConnections.get(userId).add(ws)
    }

    // Kirim harga cache yang ada langsung saat connect
    ws.send(JSON.stringify({
      type:    'connected',
      message: 'WebSocket terhubung. Kirim subscribe message untuk mulai terima harga.',
      cachedSymbols: [...priceCache.keys()],
    }))

    // Handle pesan dari client 
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw)

        switch (msg.type) {

          // Subscribe ke symbol tertentu
          case 'subscribe': {
            const symbols = Array.isArray(msg.symbols) ? msg.symbols : [msg.symbol]
            const subSet  = clientSubscriptions.get(ws) || new Set()

            for (const sym of symbols) {
              const upperSym = sym.toUpperCase()
              subSet.add(upperSym)

              // Cari instrument type di cache atau DB
              const instrument = await prisma.instrument.findFirst({
                where: { symbol: upperSym },
                select: { type: true },
              })

              const isCrypto = !instrument || instrument.type === 'crypto' || instrument.type === 'crypto_futures'

              if (isCrypto) {
                binanceStream.addSymbol(upperSym)
              } else {
                forexPoller.addSymbol(upperSym)
                forexPoller.start()
              }

              // Kirim harga cache langsung kalau ada
              if (priceCache.has(upperSym)) {
                ws.send(JSON.stringify({
                  type:   'price_update',
                  symbol: upperSym,
                  data:   priceCache.get(upperSym),
                }))
              }
            }

            clientSubscriptions.set(ws, subSet)
            ws.send(JSON.stringify({ type: 'subscribed', symbols }))
            break
          }

          // Subscribe ke semua watchlist user
          case 'subscribe_watchlist': {
            if (!userId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Login diperlukan untuk subscribe watchlist.' }))
              break
            }

            const items = await prisma.watchlistItem.findMany({
              where:  { watchlist: { userId } },
              select: { symbol: true, instrumentType: true },
            })

            const subSet = clientSubscriptions.get(ws) || new Set()
            for (const item of items) {
              subSet.add(item.symbol)
              const isCrypto = item.instrumentType === 'crypto' || item.instrumentType === 'crypto_futures'
              if (isCrypto) binanceStream.addSymbol(item.symbol)
              else { forexPoller.addSymbol(item.symbol); forexPoller.start() }

              if (priceCache.has(item.symbol)) {
                ws.send(JSON.stringify({
                  type:   'price_update',
                  symbol: item.symbol,
                  data:   priceCache.get(item.symbol),
                }))
              }
            }

            clientSubscriptions.set(ws, subSet)
            ws.send(JSON.stringify({
              type:    'subscribed_watchlist',
              symbols: items.map(i => i.symbol),
              count:   items.length,
            }))
            break
          }

          // Unsubscribe dari symbol
          case 'unsubscribe': {
            const symbols = Array.isArray(msg.symbols) ? msg.symbols : [msg.symbol]
            const subSet  = clientSubscriptions.get(ws) || new Set()
            symbols.forEach(s => subSet.delete(s.toUpperCase()))
            clientSubscriptions.set(ws, subSet)
            ws.send(JSON.stringify({ type: 'unsubscribed', symbols }))
            break
          }

          // Request harga snapshot (tanpa subscribe)
          case 'get_price': {
            const sym = msg.symbol?.toUpperCase()
            if (priceCache.has(sym)) {
              ws.send(JSON.stringify({
                type:   'price_snapshot',
                symbol: sym,
                data:   priceCache.get(sym),
              }))
            } else {
              ws.send(JSON.stringify({ type: 'error', message: `Harga ${sym} belum tersedia. Subscribe dulu.` }))
            }
            break
          }

          // Ping / pong keepalive
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
            break

          default:
            ws.send(JSON.stringify({ type: 'error', message: `Tipe pesan tidak dikenal: ${msg.type}` }))
        }

      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Format pesan tidak valid. Gunakan JSON.' }))
      }
    })

    // Handle disconnect 
    ws.on('close', () => {
      clientSubscriptions.delete(ws)
      if (userId) {
        const userConns = userConnections.get(userId)
        if (userConns) {
          userConns.delete(ws)
          if (userConns.size === 0) userConnections.delete(userId)
        }
      }
      console.log(`[WS] Client disconnected. Active: ${clientSubscriptions.size}`)
    })

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message)
    })
  })

  // Load semua symbol dari watchlist yang ada untuk pre-populate cache
  loadExistingWatchlistSymbols()

  return wss
}

// Pre-load symbols saat server start
const loadExistingWatchlistSymbols = async () => {
  try {
    const items = await prisma.watchlistItem.findMany({
      select: { symbol: true, instrumentType: true },
      distinct: ['symbol'],
    })

    const cryptoSymbols = items
      .filter(i => i.instrumentType === 'crypto' || i.instrumentType === 'crypto_futures')
      .map(i => i.symbol)

    const forexSymbols = items
      .filter(i => i.instrumentType !== 'crypto' && i.instrumentType !== 'crypto_futures')
      .map(i => i.symbol)

    if (cryptoSymbols.length > 0) {
      binanceStream.start(cryptoSymbols)
      console.log(`[WS] Pre-loaded ${cryptoSymbols.length} crypto symbols`)
    }

    if (forexSymbols.length > 0) {
      forexSymbols.forEach(s => forexPoller.addSymbol(s))
      forexPoller.start()
      console.log(`[WS] Pre-loaded ${forexSymbols.length} forex/commodity symbols`)
    }

  } catch (err) {
    console.error('[WS] loadExistingWatchlistSymbols error:', err.message)
  }
}


//  REST ENDPOINT HELPER — ambil harga dari cache via HTTP
const getPriceFromCache = (symbol) => priceCache.get(symbol?.toUpperCase()) || null
const getAllCachedPrices = () => Object.fromEntries(priceCache)
const getCachedSymbols  = () => [...priceCache.keys()]

module.exports = {
  initWebSocketServer,
  getPriceFromCache,
  getAllCachedPrices,
  getCachedSymbols,
  broadcastToUser,
  priceCache,
}
