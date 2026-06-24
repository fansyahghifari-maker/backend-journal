const { success, error } = require('../utils/response')
const { parseFile } = require('../services/mt/mt.parser')
const { calculatePnL } = require('../services/instrument.service')
const prisma = require('../utils/prisma')

/**
 * POST /api/v1/mt/upload
 * Upload file statement MT4/MT5/MIFX (CSV atau HTML export)
 * Body: multipart/form-data dengan field "file"
 * Query/body opsional: platform = 'mt4' | 'mt5' | 'mifx' | 'auto'
 */
const uploadStatement = async (req, res) => {
  try {
    const userId = req.user.id

    if (!req.file) {
      return error(res, 'Tidak ada file yang diupload. Pastikan field "file" terisi.', 400)
    }

    const platform = req.body.platform || 'auto'
    const content  = req.file.buffer.toString('utf-8')

    // Parse file pakai mt.parser.js yang sudah ada
    const { trades, format, count } = parseFile(content, platform)

    if (count === 0) {
      return error(res, 'Tidak ada trade yang terbaca dari file ini. Pastikan format file sesuai export MT4/MT5.', 400)
    }

    // Buat journal khusus untuk import ini
    const journal = await prisma.journal.create({
      data: {
        userId,
        title:      `Import ${format.toUpperCase()} — ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        content:    `Trade diimport dari file statement ${format} pada ${new Date().toLocaleString('id-ID')}.\n\nTotal trade terbaca: ${count}.`,
        visibility: 'private',
        tags:       [format, 'mt-import'],
      },
    })

    let imported = 0
    let skipped  = 0
    const errors = []

    for (const trade of trades) {
      try {
        // Skip duplikat berdasarkan ticket/deal id kalau ada
        if (trade.externalTradeId) {
          const dup = await prisma.journalTrade.findFirst({
            where: { externalTradeId: trade.externalTradeId, instrumentType: trade.instrumentType },
          })
          if (dup) { skipped++; continue }
        }

        // Cari instrument di master data (kalau ada)
        const instrument = await prisma.instrument.findFirst({
          where: { symbol: trade.symbol },
        })

        const pnl = calculatePnL({
          instrumentType: trade.instrumentType,
          tradeType:      trade.tradeType,
          entryPrice:     trade.entryPrice,
          exitPrice:      trade.exitPrice,
          quantity:       trade.quantity,
          commission:     trade.commission || 0,
        })

        await prisma.journalTrade.create({
          data: {
            journalId:      journal.id,
            externalTradeId: trade.externalTradeId || null,
            instrumentId:   instrument?.id || null,
            instrumentType: trade.instrumentType,
            symbol:         trade.symbol?.toUpperCase() || 'UNKNOWN',
            symbolName:     instrument?.name || trade.symbol || 'Unknown',
            baseCurrency:   instrument?.baseCurrency || '',
            quoteCurrency:  instrument?.quoteCurrency || 'USD',
            exchange:       format.toUpperCase(),
            platform:       format.includes('mt5') ? 'mt5' : format.includes('mt4') ? 'mt4' : 'manual',
            tradeType:      trade.tradeType,
            entryPrice:     trade.entryPrice,
            exitPrice:      trade.exitPrice || null,
            quantity:       trade.quantity,
            lotSize:        trade.volume || trade.lotSize || null,
            stopLoss:       trade.sl || null,
            takeProfit:     trade.tp || null,
            commission:     trade.commission || null,
            swap:           trade.swap || null,
            pnlAmount:      trade.profit ?? pnl?.pnlAmount ?? null,
            pnlPercent:     pnl?.pnlPercent ?? null,
            tradeDate:      trade.openTime ? new Date(trade.openTime) : new Date(),
            closeDate:      trade.closeTime ? new Date(trade.closeTime) : null,
            notes:          trade.comment || null,
            status:         trade.closeTime ? 'closed' : 'open',
            rawData:        trade,
          },
        })
        imported++
      } catch (err) {
        errors.push({ trade: trade.externalTradeId || 'unknown', error: err.message })
      }
    }

    return success(res, {
      message:  `Import selesai: ${imported} trade berhasil diimport, ${skipped} dilewati (duplikat).`,
      imported,
      skipped,
      errors,
      journalId: journal.id,
      format,
    })
  } catch (err) {
    console.error('[MT] uploadStatement:', err.message)
    return error(res, 'Gagal memproses file statement.', 500)
  }
}

module.exports = { uploadStatement }