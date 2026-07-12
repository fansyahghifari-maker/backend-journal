//  EXCHANGE ROUTER — pilih service yang tepat berdasarkan platform
const binance    = require('./binance.service')
const indodax    = require('./indodax.service')
const tokocrypto = require('./tokocrypto.service')
const metaapi    = require('./metaapi.service') // MT4/MT5 lewat MetaApi (gantiin EA .mq5)

const getService = (platform) => {
  switch (platform) {
    case 'binance':    return binance
    case 'indodax':    return indodax
    case 'tokocrypto': return tokocrypto
    case 'mt4':
    case 'mt5':        return metaapi
    default: throw { status: 400, message: `Platform "${platform}" belum didukung untuk auto-import.` }
  }
}

module.exports = { getService, binance, indodax, tokocrypto, metaapi }
