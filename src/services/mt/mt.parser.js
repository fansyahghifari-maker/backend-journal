//  MT4/MT5 PARSER
//  Parse berbagai format export dari MetaTrader

// DETECT FORMAT 
const detectFormat = (content) => {
  if (content.includes('MetaTrader 5') || content.includes('MT5'))   return 'mt5_html'
  if (content.includes('MetaTrader 4') || content.includes('MT4'))   return 'mt4_html'
  if (content.includes('Deal') && content.includes('Entry'))         return 'mt5_csv'
  if (content.includes('Ticket') && content.includes('Open Time'))   return 'mt4_csv'
  return 'generic_csv'
}

// DETECT INSTRUMENT TYPE 
const detectInstrumentType = (symbol) => {
  if (!symbol) return 'forex'
  const s   = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const metals     = ['XAUUSD','XAGUSD','XPTUSD','GOLD','SILVER','XAUEUR']
  const energies   = ['USOIL','UKOIL','NGAS','BRENT','WTI']
  const indices    = ['US30','US500','NAS100','GER40','UK100','JPN225','AUS200','SP500','NASDAQ','DOW']
  const cryptoPairs = ['BTCUSD','ETHUSD','LTCUSD','XRPUSD']

  if (metals.some(m => s.includes(m)))           return 'commodity'
  if (energies.some(e => s.includes(e)))          return 'commodity'
  if (indices.some(i => s.includes(i)))           return 'index'
  if (cryptoPairs.some(c => s.includes(c)))       return 'crypto'
  if (/^[A-Z]{6}$/.test(s))                      return 'forex'
  return 'forex'
}

// NORMALIZE TRADE TYPE 
const normalizeTradeType = (type) => {
  if (!type) return 'buy'
  const t = type.toString().toLowerCase().trim()
  if (t === 'buy'  || t === '0' || t.includes('buy'))  return 'buy'
  if (t === 'sell' || t === '1' || t.includes('sell')) return 'sell'
  return 'buy'
}

//  PARSE MT5 CSV EXPORT
//  Format: Deals history dari MT5 Terminal
const parseMT5CSV = (content) => {
  const lines  = content.split('\n').map(l => l.trim()).filter(Boolean)
  const trades = []

  // Cari header line
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('deal') &&
        lines[i].toLowerCase().includes('symbol')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) return trades

  const headers = lines[headerIdx].split('\t').map(h => h.trim().toLowerCase())
  const colIdx  = {
    deal:       headers.findIndex(h => h.includes('deal')),
    time:       headers.findIndex(h => h.includes('time')),
    symbol:     headers.findIndex(h => h.includes('symbol')),
    type:       headers.findIndex(h => h.includes('type') || h.includes('direction')),
    volume:     headers.findIndex(h => h.includes('volume') || h.includes('lots')),
    price:      headers.findIndex(h => h.includes('price')),
    sl:         headers.findIndex(h => h === 'sl' || h.includes('stop loss')),
    tp:         headers.findIndex(h => h === 'tp' || h.includes('take profit')),
    profit:     headers.findIndex(h => h.includes('profit')),
    commission: headers.findIndex(h => h.includes('commission')),
    swap:       headers.findIndex(h => h.includes('swap')),
    comment:    headers.findIndex(h => h.includes('comment')),
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split('\t').map(c => c.trim().replace(/"/g, ''))
    if (cols.length < 5) continue

    const get = (idx) => idx >= 0 && idx < cols.length ? cols[idx] : ''

    const symbol     = get(colIdx.symbol)
    const typeStr    = get(colIdx.type)
    const profitStr  = get(colIdx.profit)
    const priceStr   = get(colIdx.price)
    const volumeStr  = get(colIdx.volume)
    const timeStr    = get(colIdx.time)

    if (!symbol || !priceStr) continue
    if (typeStr.toLowerCase().includes('balance') ||
        typeStr.toLowerCase().includes('credit')) continue

    const profit = parseFloat(profitStr) || 0
    const price  = parseFloat(priceStr)  || 0
    const volume = parseFloat(volumeStr) || 0

    if (!price || !volume) continue

    trades.push({
      externalTradeId: `MT5-${get(colIdx.deal) || i}`,
      symbol:          symbol.toUpperCase(),
      instrumentType:  detectInstrumentType(symbol),
      tradeType:       normalizeTradeType(typeStr),
      entryPrice:      price,
      exitPrice:       null,
      quantity:        volume,
      lotSize:         volume,
      pnlAmount:       profit !== 0 ? profit : null,
      commission:      parseFloat(get(colIdx.commission)) || 0,
      swap:            parseFloat(get(colIdx.swap)) || 0,
      stopLoss:        parseFloat(get(colIdx.sl))  || null,
      takeProfit:      parseFloat(get(colIdx.tp))  || null,
      notes:           get(colIdx.comment) || null,
      tradeDate:       timeStr ? new Date(timeStr).toISOString() : new Date().toISOString(),
      status:          profit !== 0 ? 'closed' : 'open',
      platform:        'mt5',
      raw:             { cols },
    })
  }

  return trades
}

//  PARSE MT4 CSV EXPORT
//  Format: Account History dari MT4 Terminal
const parseMT4CSV = (content) => {
  const lines  = content.split('\n').map(l => l.trim()).filter(Boolean)
  const trades = []

  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('ticket') &&
        lines[i].toLowerCase().includes('symbol')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) return []

  const headers = lines[headerIdx].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'))
  const colIdx  = {
    ticket:     headers.findIndex(h => h.includes('ticket')),
    openTime:   headers.findIndex(h => h.includes('open_time') || (h.includes('open') && h.includes('time'))),
    closeTime:  headers.findIndex(h => h.includes('close_time') || (h.includes('close') && h.includes('time'))),
    symbol:     headers.findIndex(h => h.includes('symbol') || h.includes('item')),
    type:       headers.findIndex(h => h.includes('type') || h.includes('direction')),
    lots:       headers.findIndex(h => h.includes('lots') || h.includes('size') || h.includes('volume')),
    openPrice:  headers.findIndex(h => h.includes('open_price') || (h.includes('open') && h.includes('price'))),
    closePrice: headers.findIndex(h => h.includes('close_price') || (h.includes('close') && h.includes('price'))),
    sl:         headers.findIndex(h => h === 'sl' || h.includes('stop_loss')),
    tp:         headers.findIndex(h => h === 'tp' || h.includes('take_profit')),
    commission: headers.findIndex(h => h.includes('commission')),
    swap:       headers.findIndex(h => h.includes('swap')),
    profit:     headers.findIndex(h => h.includes('profit')),
    comment:    headers.findIndex(h => h.includes('comment')),
  }

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''))
    if (cols.length < 5) continue

    const get = (idx) => idx >= 0 && idx < cols.length ? cols[idx] : ''

    const symbol     = get(colIdx.symbol)
    const typeStr    = get(colIdx.type)
    const openPrice  = parseFloat(get(colIdx.openPrice))
    const closePrice = parseFloat(get(colIdx.closePrice))
    const lots       = parseFloat(get(colIdx.lots))

    if (!symbol || !openPrice || !lots) continue
    if (['balance','credit','deposit','withdrawal'].some(t => typeStr.toLowerCase().includes(t))) continue

    const profit = parseFloat(get(colIdx.profit)) || 0

    trades.push({
      externalTradeId: `MT4-${get(colIdx.ticket) || i}`,
      symbol:          symbol.toUpperCase(),
      instrumentType:  detectInstrumentType(symbol),
      tradeType:       normalizeTradeType(typeStr),
      entryPrice:      openPrice,
      exitPrice:       closePrice && closePrice !== openPrice ? closePrice : null,
      quantity:        lots,
      lotSize:         lots,
      pnlAmount:       profit !== 0 ? profit : null,
      commission:      parseFloat(get(colIdx.commission)) || 0,
      swap:            parseFloat(get(colIdx.swap)) || 0,
      stopLoss:        parseFloat(get(colIdx.sl)) || null,
      takeProfit:      parseFloat(get(colIdx.tp)) || null,
      notes:           get(colIdx.comment) || null,
      tradeDate:       get(colIdx.openTime) ? new Date(get(colIdx.openTime)).toISOString() : new Date().toISOString(),
      closeDate:       get(colIdx.closeTime) ? new Date(get(colIdx.closeTime)).toISOString() : null,
      status:          closePrice && closePrice !== openPrice ? 'closed' : 'open',
      platform:        'mt4',
      raw:             { cols },
    })
  }

  return trades
}

//  PARSE MIFX STATEMENT (HTML/TXT dari MIFX client area)
const parseMIFXStatement = (content) => {
  // MIFX pakai MT4 base, format sama
  // Bersihkan HTML tags kalau ada
  const cleaned = content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
  return parseMT4CSV(cleaned)
}

// MAIN PARSE FUNCTION 
const parseFile = (content, platform = 'auto') => {
  const format = platform === 'auto' ? detectFormat(content) : platform

  let trades = []
  switch (format) {
    case 'mt5':
    case 'mt5_csv':
    case 'mt5_html': trades = parseMT5CSV(content);      break
    case 'mt4':
    case 'mt4_csv':
    case 'mt4_html': trades = parseMT4CSV(content);      break
    case 'mifx':     trades = parseMIFXStatement(content); break
    default:         trades = parseMT4CSV(content) || parseMT5CSV(content)
  }

  return { trades, format, count: trades.length }
}

module.exports = { parseFile, parseMT4CSV, parseMT5CSV, parseMIFXStatement, detectInstrumentType }

