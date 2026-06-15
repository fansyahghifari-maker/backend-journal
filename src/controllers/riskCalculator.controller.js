const svc = require('../services/riskCalculator.service')
const { success, error } = require('../utils/response')

// LOT SIZE
const lotSize = async (req, res) => {
  try {
    const result = svc.calculateLotSize(req.body)
    return success(res, result, 'Lot size berhasil dikalkulasi.')
  } catch (err) { return error(res, err.message, err.status || 400) }
}

// MARGIN
const margin = async (req, res) => {
  try {
    const result = svc.calculateMargin(req.body)
    return success(res, result, 'Margin berhasil dikalkulasi.')
  } catch (err) { return error(res, err.message, err.status || 400) }
}

// PIP VALUE
const pipValue = async (req, res) => {
  try {
    const result = svc.calculatePipValue(req.body)
    return success(res, result, 'Pip value berhasil dikalkulasi.')
  } catch (err) { return error(res, err.message, err.status || 400) }
}

// RISK REWARD
const riskReward = async (req, res) => {
  try {
    const result = svc.calculateRiskReward(req.body)
    return success(res, result, 'Risk/Reward berhasil dikalkulasi.')
  } catch (err) { return error(res, err.message, err.status || 400) }
}

// BREAK EVEN
const breakEven = async (req, res) => {
  try {
    const result = svc.calculateBreakEven(req.body)
    return success(res, result, 'Break-even analysis berhasil.')
  } catch (err) { return error(res, err.message, err.status || 400) }
}

// MULTI SCENARIO
const multiScenario = async (req, res) => {
  try {
    const result = svc.calculateMultiScenario(req.body)
    return success(res, result, 'Multi-scenario berhasil dikalkulasi.')
  } catch (err) { return error(res, err.message, err.status || 400) }
}

// DRAWDOWN
const drawdown = async (req, res) => {
  try {
    const result = svc.calculateDrawdown(req.body)
    return success(res, result, 'Drawdown analysis berhasil.')
  } catch (err) { return error(res, err.message, err.status || 400) }
}

// TRADE PLAN
const tradePlan = async (req, res) => {
  try {
    const result = svc.generateTradePlan(req.body)
    return success(res, result, 'Trade plan berhasil dibuat.')
  } catch (err) { return error(res, err.message, err.status || 400) }
}

module.exports = { lotSize, margin, pipValue, riskReward, breakEven, multiScenario, drawdown, tradePlan }
