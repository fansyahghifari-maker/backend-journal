const membershipService = require('../services/membership.service')
const { success, error } = require('../utils/response')
const crypto = require('crypto')

const getPlans = async (req, res) => {
  try {
    const plans = await membershipService.getPlans()
    return success(res, { plans }, 'Daftar paket membership berhasil diambil.')
  } catch (err) {
    return error(res, 'Gagal mengambil data paket.', 500)
  }
}

const getMySubscription = async (req, res) => {
  try {
    const subscription = await membershipService.getActiveSubscription(req.user.id)
    return success(res, { subscription }, 'Data subscription berhasil diambil.')
  } catch (err) {
    return error(res, 'Gagal mengambil data subscription.', 500)
  }
}

const createPayment = async (req, res) => {
  try {
    const { planId, billingCycle } = req.body
    const result = await membershipService.createPayment({
      userId: req.user.id,
      planId,
      billingCycle,
    })
    return success(res, result, 'Invoice pembayaran berhasil dibuat.', 201)
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

// Xendit webhook — verifikasi signature dulu
const handleWebhook = async (req, res) => {
  try {
    // Verifikasi Xendit webhook token
    const xenditToken = req.headers['x-callback-token']
    if (xenditToken !== process.env.XENDIT_WEBHOOK_TOKEN) {
      return error(res, 'Unauthorized webhook.', 401)
    }
    const result = await membershipService.handleWebhook(req.body)
    return success(res, result, 'Webhook processed.')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

const cancelSubscription = async (req, res) => {
  try {
    await membershipService.cancelSubscription(req.user.id)
    return success(res, null, 'Auto-renewal berhasil dinonaktifkan.')
  } catch (err) {
    return error(res, err.message, err.status || 500)
  }
}

module.exports = { getPlans, getMySubscription, createPayment, handleWebhook, cancelSubscription }
