const { success, error } = require('../utils/response')
const { detectInstrumentType } = require('../services/mt/mt.parser')
const { calculatePnL } = require('../services/instrument.service')
const prisma = require('../utils/prisma')

// Helper parsing tanggal ISO
const parseEADate = (dateStr) => {
  if (!dateStr) return null;
  let normalized = dateStr.replace(/\./g, '-');
  if (normalized.includes(' ')) {
    normalized = normalized.replace(' ', 'T');
  }
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? new Date() : date;
};

// FIX: pnlAmount (dari trade.profit MT5, sumber kebenaran) dan pnlPercent
// (dari calculatePnL() internal) dihitung lewat 2 jalur yang independen.
// Kalau tradeType yang dikirim ke calculatePnL salah arah (buy/sell tertukar),
// tanda pnlPercent bisa kebalik dari pnlAmount walau besarannya sudah benar.
// Helper ini memaksa tanda pnlPercent SELALU mengikuti tanda pnlAmount final,
// supaya keduanya konsisten dan tidak pernah berlawanan secara visual di UI.
const alignPnlPercentSign = (pnlAmount, pnlPercent) => {
  if (pnlPercent === null || pnlPercent === undefined) return pnlPercent
  if (pnlAmount === null || pnlAmount === undefined) return pnlPercent
  const magnitude = Math.abs(pnlPercent)
  if (pnlAmount > 0) return magnitude
  if (pnlAmount < 0) return -magnitude
  return 0
};

/**
 * POST /api/v1/mt/webhook/:webhookToken
 *
 * PENTING: satu position MT5 bisa kirim 2 event terpisah —
 * "open" (saat posisi dibuka) dan "closed" (saat posisi ditutup).
 * Keduanya pakai externalTradeId yang sama, jadi event kedua
 * harus UPDATE row yang sudah ada, bukan di-skip sebagai duplikat.
 */
const receiveTradeFromEA = async (req, res) => {
  try {
    const { webhookToken } = req.params
    const trade = req.body

    if (!webhookToken) {
      return error(res, 'Webhook token tidak ditemukan di URL.', 400)
    }

    const account = await prisma.exchangeAccount.findFirst({
      where: { apiKey: webhookToken, platform: { in: ['mt4', 'mt5'] } },
    })

    if (!account) {
      return error(res, 'Webhook token tidak valid atau akun tidak ditemukan.', 404)
    }

    // Normalize field — support berbagai format EA (openPrice/entryPrice/price, dst)
    const symbol     = trade.symbol
    const ticket     = trade.ticket
    const openPrice  = trade.openPrice  ?? trade.entryPrice ?? trade.price ?? null
    const closePrice = trade.closePrice ?? trade.exitPrice  ?? null
    const volume     = trade.volume     ?? trade.lots       ?? trade.quantity ?? null
    const sl         = trade.sl         ?? trade.stopLoss   ?? null
    const tp         = trade.tp         ?? trade.takeProfit ?? null

    if (!symbol || !ticket) {
      return error(res, 'Data trade tidak lengkap. Wajib ada "symbol" dan "ticket".', 400)
    }

    const platformLower   = account.platform.toLowerCase()
    const externalTradeId = `${platformLower}-${ticket}`

    // Cari instrument & hitung PnL (dipakai baik untuk create maupun update)
    let detectedType = detectInstrumentType(symbol) || 'forex'
    detectedType = detectedType.toLowerCase()
    const validTypes = ['crypto', 'forex', 'commodity', 'index', 'stock', 'crypto_futures']
    if (!validTypes.includes(detectedType)) detectedType = 'forex'

    const instrument = await prisma.instrument.findFirst({ where: { symbol } })

    const pnl = calculatePnL({
      instrumentType: detectedType,
      tradeType:      trade.type,
      entryPrice:     openPrice,
      exitPrice:      closePrice,
      quantity:       volume,
      commission:     trade.commission || 0,
    })

    // Cek apakah trade dengan ticket ini sudah pernah masuk
    const existing = await prisma.journalTrade.findFirst({
      where: { externalTradeId, exchangeAccountId: account.id },
    })

    if (existing) {
      // UPDATE — biasanya kejadian saat event "closed" masuk
      // setelah event "open" sebelumnya sudah tercatat
      const finalPnlAmountUpdate = trade.profit ?? pnl?.pnlAmount ?? existing.pnlAmount
      await prisma.journalTrade.update({
        where: { id: existing.id },
        data: {
          exitPrice:  closePrice ?? existing.exitPrice,
          pnlAmount:  finalPnlAmountUpdate,
          pnlPercent: alignPnlPercentSign(finalPnlAmountUpdate, pnl?.pnlPercent ?? existing.pnlPercent),
          closeDate:  closePrice ? parseEADate(trade.closeTime) : existing.closeDate,
          status:     closePrice ? 'closed' : existing.status,
          commission: trade.commission ?? existing.commission,
          swap:       trade.swap ?? existing.swap,
          stopLoss:   sl ?? existing.stopLoss,
          takeProfit: tp ?? existing.takeProfit,
          notes:      trade.comment || existing.notes,
          rawData:    trade,
        },
      })

      await prisma.exchangeAccount.update({
        where: { id: account.id },
        data:  { lastSyncAt: new Date(), lastSyncStatus: 'EA: trade diupdate', status: 'active' },
      })

      return success(res, {
        message: 'Trade berhasil diupdate.',
        symbol,
        instrumentType: detectedType,
        updated: true,
      })
    }

    // CREATE — trade baru, belum pernah tercatat sama sekali
    const today = new Date().toISOString().split('T')[0]
    let journal = await prisma.journal.findFirst({
      where: {
        userId:    account.userId,
        title:     { contains: 'Auto-Import EA' },
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
          tags:       [platformLower, 'ea-auto-import'],
        },
      })
    }

    const finalPnlAmountCreate = trade.profit ?? pnl?.pnlAmount ?? null

    await prisma.journalTrade.create({
      data: {
        journalId:         journal.id,
        exchangeAccountId: account.id,
        externalTradeId:   externalTradeId,
        instrumentType:    detectedType,
        symbol:            symbol.toUpperCase(),
        symbolName:        instrument?.name || symbol,
        baseCurrency:      instrument?.baseCurrency || '',
        quoteCurrency:     instrument?.quoteCurrency || 'USD',
        exchange:          account.accountName,
        platform:          platformLower,
        tradeType:         (trade.type || 'buy').toLowerCase(),
        entryPrice:        openPrice,
        exitPrice:         closePrice,
        quantity:          volume,
        lotSize:           volume,
        stopLoss:          sl,
        takeProfit:        tp,
        commission:        trade.commission || null,
        swap:              trade.swap || null,
        pnlAmount:         finalPnlAmountCreate,
        pnlPercent:        alignPnlPercentSign(finalPnlAmountCreate, pnl?.pnlPercent ?? null),
        tradeDate:         parseEADate(trade.openTime),
        closeDate:         parseEADate(trade.closeTime),
        notes:             trade.comment || null,
        status:            closePrice ? 'closed' : 'open',
        tags:              ['ea-import'],
        rawData:           trade,
      },
    })

    await prisma.exchangeAccount.update({
      where: { id: account.id },
      data:  { lastSyncAt: new Date(), lastSyncStatus: 'EA: trade diterima', status: 'active' },
    })

    return success(res, {
      message: 'Trade berhasil dicatat otomatis dari EA.',
      symbol,
      instrumentType: detectedType,
    })

  } catch (err) {
    console.error('[MT-WEBHOOK] receiveTradeFromEA FULL ERROR:', err)
    return error(res, `Gagal: ${err.message}`, 500)
  }
}

/**
 * GET /api/v1/mt/webhook-token/:accountId
 */
const getWebhookToken = async (req, res) => {
  try {
    const userId    = req.user.id
    const accountId = req.params.accountId

    let account = await prisma.exchangeAccount.findFirst({
      where: { id: accountId, userId, platform: { in: ['mt4', 'mt5'] } },
    })

    if (!account) {
      return error(res, 'Akun MT tidak ditemukan.', 404)
    }

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