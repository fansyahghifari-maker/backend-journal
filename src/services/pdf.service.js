const prisma = require('../utils/prisma')

//  GENERATE HTML TEMPLATE untuk Journal PDF
//  Menggunakan HTML murni yang bisa diprint/save as PDF oleh browser
//  atau diconvert via pdfkit di backend

const generateJournalHTML = (journal, trades, stats) => {
  const formatDate  = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const formatNum   = (n) => n !== null && n !== undefined ? Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'
  const pnlColor    = (v) => Number(v) >= 0 ? '#16a34a' : '#dc2626'
  const pnlPrefix   = (v) => Number(v) >= 0 ? '+' : ''
  const visLabel    = { private: 'Private 🔒', public: 'Public 🌐', members_only: 'Members Only 👥' }

  const tradesHTML = trades.length > 0 ? `
    <table class="trade-table">
      <thead>
        <tr>
          <th>Coin</th><th>Type</th><th>Entry</th><th>Exit</th>
          <th>Qty</th><th>PnL</th><th>PnL%</th><th>Status</th><th>Exchange</th>
        </tr>
      </thead>
      <tbody>
        ${trades.map(t => `
          <tr>
            <td><strong>${t.coinSymbol}</strong><br><small>${t.coinName}</small></td>
            <td><span class="badge ${t.tradeType}">${t.tradeType.toUpperCase()}</span></td>
            <td>$${formatNum(t.entryPrice)}</td>
            <td>${t.exitPrice ? '$' + formatNum(t.exitPrice) : '-'}</td>
            <td>${formatNum(t.quantity)}</td>
            <td style="color:${t.pnlAmount ? pnlColor(t.pnlAmount) : '#6b7280'}; font-weight:600">
              ${t.pnlAmount ? pnlPrefix(t.pnlAmount) + '$' + formatNum(Math.abs(t.pnlAmount)) : '-'}
            </td>
            <td style="color:${t.pnlPercent ? pnlColor(t.pnlPercent) : '#6b7280'}">
              ${t.pnlPercent ? pnlPrefix(t.pnlPercent) + formatNum(Math.abs(t.pnlPercent)) + '%' : '-'}
            </td>
            <td><span class="badge ${t.status}">${t.status}</span></td>
            <td>${t.exchange || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p class="empty">Tidak ada trade di jurnal ini.</p>'

  const statsHTML = stats.closedTrades > 0 ? `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total PnL</div>
        <div class="stat-value" style="color:${pnlColor(stats.totalPnl)}">
          ${pnlPrefix(stats.totalPnl)}$${formatNum(Math.abs(stats.totalPnl))}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Win Rate</div>
        <div class="stat-value">${stats.winRate}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Trade</div>
        <div class="stat-value">${stats.totalTrades}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Win / Loss</div>
        <div class="stat-value">${stats.winCount} / ${stats.lossCount}</div>
      </div>
    </div>
  ` : ''

  const tagsHTML = Array.isArray(journal.tags) && journal.tags.length > 0
    ? journal.tags.map(t => `<span class="tag">#${t}</span>`).join(' ')
    : ''

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${journal.title} — CryptoJournal</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; background: #fff; }

    .header { background: linear-gradient(135deg, #1e1b4b, #312e81); color: white; padding: 32px 40px; }
    .header-brand { font-size: 13px; opacity: 0.7; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
    .header-title { font-size: 26px; font-weight: 700; line-height: 1.3; margin-bottom: 12px; }
    .header-meta { font-size: 13px; opacity: 0.8; display: flex; gap: 24px; flex-wrap: wrap; }

    .content { padding: 32px 40px; }

    .section { margin-bottom: 32px; }
    .section-title { font-size: 14px; font-weight: 700; color: #6366f1; text-transform: uppercase;
                     letter-spacing: 1px; border-bottom: 2px solid #e0e7ff; padding-bottom: 8px; margin-bottom: 16px; }

    .journal-content { font-size: 15px; line-height: 1.8; color: #374151; white-space: pre-wrap; }

    .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .tag { background: #ede9fe; color: #5b21b6; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 500; }

    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; }
    .stat-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .stat-value { font-size: 20px; font-weight: 700; color: #1e293b; }

    .trade-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .trade-table th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-size: 11px;
                      text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    .trade-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .trade-table tr:hover td { background: #fafafa; }

    .badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .badge.long   { background: #dcfce7; color: #16a34a; }
    .badge.short  { background: #fee2e2; color: #dc2626; }
    .badge.open   { background: #fef3c7; color: #d97706; }
    .badge.closed { background: #dbeafe; color: #2563eb; }
    .badge.cancelled { background: #f1f5f9; color: #64748b; }

    .empty { color: #94a3b8; font-style: italic; font-size: 14px; text-align: center; padding: 20px; }

    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 40px;
              display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .header { -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-brand">CryptoJournal — Trading Journal</div>
    <div class="header-title">${journal.title}</div>
    <div class="header-meta">
      <span>👤 ${journal.user?.username || 'Unknown'}</span>
      <span>📅 ${formatDate(journal.createdAt)}</span>
      <span>🔏 ${visLabel[journal.visibility] || journal.visibility}</span>
      ${journal.updatedAt !== journal.createdAt ? `<span>✏️ Diupdate: ${formatDate(journal.updatedAt)}</span>` : ''}
    </div>
  </div>

  <div class="content">

    ${tagsHTML ? `
    <div class="section">
      <div class="tags">${tagsHTML}</div>
    </div>` : ''}

    <div class="section">
      <div class="section-title">Isi Jurnal</div>
      <div class="journal-content">${journal.content}</div>
    </div>

    ${stats.closedTrades > 0 ? `
    <div class="section">
      <div class="section-title">Ringkasan Trade</div>
      ${statsHTML}
    </div>` : ''}

    ${trades.length > 0 ? `
    <div class="section">
      <div class="section-title">Detail Trade (${trades.length})</div>
      ${tradesHTML}
    </div>` : ''}

  </div>

  <div class="footer">
    <span>Diekspor dari CryptoJournal</span>
    <span>Dibuat: ${formatDate(new Date())}</span>
  </div>
</body>
</html>`
}

//  EXPORT JOURNAL — return HTML siap diprint/save as PDF
const exportJournal = async (journalId, userId) => {
  // Cek akses
  const journal = await prisma.journal.findUnique({
    where:   { id: journalId },
    include: {
      user:   { select: { id: true, username: true } },
      trades: { orderBy: { tradeDate: 'asc' } },
    },
  })

  if (!journal)                  throw { status: 404, message: 'Jurnal tidak ditemukan.' }
  if (journal.userId !== userId) throw { status: 403, message: 'Akses ditolak. Bukan jurnal kamu.' }

  // Cek akses fitur export_pdf dari plan
  const sub = await prisma.userSubscription.findFirst({
    where:   { userId, status: 'active', endDate: { gt: new Date() } },
    include: { plan: true },
  })

  const plan     = sub?.plan
  const features = plan?.features || []
  const canExport = features.find(f => f.key === 'export_pdf')

  if (!canExport || canExport.value === false) {
    throw {
      status:  403,
      message: `Export PDF hanya tersedia di paket Pro dan Elite. Upgrade untuk menggunakan fitur ini.`,
    }
  }

  // Hitung summary trade
  const trades  = journal.trades
  const closed  = trades.filter(t => t.status === 'closed' && t.pnlAmount !== null)
  const wins    = closed.filter(t => Number(t.pnlAmount) > 0)
  const stats   = {
    totalTrades:  trades.length,
    closedTrades: closed.length,
    winCount:     wins.length,
    lossCount:    closed.length - wins.length,
    winRate:      closed.length > 0 ? parseFloat(((wins.length / closed.length) * 100).toFixed(1)) : 0,
    totalPnl:     parseFloat(closed.reduce((s, t) => s + Number(t.pnlAmount), 0).toFixed(2)),
  }

  const html = generateJournalHTML(journal, trades, stats)

  return {
    html,
    filename: `CryptoJournal-${journal.title.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.html`,
    journal:  { id: journal.id, title: journal.title },
  }
}

//  EXPORT MULTIPLE JOURNALS — gabungkan beberapa jurnal
const exportMultipleJournals = async (userId, journalIds) => {
  // Cek akses fitur
  const sub = await prisma.userSubscription.findFirst({
    where:   { userId, status: 'active', endDate: { gt: new Date() } },
    include: { plan: true },
  })
  const features  = sub?.plan?.features || []
  const canExport = features.find(f => f.key === 'export_pdf')
  if (!canExport || canExport.value === false) {
    throw { status: 403, message: 'Export PDF hanya tersedia di paket Pro dan Elite.' }
  }

  const journals = await prisma.journal.findMany({
    where:   { id: { in: journalIds }, userId },
    include: {
      user:   { select: { id: true, username: true } },
      trades: { orderBy: { tradeDate: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (journals.length === 0) throw { status: 404, message: 'Tidak ada jurnal ditemukan.' }

  // Gabungkan semua HTML
  const allHTML = journals.map(journal => {
    const closed = journal.trades.filter(t => t.status === 'closed' && t.pnlAmount !== null)
    const wins   = closed.filter(t => Number(t.pnlAmount) > 0)
    const stats  = {
      totalTrades:  journal.trades.length,
      closedTrades: closed.length,
      winCount:     wins.length,
      lossCount:    closed.length - wins.length,
      winRate:      closed.length > 0 ? parseFloat(((wins.length / closed.length) * 100).toFixed(1)) : 0,
      totalPnl:     parseFloat(closed.reduce((s, t) => s + Number(t.pnlAmount), 0).toFixed(2)),
    }
    return generateJournalHTML(journal, journal.trades, stats)
  }).join('<div style="page-break-after: always"></div>')

  return {
    html:     allHTML,
    filename: `CryptoJournal-Export-${new Date().toISOString().split('T')[0]}.html`,
    count:    journals.length,
  }
}

module.exports = { exportJournal, exportMultipleJournals }
