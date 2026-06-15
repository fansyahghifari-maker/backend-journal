const { body } = require('express-validator')

//  Validasi umum
const symbolRule   = body('symbol').trim().notEmpty().withMessage('Symbol wajib diisi. Contoh: EURUSD, XAUUSD, BTCUSDT')
const entryRule    = body('entryPrice').isFloat({ min: 0.000001 }).withMessage('Entry price harus angka positif.')
const slRule       = body('stopLoss').isFloat({ min: 0.000001 }).withMessage('Stop Loss harus angka positif.')
const balanceRule  = body('accountBalance').isFloat({ min: 1 }).withMessage('Account balance harus angka positif.')
const leverageRule = body('leverage').optional().isInt({ min: 1, max: 2000 }).withMessage('Leverage 1-2000.')
const lotRule      = body('lotSize').isFloat({ min: 0.01 }).withMessage('Lot size minimal 0.01.')

// Lot Size Calculator
const lotSizeRules = [
  symbolRule, entryRule, slRule, balanceRule, leverageRule,
  body('tradeType').optional().isIn(['buy','sell','long','short']),
  body('riskPercent').optional().isFloat({ min: 0.01, max: 100 }),
  body('riskAmount').optional().isFloat({ min: 0.01 }),
]

// Margin Calculator
const marginRules = [symbolRule, lotRule, entryRule, leverageRule]

// Pip Value Calculator
const pipValueRules = [
  symbolRule,
  lotRule,
  body('currentPrice').optional().isFloat({ min: 0 }),
]

// Risk Reward Calculator
const riskRewardRules = [
  symbolRule, entryRule, slRule,
  body('takeProfit').optional().isFloat({ min: 0 }),
  body('tradeType').optional().isIn(['buy','sell','long','short']),
  lotRule,
  leverageRule,
  body('accountBalance').optional().isFloat({ min: 1 }),
]

// Break Even Calculator
const breakEvenRules = [
  body('winRate').isFloat({ min: 0, max: 100 }).withMessage('Win rate 0-100%.'),
  body('rrRatio').isFloat({ min: 0.1 }).withMessage('R:R ratio harus positif.'),
  body('totalTrades').optional().isInt({ min: 1 }),
  body('avgWin').optional().isFloat({ min: 0 }),
  body('avgLoss').optional().isFloat({ min: 0 }),
]

// Drawdown Calculator
const drawdownRules = [
  balanceRule,
  body('riskPercent').isFloat({ min: 0.01, max: 100 }).withMessage('Risk percent 0-100.'),
  body('targetMaxDrawdown').optional().isFloat({ min: 1, max: 100 }),
]

// Trade Plan
const tradePlanRules = [symbolRule, entryRule, slRule, balanceRule, leverageRule,
  body('tradeType').isIn(['buy','sell','long','short']).withMessage('tradeType wajib: buy/sell/long/short.'),
  body('takeProfit').optional().isFloat({ min: 0 }),
  body('riskPercent').optional().isFloat({ min: 0.01, max: 100 }),
]

module.exports = { lotSizeRules, marginRules, pipValueRules, riskRewardRules, breakEvenRules, drawdownRules, tradePlanRules }
