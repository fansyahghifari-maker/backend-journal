const { success, error } = require('../utils/response')
const { detectInstrumentType } = require('../services/mt/mt.parser')
const { calculatePnL } = require('../services/instrument.service')
const prisma = require('../utils/prisma')

/**
 * POST /api/v1/mt/webhook/:webhookToken
 * Dipanggil otomatis oleh Expert Advisor (EA) setiap kali ada trade baru
 * di MT4/MT5 milik user. Tidak butuh JWT — pakai webhookToken unik per akun.
 *
 * Body JSON dari EA:
 * {
 *   "ticket": "123456789",
 *   "symbol": "XAUUSD",
 *   "type": "buy",            // atau "sell"
 *   "volume": 0.1,
 *   "openPrice": 2350.50,
 *   "closePrice": 2365.20,     // null kalau posisi masih open
 *   "sl": 2340.00,
 *   "tp": 2380.00,
 *   "profit": 147.00,
 *   "commission": -2.00,
 *   "swap": -0.50,
 *   "openTime": "2026.06.23 14:30:00",
 *   "closeTime": "2026.06.23 16:45:00",
 *   "comment": "EA-AutoExport"
 * }
 */

// ==========================================
// TAMBAHKAN INI DI ATAS FUNGSI CONTROLLER
// ==========================================
const parseEADate = (dateStr) => {
  if (!dateStr) return null;
  let normalized = dateStr.replace(/\./g, '-');
  if (normalized.includes(' ')) {
    normalized = normalized.replace(' ', 'T');
  }
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? new Date() : date;
};

const receiveTradeFromEA = async (req, res) => {
  try {
    const { webhookToken } = req.params
    const trade = req.body

    if (!webhookToken) {
      return error(res, 'Webhook token tidak ditemukan di URL.', 400)
    }

    // Cari exchange account berdasarkan webhookToken (disimpan di field apiKey)
    const account = await prisma.exchangeAccount.findFirst({
      where: { apiKey: webhookToken, platform: { in: ['mt4', 'mt5'] } },
    })

    if (!account) {
      return error(res, 'Webhook token tidak valid atau akun tidak ditemukan.', 404)
    }

    if (!trade.symbol || !trade.ticket) {
      return error(res, 'Data trade tidak lengkap. Wajib ada "symbol" dan "ticket".', 400)
    }

    // Cek duplikat berdasarkan ticket
const externalTradeId = `${account.platform.toUpperCase()}-${trade.ticket}`;

const dup = await prisma.journalTrade.findFirst({
  where: { externalTradeId, exchangeAccountId: account.id },
});
    if (dup) {
      return success(res, { message: 'Trade sudah pernah tercatat (duplikat).', skipped: true })
    }

    // Cari/buat journal harian untuk auto-import EA
    const today = new Date().toISOString().split('T')[0]
    let journal = await prisma.journal.findFirst({
      where: {
        userId: account.userId,
        tags:   { has: 'ea-auto-import' },
        createdAt: { gte: new Date(`${today}T00:00:00Z`) },
      },
    })

    if (!journal) {
      journal = await prisma.journal.create({
        data: {
          userId:     account.userId,
          title:      `Auto-Import EA — ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          content:    `Trade masuk otomatis dari Expert Advisor di akun ${account.accountName} (${account.platform.toUpperCase()}).`,
          visibility: 'private',
          tags:       [account.platform, 'ea-auto-import'],
        },
      })
    }

    const instrumentType = detectInstrumentType(trade.symbol)
    const instrument = await prisma.instrument.findFirst({ where: { symbol: trade.symbol } })

    const pnl = calculatePnL({
      instrumentType,
      tradeType:  trade.type,
      entryPrice: trade.openPrice,
      exitPrice:  trade.closePrice,
      quantity:   trade.volume,
      commission: trade.commission || 0,
    })

    // GANTI BLOK DATA PRISMA CREATE MENJADI SEPERTI INI:
await prisma.journalTrade.create({
  data: {
    journalId:         journal.id,
    exchangeAccountId: account.id,
    externalTradeId:   externalTradeId, // Gunakan variabel baru dari Langkah 2
    instrumentType,
    symbol:            trade.symbol.toUpperCase(),
    symbolName:        instrument?.name || trade.symbol,
    baseCurrency:      instrument?.baseCurrency || '',
    quoteCurrency:     instrument?.quoteCurrency || 'USD',
    exchange:          account.accountName,
    platform:          account.platform,
    tradeType:         (trade.type || 'buy').toLowerCase(),
    entryPrice:        trade.openPrice,
    exitPrice:         trade.closePrice || null,
    quantity:          trade.volume,
    lotSize:           trade.volume,
    stopLoss:          trade.sl || null,
    takeProfit:        trade.tp || null,
    commission:        trade.commission || null,
    swap:              trade.swap || null,
    pnlAmount:         trade.profit ?? pnl?.pnlAmount ?? null,
    pnlPercent:        pnl?.pnlPercent ?? null,
    
    // PERBAIKAN UTAMA: Menggunakan helper dari Langkah 1
    tradeDate:         parseEADate(trade.openTime),
    closeDate:         parseEADate(trade.closeTime),
    
    notes:             trade.comment || null,
    status:            trade.closePrice ? 'closed' : 'open',
    tags:              ['ea-import'],
    rawData:           trade,
  },
})

    // Update lastSyncAt akun
    await prisma.exchangeAccount.update({
      where: { id: account.id },
      data:  { lastSyncAt: new Date(), lastSyncStatus: 'EA: trade diterima', status: 'active' },
    })

    return success(res, { message: 'Trade berhasil dicatat otomatis dari EA.', symbol: trade.symbol, instrumentType })
  } catch (err) {
  console.error('[MT-WEBHOOK] receiveTradeFromEA FULL ERROR:', err);
  console.error('[MT-WEBHOOK] error.code:', err.code);
  console.error('[MT-WEBHOOK] error.meta:', err.meta);
  return error(res, 'Gagal memproses data dari EA.', 500);
}
}

/**
 * GET /api/v1/mt/webhook-token/:accountId
 * Generate/ambil webhook token untuk akun MT4/5 tertentu (dipanggil dari frontend, butuh JWT biasa)
 */
const getWebhookToken = async (req, res) => {
  try {
    const userId    = req.user.id
    const accountId = req.params.accountId

    const account = await prisma.exchangeAccount.findFirst({
      where: { id: accountId, userId, platform: { in: ['mt4', 'mt5'] } },
    })

    if (!account) return error(res, 'Akun MT4/5 tidak ditemukan.', 404)

    // Generate token kalau belum ada
    let token = account.apiKey
    if (!token) {
      const crypto = require('crypto')
      token = crypto.randomBytes(24).toString('hex')
      await prisma.exchangeAccount.update({ where: { id: account.id }, data: { apiKey: token } })
    }

    const webhookUrl = `${process.env.BACKEND_URL || 'https://backend-journal-production.up.railway.app'}/api/v1/mt/webhook/${token}`

    return success(res, { webhookToken: token, webhookUrl })
  } catch (err) {
    console.error('[MT-WEBHOOK] getWebhookToken:', err.message)
    return error(res, 'Gagal mengambil webhook token.', 500)
  }
}

module.exports = { receiveTradeFromEA, getWebhookToken }
