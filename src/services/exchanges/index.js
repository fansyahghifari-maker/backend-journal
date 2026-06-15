//  EXCHANGE ROUTER — pilih service yang tepat berdasarkan platform
const binance    = require('./binance.service')
const indodax    = require('./indodax.service')
const tokocrypto = require('./tokocrypto.service')

const getService = (platform) => {
  switch (platform) {
    case 'binance':    return binance
    case 'indodax':    return indodax
    case 'tokocrypto': return tokocrypto
    default: throw { status: 400, message: `Platform "${platform}" belum didukung untuk auto-import.` }
  }
}

module.exports = { getService, binance, indodax, tokocrypto }
