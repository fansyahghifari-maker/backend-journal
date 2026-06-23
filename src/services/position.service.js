/**
 * POSITION SERVICE — DCA / Average Cost Basis Tracking
 *
 * Tujuan: gabungkan beberapa transaksi BUY (di harga berbeda-beda, gaya DCA)
 * menjadi SATU posisi per asset, dengan:
 * - average buy price (harga rata-rata tertimbang)
 * - total quantity yang masih dipegang (setelah dikurangi SELL)
 * - unrealized PnL berdasarkan harga sekarang
 * - riwayat tiap "lot" pembelian (kapan, harga berapa, masih running atau sudah closed)
 *
 * PENTING: hanya proses trade SPOT. binance.service.js sudah memisahkan
 * result.spot dan result.futures — fungsi di sini menjamin kalau ada data
 * futures yang ikut nyelip ke journal_trades, tetap di-skip otomatis,
 * karena formula PnL futures (leverage, margin) beda total dari spot.
 */

const { getPrices } = require('./price.service')

// ── Filter: hanya proses trade SPOT, buang futures kalau ada yang nyelip ──
const filterSpotOnly = (trades) => {
  return trades.filter(t => {
    const isFutures =
      t.platform === 'futures' ||
      t.tradeCategory === 'futures' ||
      (t.leverage && Number(t.leverage) > 1)

    return !isFutures
  })
}

// ── Hitung average cost basis dari sekumpulan trade (FIFO accounting) ──────
const calculatePosition = (trades) => {
  const lots = []
  let totalQty   = 0
  let totalCost  = 0
  let realizedPnl = 0

  for (const t of trades) {
    const qty   = Number(t.quantity)
    const price = Number(t.entryPrice)

    if (t.tradeType === 'buy') {
      lots.push({
        lotId:        t.externalTradeId,
        buyPrice:     price,
        qtyOriginal:  qty,
        qtyRemaining: qty,
        buyDate:      t.tradeDate,
        status:       'open',
      })
      totalQty  += qty
      totalCost += qty * price
    }

    if (t.tradeType === 'sell') {
      let qtyToSell = qty
      for (const lot of lots) {
        if (qtyToSell <= 0) break
        if (lot.qtyRemaining <= 0) continue

        const sellFromLot = Math.min(lot.qtyRemaining, qtyToSell)
        realizedPnl += sellFromLot * (price - lot.buyPrice)

        lot.qtyRemaining -= sellFromLot
        qtyToSell        -= sellFromLot
        if (lot.qtyRemaining <= 0.00000001) lot.status = 'closed'
      }
      totalQty  -= qty
      totalCost -= qty * (totalCost / (totalQty + qty) || 0)
    }
  }

  const avgBuyPrice = totalQty > 0 ? totalCost / totalQty : 0
  const openLots    = lots.filter(l => l.qtyRemaining > 0.00000001)

  return {
    totalQty:    Number(totalQty.toFixed(8)),
    avgBuyPrice: Number(avgBuyPrice.toFixed(8)),
    totalCost:   Number(totalCost.toFixed(2)),
    realizedPnl: Number(realizedPnl.toFixed(2)),
    lots: openLots.map(l => ({
      lotId:        l.lotId,
      buyPrice:     Number(l.buyPrice.toFixed(8)),
      qtyRemaining: Number(l.qtyRemaining.toFixed(8)),
      buyDate:      l.buyDate,
      status:       l.status,
    })),
  }
}

// ── Group trades by symbol, lalu hitung posisi tiap symbol ─────────────────
const buildPositionsFromTrades = (trades) => {
  const grouped = {}
  for (const t of trades) {
    const sym = t.symbol
    if (!grouped[sym]) grouped[sym] = []
    grouped[sym].push(t)
  }

  const positions = {}
  for (const [symbol, symTrades] of Object.entries(grouped)) {
    const sorted = [...symTrades].sort(
      (a, b) => new Date(a.tradeDate) - new Date(b.tradeDate)
    )
    positions[symbol] = calculatePosition(sorted)
  }

  return positions
}

// ── Tambahkan live price + unrealized PnL ke tiap posisi ───────────────────
const enrichPositionsWithLivePrice = async (positions) => {
  const symbols    = Object.keys(positions)
  const livePrices = await getPrices(symbols)

  const enriched = {}
  for (const symbol of symbols) {
    const pos          = positions[symbol]
    const currentPrice = livePrices[symbol]?.price || null

    const unrealizedPnl = currentPrice
      ? Number(((currentPrice - pos.avgBuyPrice) * pos.totalQty).toFixed(2))
      : null

    const unrealizedPnlPercent = currentPrice && pos.avgBuyPrice > 0
      ? Number((((currentPrice - pos.avgBuyPrice) / pos.avgBuyPrice) * 100).toFixed(2))
      : null

    const lotsWithStatus = pos.lots.map(lot => ({
      ...lot,
      currentPrice,
      pnlPercent: currentPrice
        ? Number((((currentPrice - lot.buyPrice) / lot.buyPrice) * 100).toFixed(2))
        : null,
      isProfit: currentPrice ? currentPrice > lot.buyPrice : null,
    }))

    enriched[symbol] = {
      ...pos,
      currentPrice,
      unrealizedPnl,
      unrealizedPnlPercent,
      lots: lotsWithStatus,
      updatedAt: new Date().toISOString(),
    }
  }

  return enriched
}

// ── Fungsi utama: dari raw trades → posisi lengkap dengan live PnL ─────────
const getPositionsSummary = async (trades) => {
  const spotTrades = filterSpotOnly(trades)
  const positions  = buildPositionsFromTrades(spotTrades)
  return enrichPositionsWithLivePrice(positions)
}

module.exports = {
  calculatePosition,
  buildPositionsFromTrades,
  enrichPositionsWithLivePrice,
  getPositionsSummary,
  filterSpotOnly,
}