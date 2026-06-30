const prisma = require('../utils/prisma')

//  GET INSTRUMENTS — dengan filter per type
const getInstruments = async (query) => {
  const { type, exchange, search, page = 1, limit = 50 } = query
  const skip  = (Number(page) - 1) * Number(limit)
  const where = { isActive: true }

  if (type)     where.type     = type
  if (exchange) where.exchange = { contains: exchange }
  if (search) {
    where.OR = [
      { symbol: { contains: search.toUpperCase() } },
      { name:   { contains: search } },
    ]
  }

  const [instruments, total] = await Promise.all([
    prisma.instrument.findMany({
      where,
      skip,
      take:    Number(limit),
      orderBy: [{ type: 'asc' }, { symbol: 'asc' }],
    }),
    prisma.instrument.count({ where }),
  ])

  return { instruments, meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } }
}

//  GET INSTRUMENT BY SYMBOL
const getBySymbol = async (symbol) => {
  const instrument = await prisma.instrument.findUnique({
    where: { symbol: symbol.toUpperCase() },
  })
  if (!instrument) throw { status: 404, message: `Instrumen ${symbol} tidak ditemukan.` }
  return instrument
}

//  KALKULASI PnL UNIVERSAL
//  Handle semua instrument type dengan logika yang berbeda
const calculatePnL = (data) => {
  const {
    instrumentType, tradeType,
    entryPrice, exitPrice, quantity,
    lotSize, pipSize, contractSize,
    commission = 0, swap = 0,
  } = data

  if (!exitPrice) return {
    pnlAmount: null, pnlPercent: null,
    pnlPips: null, pipCount: null,
  }

  const entry  = Number(entryPrice)
  const exit   = Number(exitPrice)
  const qty    = Number(quantity)
  const comm   = Number(commission)
  const swapFee = Number(swap)

  let pnlAmount = 0
  let pnlPips   = null
  let pipCount  = null
  let cSize     = 1   // dipakai juga di luar blok if untuk konsistensi cost di bawah

  if (instrumentType === 'forex' || instrumentType === 'commodity' || instrumentType === 'index') {
    // Forex/Commodity: PnL = (exit - entry) × contractSize × qty - commission - swap
    // Untuk Short: (entry - exit) × contractSize × qty
    const lot = Number(lotSize || 100000)
    cSize     = contractSize ? Number(contractSize) : lot

    if (tradeType === 'long' || tradeType === 'buy') {
      pnlAmount = (exit - entry) * cSize * qty
    } else {
      pnlAmount = (entry - exit) * cSize * qty
    }

    // Hitung pip
    if (pipSize) {
      const pip = Number(pipSize)
      pipCount  = tradeType === 'long' || tradeType === 'buy'
        ? (exit - entry) / pip
        : (entry - exit) / pip
      pnlPips   = parseFloat(pipCount.toFixed(1))
    }

    pnlAmount = pnlAmount - comm - swapFee

  } else {
    // Crypto / Spot / Futures: PnL = (exit - entry) × qty
    cSize = 1   // tidak ada contract size, qty langsung dalam unit aset
    if (tradeType === 'long' || tradeType === 'buy') {
      pnlAmount = (exit - entry) * qty
    } else {
      pnlAmount = (entry - exit) * qty
    }
    pnlAmount = pnlAmount - comm
  }

  // FIX: cost harus dihitung dengan cSize yang SAMA dengan yang dipakai pnlAmount,
  // kalau tidak, pnlPercent akan meledak karena membandingkan skala yang beda
  // (sebelumnya cost = entry * qty saja, tanpa cSize, padahal pnlAmount sudah dikali cSize)
  const cost       = entry * cSize * qty
  const pnlPercent = cost > 0 ? (pnlAmount / cost) * 100 : 0

  return {
    pnlAmount:  parseFloat(pnlAmount.toFixed(8)),
    pnlPercent: parseFloat(pnlPercent.toFixed(4)),
    pnlPips:    pnlPips,
    pipCount:   pipCount ? parseFloat(pipCount.toFixed(1)) : null,
  }
}

//  RISK CALCULATOR
//  Hitung lot size optimal berdasarkan risk management
const calculateRisk = (data) => {
  const {
    instrumentType, symbol,
    accountBalance, riskPercent,
    entryPrice, stopLoss,
    pipSize, lotSize: stdLotSize,
    leverage = 1,
  } = data

  const balance    = Number(accountBalance)
  const riskPct    = Number(riskPercent) / 100
  const riskAmount = balance * riskPct
  const entry      = Number(entryPrice)
  const sl         = Number(stopLoss)

  if (!entry || !sl || entry === sl) {
    throw { status: 400, message: 'Entry price dan stop loss tidak valid.' }
  }

  const priceDiff  = Math.abs(entry - sl)
  let   lotSizeRec = 0
  let   pipCountSL = 0

  if (instrumentType === 'forex') {
    const pip    = Number(pipSize || 0.0001)
    const stdLot = Number(stdLotSize || 100000)
    pipCountSL   = priceDiff / pip

    // Nilai 1 pip per standard lot (dalam quote currency)
    // Untuk pair XXX/USD: pip value = pip × lot size
    const pipValuePerLot = pip * stdLot
    lotSizeRec = riskAmount / (pipCountSL * pipValuePerLot)

  } else if (instrumentType === 'commodity') {
    // XAU/USD: 1 lot = 100 oz, pip = $0.01
    const cSize  = Number(stdLotSize || 100)
    lotSizeRec   = riskAmount / (priceDiff * cSize)

  } else {
    // Crypto: langsung dari harga
    lotSizeRec   = riskAmount / priceDiff
  }

  // Hitung margin yang dibutuhkan
  const marginRequired = (entry * lotSizeRec * (stdLotSize || 1)) / leverage

  return {
    riskAmount:        parseFloat(riskAmount.toFixed(2)),
    riskPercent:       Number(riskPercent),
    recommendedLot:    parseFloat(lotSizeRec.toFixed(2)),
    recommendedQty:    parseFloat(lotSizeRec.toFixed(6)),
    stopLossPips:      pipCountSL ? parseFloat(pipCountSL.toFixed(1)) : null,
    marginRequired:    parseFloat(marginRequired.toFixed(2)),
    potentialLoss:     parseFloat(riskAmount.toFixed(2)),
    riskRewardNeeded:  '1:2 (TP should be ' + parseFloat((priceDiff * 2).toFixed(5)) + ' from entry)',
  }
}

module.exports = { getInstruments, getBySymbol, calculatePnL, calculateRisk }