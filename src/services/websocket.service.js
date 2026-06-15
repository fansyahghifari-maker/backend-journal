const WebSocket = require('ws')
const { verifyAccessToken } = require('../utils/jwt')
const prisma  = require('../utils/prisma')
const {
  getPrices, getWatchlistPrices,
  fetchBinancePrices, fetchForexPrices,
  updateCache, priceCache,
} = require('./price.service')

//  CLIENT MANAGER
//  Simpan semua koneksi WebSocket yang aktif
const clients = new Map()
// Format: clients.set(userId, { ws, subscriptions: Set([symbols]), lastPing })

//  HELPER: send ke client 
const sendToClient = (ws, type, data) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data, timestamp: Date.now() }))
  }
}

//  HELPER: broadcast ke semua subscriber symbol ini 
const broadcastPrice = (symbol, priceData) => {
  for (const [userId, client] of clients.entries()) {
    if (client.subscriptions.has(symbol.toUpperCase())) {
      sendToClient(client.ws, 'price_update', {
        symbol,
        ...priceData,
      })
    }
  }
}

//  HELPER: broadcast alert ke user spesifik 
const sendAlert = (userId, alertData) => {
  const client = clients.get(userId)
  if (client) {
    sendToClient(client.ws, 'price_alert', alertData)
  }
}

//  BINANCE WEBSOCKET — harga crypto realtime
//  Connect ke Binance stream untuk symbols yang disubscribe
let binanceWs       = null
let binanceSymbols  = new Set()
let binanceReconnectTimer = null

const connectBinanceStream = (symbols) => {
  if (symbols.length === 0) return

  // Format stream: btcusdt@ticker/ethusdt@ticker
  const streams = symbols
    .filter(s => s.endsWith('USDT') || s.endsWith('BTC'))
    .map(s => `${s.toLowerCase()}@miniTicker`)
    .join('/')

  if (!streams) return

  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`

  // Tutup koneksi lama kalau ada
  if (binanceWs && binanceWs.readyState === WebSocket.OPEN) {
    binanceWs.close()
  }

  try {
    binanceWs = new WebSocket(url)

    binanceWs.on('open', () => {
      console.log(`[BINANCE WS] Connected to ${symbols.length} streams`)
    })

    binanceWs.on('message', (raw) => {
      try {
        const msg  = JSON.parse(raw)
        const data = msg.data
        if (!data || !data.s) return

        const priceData = {
          price:     parseFloat(data.c),   // close price
          change24h: parseFloat(data.P),   // price change percent
          high24h:   parseFloat(data.h),
          low24h:    parseFloat(data.l),
          volume:    parseFloat(data.v),
          source:    'binance_ws',
        }

        // Update cache
        updateCache(data.s, priceData)

        // Broadcast ke semua subscriber
        broadcastPrice(data.s, priceData)

        // Cek alert untuk semua user yang subscribe symbol ini
        checkAlertsForSymbol(data.s, priceData.price)
      } catch {}
    })

    binanceWs.on('close', () => {
      console.log('[BINANCE WS] Disconnected. Reconnecting in 5s...')
      binanceReconnectTimer = setTimeout(() => {
        if (binanceSymbols.size > 0) {
          connectBinanceStream([...binanceSymbols])
        }
      }, 5000)
    })

    binanceWs.on('error', (err) => {
      console.error('[BINANCE WS] Error:', err.message)
    })

  } catch (err) {
    console.error('[BINANCE WS] Failed to connect:', err.message)
  }
}

// TAMBAH SYMBOL KE BINANCE STREAM 
const addBinanceSymbol = (symbol) => {
  const s = symbol.toUpperCase()
  if (binanceSymbols.has(s)) return
  binanceSymbols.add(s)

  // Reconnect dengan symbols baru (Binance tidak support subscribe dinamis di miniTicker)
  if (binanceReconnectTimer) clearTimeout(binanceReconnectTimer)
  setTimeout(() => connectBinanceStream([...binanceSymbols]), 500)
}

//  POLLING FOREX & COMMODITY (setiap 30 detik)
//  Forex API tidak punya WebSocket gratis, jadi kita polling
let forexPollingTimer = null

const startForexPolling = () => {
  if (forexPollingTimer) return

  const poll = async () => {
    // Cek apakah ada user yang subscribe forex/commodity
    let hasForexSub = false
    for (const [, client] of clients.entries()) {
      for (const sym of client.subscriptions) {
        if (['EURUSD','GBPUSD','USDJPY','XAUUSD','XAGUSD','USDCHF','AUDUSD','NZDUSD','USDCAD','USDIDR'].includes(sym)) {
          hasForexSub = true
          break
        }
      }
      if (hasForexSub) break
    }

    if (hasForexSub) {
      await fetchForexPrices()

      // Broadcast update forex ke semua subscriber
      const forexSymbols = ['EURUSD','GBPUSD','USDJPY','XAUUSD','XAGUSD','USDCHF','AUDUSD','NZDUSD','USDCAD','USDIDR']
      for (const sym of forexSymbols) {
        const cached = priceCache.get(sym)
        if (cached) broadcastPrice(sym, cached)
      }
    }
  }

  // Polling setiap 30 detik
  forexPollingTimer = setInterval(poll, 30000)
  poll() // langsung poll pertama kali
}

//  CHECK ALERTS — cek apakah ada alert yang terpicu
const checkAlertsForSymbol = async (symbol, currentPrice) => {
  try {
    const items = await prisma.watchlistItem.findMany({
      where: {
        symbol,
        OR: [
          { alertPriceHigh: { not: null } },
          { alertPriceLow:  { not: null } },
        ],
      },
      include: { watchlist: { select: { userId: true, name: true } } },
    })

    for (const item of items) {
      const high = item.alertPriceHigh ? Number(item.alertPriceHigh) : null
      const low  = item.alertPriceLow  ? Number(item.alertPriceLow)  : null
      const uid  = item.watchlist.userId

      if (high && currentPrice >= high) {
        const alertData = {
          symbol, alertType: 'high',
          alertPrice: high, currentPrice,
          message: `🚀 ${symbol} menyentuh $${currentPrice.toLocaleString()} — target HIGH $${high.toLocaleString()} tercapai!`,
        }

        // Kirim via WebSocket
        sendAlert(uid, alertData)

        // Simpan notifikasi ke DB (throttle: max 1x per jam per symbol per type)
        const recentNotif = await prisma.notification.findFirst({
          where: {
            userId: uid,
            type:   'price_alert_high',
            data:   { path: ['symbol'], equals: symbol },
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        })

        if (!recentNotif) {
          await prisma.notification.create({
            data: {
              userId:  uid,
              type:    'price_alert_high',
              title:   `🚀 ${symbol} mencapai target!`,
              message: alertData.message,
              data:    { symbol, alertPrice: high, currentPrice, alertType: 'high' },
            },
          })
        }
      }

      if (low && currentPrice <= low) {
        const alertData = {
          symbol, alertType: 'low',
          alertPrice: low, currentPrice,
          message: `📉 ${symbol} di $${currentPrice.toLocaleString()} — menyentuh target LOW $${low.toLocaleString()}!`,
        }

        sendAlert(uid, alertData)

        const recentNotif = await prisma.notification.findFirst({
          where: {
            userId: uid,
            type:   'price_alert_low',
            data:   { path: ['symbol'], equals: symbol },
            createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        })

        if (!recentNotif) {
          await prisma.notification.create({
            data: {
              userId:  uid,
              type:    'price_alert_low',
              title:   `📉 ${symbol} menyentuh harga rendah!`,
              message: alertData.message,
              data:    { symbol, alertPrice: low, currentPrice, alertType: 'low' },
            },
          })
        }
      }
    }
  } catch (err) {
    console.error('[ALERT CHECK] Error:', err.message)
  }
}

//  HANDLE CLIENT MESSAGE — proses pesan dari frontend
const handleClientMessage = async (userId, message) => {
  let msg
  try { msg = JSON.parse(message) }
  catch { return }

  const client = clients.get(userId)
  if (!client) return

  switch (msg.type) {

    // Subscribe ke symbol tertentu
    case 'subscribe': {
      const symbols = (msg.symbols || []).map(s => s.toUpperCase())
      for (const sym of symbols) {
        client.subscriptions.add(sym)
        // Auto-connect ke Binance stream kalau crypto
        if (sym.endsWith('USDT') || sym.endsWith('BTC')) {
          addBinanceSymbol(sym)
        }
      }

      // Kirim harga current langsung (dari cache atau fetch)
      const prices = await getPrices(symbols)
      sendToClient(client.ws, 'price_snapshot', { prices })
      console.log(`[WS] User ${userId} subscribed to: ${symbols.join(', ')}`)
      break
    }

    // Unsubscribe dari symbol
    case 'unsubscribe': {
      const symbols = (msg.symbols || []).map(s => s.toUpperCase())
      for (const sym of symbols) client.subscriptions.delete(sym)
      break
    }

    // Subscribe ke semua watchlist user
    case 'subscribe_watchlist': {
      const { prices, alerts, symbols } = await getWatchlistPrices(userId)

      // Subscribe ke semua symbols
      for (const sym of symbols) {
        client.subscriptions.add(sym)
        if (sym.endsWith('USDT') || sym.endsWith('BTC')) addBinanceSymbol(sym)
      }

      sendToClient(client.ws, 'price_snapshot', { prices })

      // Kirim alert yang sudah terpicu
      if (alerts.length > 0) {
        sendToClient(client.ws, 'alerts_triggered', { alerts })
      }

      startForexPolling()
      break
    }

    // Ping — keep alive
    case 'ping':
      client.lastPing = Date.now()
      sendToClient(client.ws, 'pong', { ts: Date.now() })
      break

    // Request harga manual
    case 'get_prices': {
      const symbols = (msg.symbols || []).map(s => s.toUpperCase())
      const prices  = await getPrices(symbols)
      sendToClient(client.ws, 'price_snapshot', { prices })
      break
    }
  }
}

//  INIT WEBSOCKET SERVER
//  Dipanggil dari index.js saat server start
const initWebSocketServer = (httpServer) => {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' })

  console.log('🔌 WebSocket server initialized at /ws')

  wss.on('connection', async (ws, req) => {
    // ── Autentikasi via query param token ──
    const url    = new URL(req.url, `http://localhost`)
    const token  = url.searchParams.get('token')

    let userId = null
    try {
      const decoded = verifyAccessToken(token)
      userId        = decoded.sub
    } catch {
      ws.close(1008, 'Unauthorized — token tidak valid atau expired')
      return
    }

    // ── Register client ──
    clients.set(userId, { ws, subscriptions: new Set(), lastPing: Date.now() })
    console.log(`[WS] User ${userId} connected. Total clients: ${clients.size}`)

    // Kirim konfirmasi koneksi
    sendToClient(ws, 'connected', {
      message:  'WebSocket terhubung! Kirim "subscribe_watchlist" untuk mulai terima harga.',
      userId,
    })

    // ── Handle pesan dari client ──
    ws.on('message', (data) => handleClientMessage(userId, data.toString()))

    // ── Handle disconnect ──
    ws.on('close', () => {
      clients.delete(userId)
      console.log(`[WS] User ${userId} disconnected. Remaining: ${clients.size}`)

      // Stop forex polling kalau tidak ada client
      if (clients.size === 0 && forexPollingTimer) {
        clearInterval(forexPollingTimer)
        forexPollingTimer = null
      }
    })

    ws.on('error', (err) => {
      console.error(`[WS] Error for user ${userId}:`, err.message)
      clients.delete(userId)
    })
  })

  // ── Heartbeat: hapus client yang tidak aktif ──
  setInterval(() => {
    const now = Date.now()
    for (const [userId, client] of clients.entries()) {
      if (now - client.lastPing > 60000) { // 60 detik tidak ping
        client.ws.terminate()
        clients.delete(userId)
        console.log(`[WS] Terminated inactive client: ${userId}`)
      }
    }
  }, 30000)

  return wss
}

//  STATS untuk monitoring 
const getStats = () => ({
  connectedClients: clients.size,
  binanceSymbols:   [...binanceSymbols],
  cachedPrices:     priceCache.size,
  binanceWsStatus:  binanceWs?.readyState === WebSocket.OPEN ? 'connected' : 'disconnected',
})

module.exports = { initWebSocketServer, getStats, clients, sendAlert }
