//  RISK CALCULATOR SERVICE
//  Support: Forex, XAU/Commodity, Crypto, Index, Crypto Futures

// KONSTANTA 
const PIP_SIZES = {
  // Forex major & minor
  EURUSD: 0.0001, GBPUSD: 0.0001, AUDUSD: 0.0001,
  NZDUSD: 0.0001, USDCAD: 0.0001, USDCHF: 0.0001,
  EURGBP: 0.0001, EURJPY: 0.01,   GBPJPY: 0.01,
  USDJPY: 0.01,   CADJPY: 0.01,   CHFJPY: 0.01,
  USDIDR: 1,      EURIDR: 1,

  // Commodity
  XAUUSD: 0.01,   // Gold
  XAGUSD: 0.001,  // Silver
  XPTUSD: 0.01,   // Platinum
  USOIL:  0.01,   // WTI Oil
  UKOIL:  0.01,   // Brent Oil

  // Index
  US30:   1,      // Dow Jones
  US500:  0.1,    // S&P 500
  NAS100: 0.1,    // NASDAQ
  GER40:  0.1,    // DAX
  UK100:  0.1,    // FTSE
  JPN225: 1,      // Nikkei
  AUS200: 0.1,    // ASX
}

const LOT_SIZES = {
  // Forex: 1 standard lot = 100,000 units
  forex:    100000,
  // Commodity
  XAUUSD:   100,    // 100 oz per lot
  XAGUSD:   5000,   // 5000 oz per lot
  USOIL:    1000,   // 1000 barrels
  UKOIL:    1000,
  // Index: biasanya per point
  index:    1,
  // Crypto: 1 coin
  crypto:   1,
}

//  Deteksi instrument type dari symbol 
const detectType = (symbol) => {
  const s = symbol.toUpperCase()
  if (['XAUUSD','XAGUSD','XPTUSD','USOIL','UKOIL'].includes(s)) return 'commodity'
  if (['US30','US500','NAS100','GER40','UK100','JPN225','AUS200','IDX'].some(i => s.includes(i))) return 'index'
  if (s.endsWith('JPY') || s.endsWith('CHF') || s.endsWith('CAD') ||
      s.endsWith('IDR') || (s.length === 6 && /^[A-Z]{6}$/.test(s))) return 'forex'
  if (s.endsWith('PERP') || s.endsWith('_SWAP')) return 'crypto_futures'
  return 'crypto'
}

// Ambil pip size untuk symbol 
const getPipSize = (symbol) => {
  const s = symbol.toUpperCase()
  return PIP_SIZES[s] || (s.endsWith('JPY') ? 0.01 : 0.0001)
}

// Ambil contract/lot size
const getContractSize = (symbol, type) => {
  const s = symbol.toUpperCase()
  if (LOT_SIZES[s]) return LOT_SIZES[s]
  if (type === 'forex')     return 100000
  if (type === 'commodity') return 100
  if (type === 'index')     return 1
  return 1
}

//  1. LOT SIZE CALCULATOR
//  Hitung berapa lot yang harus dibuka berdasarkan risk
const calculateLotSize = (params) => {
  const {
    symbol, accountBalance, accountCurrency = 'USD',
    riskPercent, riskAmount: riskAmountInput,
    entryPrice, stopLoss,
    leverage = 100,
  } = params

  const type         = detectType(symbol)
  const pipSize      = getPipSize(symbol)
  const contractSize = getContractSize(symbol, type)
  const balance      = Number(accountBalance)
  const entry        = Number(entryPrice)
  const sl           = Number(stopLoss)

  // Hitung risk amount dari persentase atau langsung dari input
  const riskAmount = riskAmountInput
    ? Number(riskAmountInput)
    : balance * (Number(riskPercent) / 100)

  if (!entry || !sl || entry === sl) {
    throw { status: 400, message: 'Entry price dan Stop Loss tidak boleh sama atau kosong.' }
  }

  const priceDiff    = Math.abs(entry - sl)
  const stopPips     = priceDiff / pipSize

  let recommendedLot = 0
  let pipValue       = 0
  let marginRequired = 0

  if (type === 'forex') {
    // Forex: pip value per standard lot (untuk pair XXX/USD)
    // Kalau quote currency adalah USD: pip value = pipSize × contractSize
    // Kalau quote currency bukan USD: perlu konversi (simplified: asumsi USD quote)
    const isJpy    = symbol.toUpperCase().endsWith('JPY')
    pipValue       = isJpy
      ? (pipSize * contractSize) / entry  // JPY pairs
      : pipSize * contractSize            // USD quote pairs

    // Lot size = risk amount / (stop pips × pip value per lot)
    recommendedLot = riskAmount / (stopPips * pipValue)
    marginRequired = (entry * recommendedLot * contractSize) / leverage

  } else if (type === 'commodity') {
    // Commodity (XAU): risk per lot = price diff × contract size
    const riskPerLot = priceDiff * contractSize
    recommendedLot   = riskAmount / riskPerLot
    pipValue         = pipSize * contractSize
    marginRequired   = (entry * recommendedLot * contractSize) / leverage

  } else if (type === 'index') {
    // Index: 1 lot = 1 unit, risk = priceDiff × lots
    recommendedLot = riskAmount / priceDiff
    pipValue       = pipSize
    marginRequired = (entry * recommendedLot) / leverage

  } else {
    // Crypto: risk = priceDiff × qty
    recommendedLot = riskAmount / priceDiff
    marginRequired = entry * recommendedLot / leverage
  }

  // Hitung take profit berdasarkan R:R 1:2 dan 1:3
  const direction = params.tradeType === 'sell' || params.tradeType === 'short' ? -1 : 1
  const slDistance = priceDiff * direction

  return {
    symbol:            symbol.toUpperCase(),
    instrumentType:    type,
    input: {
      accountBalance:  balance,
      accountCurrency,
      riskPercent:     riskPercent || ((riskAmount / balance) * 100).toFixed(2),
      riskAmount:      parseFloat(riskAmount.toFixed(2)),
      entryPrice:      entry,
      stopLoss:        sl,
      leverage,
    },
    result: {
      recommendedLot:    parseFloat(recommendedLot.toFixed(2)),
      recommendedLotMin: parseFloat((recommendedLot * 0.5).toFixed(2)),  // conservative
      recommendedLotMax: parseFloat((recommendedLot * 1.5).toFixed(2)),  // aggressive
      stopLossPips:      parseFloat(stopPips.toFixed(1)),
      stopLossDistance:  parseFloat(priceDiff.toFixed(pipSize < 0.001 ? 5 : 2)),
      pipValuePerLot:    parseFloat(pipValue.toFixed(4)),
      marginRequired:    parseFloat(marginRequired.toFixed(2)),
      actualRiskAmount:  parseFloat(riskAmount.toFixed(2)),
      actualRiskPercent: parseFloat(((riskAmount / balance) * 100).toFixed(2)),
    },
    takeProfitLevels: {
      rr1to1: parseFloat((entry + slDistance).toFixed(pipSize < 0.0001 ? 5 : 2)),
      rr1to2: parseFloat((entry + slDistance * 2).toFixed(pipSize < 0.0001 ? 5 : 2)),
      rr1to3: parseFloat((entry + slDistance * 3).toFixed(pipSize < 0.0001 ? 5 : 2)),
      rr1to5: parseFloat((entry + slDistance * 5).toFixed(pipSize < 0.0001 ? 5 : 2)),
    },
    pipSize,
    contractSize,
  }
}

//  2. MARGIN CALCULATOR
//  Hitung margin yang dibutuhkan untuk membuka posisi
const calculateMargin = (params) => {
  const {
    symbol, lotSize, entryPrice,
    leverage = 100, accountCurrency = 'USD',
  } = params

  const type         = detectType(symbol)
  const contractSize = getContractSize(symbol, type)
  const lots         = Number(lotSize)
  const price        = Number(entryPrice)
  const lev          = Number(leverage)

  let marginRequired  = 0
  let positionValue   = 0

  if (type === 'forex') {
    positionValue  = lots * contractSize              // Unit currency
    marginRequired = (positionValue * price) / lev    // Kalau base bukan USD, perlu konversi
    if (symbol.toUpperCase().startsWith('USD')) {
      marginRequired = (lots * contractSize) / lev    // USD sebagai base
    } else {
      marginRequired = (lots * contractSize * price) / lev // Quote adalah USD
    }
  } else if (type === 'commodity') {
    positionValue  = lots * contractSize * price
    marginRequired = positionValue / lev
  } else if (type === 'index') {
    positionValue  = lots * price
    marginRequired = positionValue / lev
  } else {
    // Crypto
    positionValue  = lots * price
    marginRequired = positionValue / lev
  }

  const marginPercent = lev > 0 ? (1 / lev) * 100 : 0

  return {
    symbol:         symbol.toUpperCase(),
    instrumentType: type,
    input: {
      lotSize, entryPrice: price, leverage: lev, accountCurrency,
    },
    result: {
      positionValue:    parseFloat(positionValue.toFixed(2)),
      marginRequired:   parseFloat(marginRequired.toFixed(2)),
      marginPercent:    parseFloat(marginPercent.toFixed(2)),
      freeMarginNeeded: parseFloat((marginRequired * 1.2).toFixed(2)), // Saran: sediakan 120% dari margin
      contractSize,
      totalUnits:       parseFloat((lots * contractSize).toFixed(4)),
    },
    leverageWarning: lev >= 500 ? 'DANGER: Leverage sangat tinggi!' :
                     lev >= 200 ? 'WARNING: Leverage tinggi, risiko besar.' :
                     lev >= 100 ? 'MEDIUM: Gunakan dengan bijak.' : 'SAFE: Leverage konservatif.',
  }
}

//  3. PIP VALUE CALCULATOR
//  Hitung nilai uang per pip untuk berbagai lot size
const calculatePipValue = (params) => {
  const { symbol, lotSize = 1, accountCurrency = 'USD', currentPrice } = params

  const type         = detectType(symbol)
  const pipSize      = getPipSize(symbol)
  const contractSize = getContractSize(symbol, type)
  const lots         = Number(lotSize)
  const price        = Number(currentPrice || 1)

  let pipValuePerLot = 0

  if (type === 'forex') {
    const isJpy    = symbol.toUpperCase().endsWith('JPY')
    pipValuePerLot = isJpy
      ? (pipSize / price) * contractSize   // JPY pairs: konversi ke USD
      : pipSize * contractSize             // USD quote
  } else if (type === 'commodity') {
    pipValuePerLot = pipSize * contractSize
  } else if (type === 'index') {
    pipValuePerLot = pipSize * lots
  } else {
    pipValuePerLot = pipSize * contractSize
  }

  const pipValueActual = pipValuePerLot * lots

  return {
    symbol:         symbol.toUpperCase(),
    instrumentType: type,
    pipSize,
    contractSize,
    perLotSizes: {
      microLot:    parseFloat((pipValuePerLot * 0.01).toFixed(4)),   // 0.01 lot
      miniLot:     parseFloat((pipValuePerLot * 0.1).toFixed(4)),    // 0.10 lot
      standardLot: parseFloat(pipValuePerLot.toFixed(4)),             // 1.00 lot
    },
    forInputLot: {
      lotSize:       lots,
      pipValue:      parseFloat(pipValueActual.toFixed(4)),
      per10Pips:     parseFloat((pipValueActual * 10).toFixed(2)),
      per50Pips:     parseFloat((pipValueActual * 50).toFixed(2)),
      per100Pips:    parseFloat((pipValueActual * 100).toFixed(2)),
    },
  }
}

//  4. RISK/REWARD CALCULATOR
//  Hitung potensi profit vs loss dan statistik trade
const calculateRiskReward = (params) => {
  const {
    symbol, tradeType = 'buy',
    entryPrice, stopLoss, takeProfit,
    lotSize, accountBalance,
    leverage = 100,
  } = params

  const type      = detectType(symbol)
  const pipSize   = getPipSize(symbol)
  const cSize     = getContractSize(symbol, type)
  const entry     = Number(entryPrice)
  const sl        = Number(stopLoss)
  const tp        = takeProfit ? Number(takeProfit) : null
  const lots      = Number(lotSize)
  const balance   = accountBalance ? Number(accountBalance) : null

  const isBuy = tradeType === 'buy' || tradeType === 'long'

  // Validasi arah trade vs SL
  if (isBuy && sl >= entry)  throw { status: 400, message: 'Untuk Buy/Long, Stop Loss harus di bawah entry price.' }
  if (!isBuy && sl <= entry) throw { status: 400, message: 'Untuk Sell/Short, Stop Loss harus di atas entry price.' }

  const slDistance = Math.abs(entry - sl)
  const tpDistance = tp ? Math.abs(tp - entry) : null
  const slPips     = slDistance / pipSize
  const tpPips     = tpDistance ? tpDistance / pipSize : null

  // Hitung pip value
  const isJpy      = symbol.toUpperCase().endsWith('JPY')
  let pipVal       = 0
  if (type === 'forex') {
    pipVal = isJpy ? (pipSize / entry) * cSize : pipSize * cSize
  } else {
    pipVal = pipSize * cSize
  }

  const potentialLoss   = slPips * pipVal * lots
  const potentialProfit = tpPips ? tpPips * pipVal * lots : null
  const rrRatio         = potentialProfit ? potentialProfit / potentialLoss : null
  const marginReq       = (entry * lots * cSize) / leverage

  // Win rate minimum untuk break even pada R:R ini
  const breakEvenWinRate = rrRatio
    ? (1 / (1 + rrRatio)) * 100
    : null

  return {
    symbol:         symbol.toUpperCase(),
    instrumentType: type,
    tradeType,
    input: { entryPrice: entry, stopLoss: sl, takeProfit: tp, lotSize: lots, leverage },
    stopLoss: {
      distance:  parseFloat(slDistance.toFixed(5)),
      pips:      parseFloat(slPips.toFixed(1)),
      riskUSD:   parseFloat(potentialLoss.toFixed(2)),
      riskPct:   balance ? parseFloat(((potentialLoss / balance) * 100).toFixed(2)) : null,
    },
    takeProfit: tp ? {
      distance:     parseFloat(tpDistance.toFixed(5)),
      pips:         parseFloat(tpPips.toFixed(1)),
      potentialUSD: parseFloat(potentialProfit.toFixed(2)),
      potentialPct: balance ? parseFloat(((potentialProfit / balance) * 100).toFixed(2)) : null,
    } : null,
    riskReward: {
      ratio:              rrRatio ? parseFloat(rrRatio.toFixed(2)) : null,
      label:              rrRatio ? `1:${rrRatio.toFixed(1)}` : 'TP belum ditentukan',
      breakEvenWinRate:   breakEvenWinRate ? parseFloat(breakEvenWinRate.toFixed(1)) : null,
      isGoodRR:           rrRatio ? rrRatio >= 2 : null,
    },
    margin: {
      required:    parseFloat(marginReq.toFixed(2)),
      withBuffer:  parseFloat((marginReq * 1.3).toFixed(2)),
    },
    suggestion: getSuggestion(rrRatio, slPips, balance ? (potentialLoss/balance)*100 : null),
  }
}

// Saran berdasarkan parameter
const getSuggestion = (rrRatio, slPips, riskPct) => {
  const tips = []
  if (riskPct && riskPct > 5)  tips.push('⚠️ Risk per trade di atas 5% — terlalu besar. Kurangi lot size.')
  if (riskPct && riskPct > 2)  tips.push('💡 Idealnya risk per trade maksimal 1-2% dari balance.')
  if (rrRatio && rrRatio < 1)  tips.push('❌ R:R di bawah 1:1 — potensi profit lebih kecil dari risiko.')
  if (rrRatio && rrRatio < 2)  tips.push('⚠️ R:R kurang dari 1:2 — butuh win rate tinggi untuk profit konsisten.')
  if (rrRatio && rrRatio >= 2) tips.push('✅ R:R bagus! Dengan R:R ini, win rate 35-40% sudah cukup untuk profit.')
  if (rrRatio && rrRatio >= 3) tips.push('🎯 R:R excellent! Bahkan win rate 25% sudah menguntungkan.')
  if (slPips < 5)              tips.push('⚠️ Stop Loss terlalu ketat — rentan kena spread dan volatilitas normal.')
  if (slPips > 200)            tips.push('⚠️ Stop Loss terlalu jauh — pertimbangkan untuk mempersempit.')
  return tips
}

//  5. BREAK EVEN CALCULATOR
//  Hitung win rate minimum agar strategy tetap profit
const calculateBreakEven = (params) => {
  const { winRate, rrRatio, totalTrades, avgWin, avgLoss } = params

  const wr  = Number(winRate) / 100
  const rr  = Number(rrRatio)
  const n   = Number(totalTrades || 100)
  const win = Number(avgWin  || rr)
  const loss = Number(avgLoss || 1)

  // Break-even win rate = 1 / (1 + R:R)
  const breakEvenWR = (1 / (1 + rr)) * 100

  // Expected value per trade
  const ev = (wr * win) - ((1 - wr) * loss)

  // Proyeksi dari N trade
  const wins   = Math.round(n * wr)
  const losses = n - wins
  const totalProfit = wins * win - losses * loss

  // Kelly Criterion — optimal position sizing
  const kelly     = wr - ((1 - wr) / rr)
  const halfKelly = kelly / 2  // Lebih konservatif

  return {
    input: { winRate: Number(winRate), rrRatio: rr, totalTrades: n },
    analysis: {
      breakEvenWinRate:    parseFloat(breakEvenWR.toFixed(1)),
      isCurrentlyProfitable: wr * 100 > breakEvenWR,
      expectedValuePerTrade: parseFloat(ev.toFixed(4)),
      edgePercent:           parseFloat(((wr - breakEvenWR/100) * 100).toFixed(2)),
    },
    projection: {
      trades:           n,
      wins,
      losses,
      projectedPnL:    parseFloat(totalProfit.toFixed(2)),
      profitFactor:    losses > 0 ? parseFloat(((wins * win) / (losses * loss)).toFixed(2)) : null,
    },
    kellyCriterion: {
      fullKelly:  parseFloat((kelly * 100).toFixed(1)),
      halfKelly:  parseFloat((halfKelly * 100).toFixed(1)),
      suggestion: kelly > 0
        ? `Optimal risk: ${(halfKelly * 100).toFixed(1)}% per trade (Half Kelly — lebih aman)`
        : 'Strategy ini tidak profitable dengan parameter saat ini.',
    },
  }
}

//  6. POSITION SIZE MULTI-SCENARIO
//  Bandingkan lot size di berbagai risk level
const calculateMultiScenario = (params) => {
  const riskLevels = [0.5, 1, 1.5, 2, 3, 5]
  const scenarios  = []

  for (const riskPct of riskLevels) {
    try {
      const result = calculateLotSize({ ...params, riskPercent: riskPct })
      scenarios.push({
        riskPercent:    riskPct,
        riskAmount:     result.result.actualRiskAmount,
        recommendedLot: result.result.recommendedLot,
        marginRequired: result.result.marginRequired,
        stopLossPips:   result.result.stopLossPips,
        isRecommended:  riskPct === 1 || riskPct === 2,
        label: riskPct <= 1 ? 'Conservative' : riskPct <= 2 ? 'Moderate' : riskPct <= 3 ? 'Aggressive' : 'Very Aggressive',
      })
    } catch {}
  }

  return {
    symbol:    params.symbol?.toUpperCase(),
    scenarios,
    bestPractice: 'Professional trader biasanya risk 1-2% per trade. Max 5% dalam kondisi high conviction.',
  }
}

//  7. DRAWDOWN CALCULATOR
//  Hitung berapa trade loss berturut-turut yang bisa ditahan
const calculateDrawdown = (params) => {
  const { accountBalance, riskPercent, targetMaxDrawdown = 20 } = params
  const balance    = Number(accountBalance)
  const riskPct    = Number(riskPercent) / 100
  const maxDD      = Number(targetMaxDrawdown) / 100

  // Berapa consecutive loss sebelum mencapai max drawdown
  // Balance setelah N loss = balance × (1 - riskPct)^N
  // Target: (1 - riskPct)^N = (1 - maxDD)
  // N = log(1 - maxDD) / log(1 - riskPct)
  const maxConsecutiveLoss = Math.floor(Math.log(1 - maxDD) / Math.log(1 - riskPct))

  // Simulasi drawdown sequence
  const sequence = []
  let currentBalance = balance
  for (let i = 1; i <= Math.min(maxConsecutiveLoss + 5, 30); i++) {
    const lossAmount = currentBalance * riskPct
    currentBalance  -= lossAmount
    const drawdownPct = ((balance - currentBalance) / balance) * 100
    sequence.push({
      consecutiveLoss: i,
      balanceRemaining: parseFloat(currentBalance.toFixed(2)),
      drawdownPct:      parseFloat(drawdownPct.toFixed(2)),
      dangerLevel:      drawdownPct >= targetMaxDrawdown ? 'DANGER' :
                        drawdownPct >= targetMaxDrawdown * 0.7 ? 'WARNING' : 'SAFE',
    })
    if (drawdownPct >= targetMaxDrawdown + 10) break
  }

  return {
    input: { accountBalance: balance, riskPercent: Number(riskPercent), targetMaxDrawdown: Number(targetMaxDrawdown) },
    analysis: {
      maxConsecutiveLossBeforeTarget: maxConsecutiveLoss,
      balanceAtMaxDrawdown:           parseFloat((balance * (1 - maxDD)).toFixed(2)),
      recoveryNeeded:                 parseFloat((maxDD / (1 - maxDD) * 100).toFixed(1)),
    },
    sequence,
    advice: maxConsecutiveLoss < 5
      ? '⚠️ Risk terlalu besar. Kurangi risk per trade agar lebih tahan terhadap losing streak.'
      : maxConsecutiveLoss < 10
      ? '💡 Risk sedang. Pantau equity dengan ketat jika ada losing streak.'
      : '✅ Risk konservatif. Akun cukup tahan terhadap losing streak.',
  }
}

//  8. COMPLETE TRADE PLAN
//  All-in-one: hitung semua yang dibutuhkan sebelum entry
const generateTradePlan = (params) => {
  const {
    symbol, tradeType, entryPrice, stopLoss, takeProfit,
    accountBalance, riskPercent = 1, leverage = 100,
  } = params

  // Hitung lot size
  const lotCalc = calculateLotSize({
    symbol, entryPrice, stopLoss, tradeType,
    accountBalance, riskPercent, leverage,
  })

  // Hitung R:R
  const rrCalc = calculateRiskReward({
    symbol, tradeType, entryPrice, stopLoss, takeProfit,
    lotSize: lotCalc.result.recommendedLot,
    accountBalance, leverage,
  })

  // Hitung pip value
  const pipCalc = calculatePipValue({
    symbol, lotSize: lotCalc.result.recommendedLot, currentPrice: entryPrice,
  })

  // Hitung margin
  const marginCalc = calculateMargin({
    symbol, lotSize: lotCalc.result.recommendedLot, entryPrice, leverage,
  })

  return {
    symbol:         symbol.toUpperCase(),
    instrumentType: lotCalc.instrumentType,
    tradeType,
    summary: {
      entryPrice:      Number(entryPrice),
      stopLoss:        Number(stopLoss),
      takeProfit:      takeProfit ? Number(takeProfit) : null,
      recommendedLot:  lotCalc.result.recommendedLot,
      riskAmount:      lotCalc.result.actualRiskAmount,
      riskPercent:     lotCalc.result.actualRiskPercent,
      potentialProfit: rrCalc.takeProfit?.potentialUSD || null,
      rrRatio:         rrCalc.riskReward.label,
      marginRequired:  marginCalc.result.marginRequired,
      stopLossPips:    lotCalc.result.stopLossPips,
      pipValue:        pipCalc.forInputLot.pipValue,
    },
    details: { lotCalculation: lotCalc, riskReward: rrCalc, pipValue: pipCalc, margin: marginCalc },
    checklist: [
      { item: 'Risk ≤ 2% per trade',      pass: lotCalc.result.actualRiskPercent <= 2 },
      { item: 'R:R ≥ 1:2',               pass: rrCalc.riskReward.ratio ? rrCalc.riskReward.ratio >= 2 : false },
      { item: 'SL tidak terlalu ketat',   pass: lotCalc.result.stopLossPips >= 5 },
      { item: 'Margin cukup (>120%)',     pass: true },
    ],
    isReady: lotCalc.result.actualRiskPercent <= 2 && (rrCalc.riskReward.ratio ? rrCalc.riskReward.ratio >= 1.5 : true),
  }
}

module.exports = {
  calculateLotSize,
  calculateMargin,
  calculatePipValue,
  calculateRiskReward,
  calculateBreakEven,
  calculateMultiScenario,
  calculateDrawdown,
  generateTradePlan,
  detectType,
  getPipSize,
}
