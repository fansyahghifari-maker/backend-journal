const prisma = require('../utils/prisma')

//  AI SERVICE — Analisis trade & journal pakai Claude API
//  Endpoint Anthropic: POST /v1/messages

const callClaude = async (systemPrompt, userMessage) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw { status: 503, message: `Claude API error: ${err.error?.message || 'Unknown error'}` }
  }

  const data = await response.json()
  return data.content[0].text
}

// Cek akses fitur AI
const assertAIAccess = async (userId) => {
  const sub = await prisma.userSubscription.findFirst({
    where:   { userId, status: 'active', endDate: { gt: new Date() } },
    include: { plan: true },
  })

  const features  = sub?.plan?.features || []
  const aiFeature = features.find(f => f.key === 'ai_analysis')

  if (!aiFeature || aiFeature.value === false) {
    throw {
      status:  403,
      message: 'Fitur AI Analysis hanya tersedia di paket Elite. Upgrade untuk menggunakan fitur ini.',
    }
  }

  return sub
}

//  ANALYZE JOURNAL — AI baca konten jurnal dan kasih feedback
const analyzeJournal = async (journalId, userId) => {
  await assertAIAccess(userId)

  const journal = await prisma.journal.findUnique({
    where:   { id: journalId },
    include: { trades: true },
  })

  if (!journal)                  throw { status: 404, message: 'Jurnal tidak ditemukan.' }
  if (journal.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }

  // Prepare data trade untuk context AI
  const tradeContext = journal.trades.length > 0
    ? journal.trades.map(t => `
        - ${t.coinSymbol} (${t.tradeType.toUpperCase()})
          Entry: $${Number(t.entryPrice).toFixed(4)}
          Exit: ${t.exitPrice ? '$' + Number(t.exitPrice).toFixed(4) : 'Belum closed'}
          Qty: ${t.quantity}
          PnL: ${t.pnlAmount ? (Number(t.pnlAmount) >= 0 ? '+' : '') + '$' + Number(t.pnlAmount).toFixed(2) : 'N/A'}
          PnL%: ${t.pnlPercent ? Number(t.pnlPercent).toFixed(2) + '%' : 'N/A'}
          Status: ${t.status}
          Exchange: ${t.exchange || 'N/A'}
      `).join('\n')
    : 'Tidak ada trade di jurnal ini.'

  const systemPrompt = `Kamu adalah AI trading coach profesional yang membantu trader crypto Indonesia meningkatkan performa trading mereka.

Gaya komunikasi: gunakan Bahasa Indonesia yang profesional namun friendly. Berikan insight yang konkret, spesifik, dan actionable — bukan saran umum.

Struktur analisis kamu HARUS menggunakan format JSON berikut:
{
  "summary": "ringkasan singkat 2-3 kalimat tentang jurnal ini",
  "strengths": ["kelebihan 1", "kelebihan 2"],
  "weaknesses": ["kelemahan 1", "kelemahan 2"],
  "insights": ["insight mendalam 1", "insight mendalam 2", "insight mendalam 3"],
  "recommendations": ["rekomendasi actionable 1", "rekomendasi actionable 2", "rekomendasi actionable 3"],
  "riskAssessment": "penilaian singkat tentang manajemen risiko",
  "emotionalAnalysis": "analisis psikologi trading berdasarkan konten jurnal",
  "score": 75
}

Nilai score dari 0-100 berdasarkan kualitas analisis, disiplin, dan manajemen risiko.
HANYA return JSON, tanpa penjelasan tambahan di luar JSON.`

  const userMessage = `Analisis jurnal trading berikut:

JUDUL: ${journal.title}

KONTEN JURNAL:
${journal.content}

DATA TRADE:
${tradeContext}

TAGS: ${Array.isArray(journal.tags) ? journal.tags.join(', ') : 'tidak ada'}

Berikan analisis mendalam dalam format JSON.`

  const rawResponse = await callClaude(systemPrompt, userMessage)

  // Parse JSON response
  let analysis
  try {
    const cleaned = rawResponse.replace(/```json|```/g, '').trim()
    analysis = JSON.parse(cleaned)
  } catch {
    analysis = { raw: rawResponse, parseError: true }
  }

  // Simpan hasil analisis sebagai notifikasi
  await prisma.notification.create({
    data: {
      userId,
      type:    'ai_analysis_complete',
      title:   '🤖 Analisis AI selesai!',
      message: `Analisis jurnal "${journal.title}" sudah selesai. Skor: ${analysis.score || 'N/A'}/100`,
      data:    { journalId, score: analysis.score },
    },
  })

  return { journalId, title: journal.title, analysis }
}

//  ANALYZE TRADE — AI analisis satu trade spesifik
const analyzeTrade = async (tradeId, userId) => {
  await assertAIAccess(userId)

  const trade = await prisma.journalTrade.findUnique({
    where:   { id: tradeId },
    include: { journal: { select: { userId: true, title: true, content: true } } },
  })

  if (!trade)                         throw { status: 404, message: 'Trade tidak ditemukan.' }
  if (trade.journal.userId !== userId) throw { status: 403, message: 'Akses ditolak.' }

  const systemPrompt = `Kamu adalah AI trading analyst untuk crypto. Analisis trade berikut dan berikan feedback dalam Bahasa Indonesia yang profesional.

Return HANYA JSON dengan format:
{
  "verdict": "good_trade | bad_trade | neutral",
  "summary": "ringkasan singkat tentang trade ini",
  "entryAnalysis": "analisis timing dan harga entry",
  "exitAnalysis": "analisis timing dan harga exit (jika sudah closed)",
  "riskManagement": "penilaian manajemen risiko trade ini",
  "mistakes": ["kesalahan 1 jika ada"],
  "goodDecisions": ["keputusan baik 1 jika ada"],
  "lesson": "pelajaran utama dari trade ini",
  "improvementTips": ["tip perbaikan 1", "tip perbaikan 2"]
}`

  const userMessage = `Analisis trade berikut:

Coin: ${trade.coinSymbol} (${trade.coinName})
Tipe: ${trade.tradeType.toUpperCase()}
Entry Price: $${Number(trade.entryPrice).toFixed(6)}
Exit Price: ${trade.exitPrice ? '$' + Number(trade.exitPrice).toFixed(6) : 'Belum closed (open)'}
Quantity: ${trade.quantity}
PnL Amount: ${trade.pnlAmount ? (Number(trade.pnlAmount) >= 0 ? '+' : '') + '$' + Number(trade.pnlAmount).toFixed(2) : 'N/A'}
PnL %: ${trade.pnlPercent ? Number(trade.pnlPercent).toFixed(2) + '%' : 'N/A'}
Status: ${trade.status}
Exchange: ${trade.exchange || 'N/A'}
Tanggal Trade: ${new Date(trade.tradeDate).toLocaleDateString('id-ID')}

Konteks Jurnal: "${trade.journal.title}"
${trade.journal.content ? 'Catatan trader: ' + trade.journal.content.substring(0, 500) : ''}`

  const rawResponse = await callClaude(systemPrompt, userMessage)

  let analysis
  try {
    const cleaned = rawResponse.replace(/```json|```/g, '').trim()
    analysis = JSON.parse(cleaned)
  } catch {
    analysis = { raw: rawResponse, parseError: true }
  }

  return { tradeId, coinSymbol: trade.coinSymbol, analysis }
}

//  ANALYZE PERFORMANCE — AI analisis keseluruhan performa user
const analyzePerformance = async (userId) => {
  await assertAIAccess(userId)

  // Ambil data trade 3 bulan terakhir
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const [trades, journals] = await Promise.all([
    prisma.journalTrade.findMany({
      where: {
        journal:   { userId },
        tradeDate: { gte: threeMonthsAgo },
      },
      select: {
        coinSymbol: true, tradeType: true,
        pnlAmount: true, pnlPercent: true,
        status: true, tradeDate: true,
      },
      orderBy: { tradeDate: 'asc' },
    }),
    prisma.journal.count({ where: { userId, createdAt: { gte: threeMonthsAgo } } }),
  ])

  const closed  = trades.filter(t => t.status === 'closed' && t.pnlAmount !== null)
  const wins    = closed.filter(t => Number(t.pnlAmount) > 0)
  const totalPnl = closed.reduce((s, t) => s + Number(t.pnlAmount), 0)

  // Coin performance summary
  const coinSummary = {}
  closed.forEach(t => {
    if (!coinSummary[t.coinSymbol]) coinSummary[t.coinSymbol] = { count: 0, pnl: 0 }
    coinSummary[t.coinSymbol].count++
    coinSummary[t.coinSymbol].pnl += Number(t.pnlAmount)
  })

  const systemPrompt = `Kamu adalah AI trading coach senior untuk crypto trader Indonesia. 
Berikan analisis performa mendalam dan roadmap pengembangan dalam Bahasa Indonesia.

Return HANYA JSON:
{
  "overallAssessment": "penilaian keseluruhan 3-4 kalimat",
  "tradingStyle": "identifikasi gaya trading berdasarkan data",
  "topStrengths": ["kekuatan utama 1", "kekuatan utama 2"],
  "criticalWeaknesses": ["kelemahan kritis 1", "kelemahan kritis 2"],
  "patternAnalysis": "analisis pola dari data trade",
  "psychologyInsight": "insight psikologi trading",
  "weeklyGoals": ["goal minggu ini 1", "goal minggu ini 2", "goal minggu ini 3"],
  "monthlyPlan": "rencana perbaikan 1 bulan ke depan",
  "riskScore": 65,
  "consistencyScore": 70,
  "overallScore": 68
}`

  const userMessage = `Analisis performa trading 3 bulan terakhir:

STATISTIK UMUM:
- Total trade: ${trades.length}
- Trade closed: ${closed.length}
- Win: ${wins.length} | Loss: ${closed.length - wins.length}
- Win Rate: ${closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) : 0}%
- Total PnL: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}
- Total jurnal ditulis: ${journals}

PERFORMA PER COIN (top 5):
${Object.entries(coinSummary)
    .sort((a, b) => Math.abs(b[1].pnl) - Math.abs(a[1].pnl))
    .slice(0, 5)
    .map(([sym, data]) => `- ${sym}: ${data.count} trade, PnL ${data.pnl >= 0 ? '+' : ''}$${data.pnl.toFixed(2)}`)
    .join('\n')}

Long trades: ${trades.filter(t => t.tradeType === 'long').length}
Short trades: ${trades.filter(t => t.tradeType === 'short').length}

Berikan analisis mendalam dan actionable.`

  const rawResponse = await callClaude(systemPrompt, userMessage)

  let analysis
  try {
    const cleaned = rawResponse.replace(/```json|```/g, '').trim()
    analysis = JSON.parse(cleaned)
  } catch {
    analysis = { raw: rawResponse, parseError: true }
  }

  return { period: '3 bulan terakhir', tradeCount: trades.length, analysis }
}

//  AI CHAT — tanya jawab bebas tentang trading
const chatWithAI = async (userId, messages) => {
  await assertAIAccess(userId)

  // Ambil context user (statistik singkat)
  const [tradeCount, winCount, totalPnl] = await Promise.all([
    prisma.journalTrade.count({ where: { journal: { userId }, status: 'closed' } }),
    prisma.journalTrade.count({
      where: { journal: { userId }, status: 'closed', pnlAmount: { gt: 0 } },
    }),
    prisma.journalTrade.aggregate({
      where: { journal: { userId }, status: 'closed' },
      _sum:  { pnlAmount: true },
    }),
  ])

  const winRate = tradeCount > 0 ? ((winCount / tradeCount) * 100).toFixed(1) : 0
  const pnl     = Number(totalPnl._sum.pnlAmount || 0).toFixed(2)

  const systemPrompt = `Kamu adalah AI trading coach untuk crypto trader. Nama kamu CJ (CryptoJournal AI).

Konteks user ini:
- Total closed trades: ${tradeCount}
- Win rate: ${winRate}%
- Total PnL: $${pnl}

Jawab dalam Bahasa Indonesia yang friendly dan profesional.
Fokus pada analisis teknikal, psikologi trading, manajemen risiko, dan strategi crypto.
Jangan pernah rekomendasikan investasi spesifik atau jaminkan profit.`

  // Format messages untuk API
  const formattedMessages = messages.map(m => ({
    role:    m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system:     systemPrompt,
      messages:   formattedMessages,
    }),
  })

  if (!response.ok) {
    const err = await response.json()
    throw { status: 503, message: `Claude API error: ${err.error?.message || 'Unknown error'}` }
  }

  const data  = await response.json()
  const reply = data.content[0].text

  return { reply, role: 'assistant' }
}

module.exports = { analyzeJournal, analyzeTrade, analyzePerformance, chatWithAI }
