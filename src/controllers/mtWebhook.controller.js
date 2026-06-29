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

/**
 * POST /api/v1/mt/webhook/:webhookToken
 */
const receiveTradeFromEA = async (req, res) => {
  try {
    const { webhookToken } = req.params  // ← dari URL
    const trade = req.body

    if (!webhookToken) {
      return error(res, 'Webhook token tidak ditemukan di URL.', 400)
    }

    // ✅ Cari akun HANYA via webhookToken (apiKey)
    // JANGAN pakai accountId disini!
    const account = await prisma.exchangeAccount.findFirst({
      where: { 
        apiKey: webhookToken, 
        platform: { in: ['mt4', 'mt5'] } 
      },
    })

    if (!account) {
      return error(res, 'Webhook token tidak valid atau akun tidak ditemukan.', 404)
    }

    // Normalize field dari berbagai format EA
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

    // Cek duplikat
    const dup = await prisma.journalTrade.findFirst({
      where: { externalTradeId, exchangeAccountId: account.id },
    })
    if (dup) {
      return success(res, { message: 'Trade sudah pernah tercatat (duplikat).', skipped: true })
    }

    // Cari/buat journal harian
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
        pnlAmount:         trade.profit ?? pnl?.pnlAmount ?? null,
        pnlPercent:        pnl?.pnlPercent ?? null,
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
      instrumentType: detectedType 
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

    const account = await prisma.exchangeAccount.findFirst({
      where: { id: accountId, userId, platform: { in: ['mt4', 'mt5'] } },
    })

    if (!account) {
  account = await prisma.exchangeAccount.findFirst({
    where: { platform: { in: ['mt4', 'mt5'] } }
  })
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