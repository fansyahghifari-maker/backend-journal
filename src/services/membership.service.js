const prisma = require('../utils/database')
const { generateInvoiceNumber } = require('../utils/invoice')
const { Xendit } = require('xendit-node')

const xendit = new Xendit({ secretKey: process.env.XENDIT_SECRET_KEY })

// GET ALL PLANS
const getPlans = async () => {
  return prisma.membershipPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

// GET USER ACTIVE SUBSCRIPTION
const getActiveSubscription = async (userId) => {
  return prisma.userSubscription.findFirst({
    where: { userId, status: 'active', endDate: { gt: new Date() } },
    include: { plan: true },
  })
}

// CREATE PAYMENT / INVOICE XENDIT
const createPayment = async ({ userId, planId, billingCycle }) => {
  // Fetch user dan plan
  const [user, plan] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id:true, email:true, username:true } }),
    prisma.membershipPlan.findUnique({ where: { id: planId } }),
  ])

  if (!plan || !plan.isActive) throw { status: 404, message: 'Paket membership tidak ditemukan.' }
  if (plan.slug === 'free')    throw { status: 400, message: 'Paket Free tidak memerlukan pembayaran.' }

  // Hitung amount berdasarkan billing cycle
  const amount = billingCycle === 'yearly'
    ? Number(plan.priceYearly)
    : Number(plan.priceMonthly)

  const invoiceNumber = generateInvoiceNumber()

  // Buat invoice di Xendit
  const xenditInvoice = await xendit.Invoice.createInvoice({
    data: {
      externalId:    invoiceNumber,
      amount:        amount,
      currency:      'IDR',
      payerEmail:    user.email,
      description:   `CryptoJournal ${plan.name} - ${billingCycle === 'yearly' ? 'Tahunan' : 'Bulanan'}`,
      invoiceDuration: 86400, // 24 jam
      successRedirectUrl: `${process.env.FRONTEND_URL}/payment/success`,
      failureRedirectUrl: `${process.env.FRONTEND_URL}/payment/failed`,
      customer: {
        givenNames: user.username,
        email:      user.email,
      },
      items: [{
        name:     `${plan.name} Membership (${billingCycle === 'yearly' ? 'Tahunan' : 'Bulanan'})`,
        quantity: 1,
        price:    amount,
      }],
    },
  })

  // Simpan payment record + buat subscription pending dalam 1 transaction
  const { payment, subscription } = await prisma.$transaction(async (tx) => {
    // Buat subscription dengan status trial dulu
    const sub = await tx.userSubscription.create({
      data: {
        userId,
        planId,
        billingCycle,
        status:    'trial', // berubah jadi active setelah payment confirmed
        startDate: new Date(),
        endDate:   new Date(), // akan diupdate di webhook
      },
    })

    // Buat payment record
    const pay = await tx.payment.create({
      data: {
        userId,
        subscriptionId:  sub.id,
        invoiceNumber,
        amount,
        currency:        'IDR',
        status:          'pending',
        xenditInvoiceId: xenditInvoice.id,
        xenditPaymentUrl: xenditInvoice.invoiceUrl,
        expiredAt:       new Date(xenditInvoice.expiryDate),
        xenditResponse:  xenditInvoice,
      },
    })

    return { payment: pay, subscription: sub }
  })

  return {
    invoiceNumber,
    amount,
    paymentId:   payment.id,
    paymentUrl:  xenditInvoice.invoiceUrl,
    expiresAt:   xenditInvoice.expiryDate,
    xenditId:    xenditInvoice.id,
    plan: { name: plan.name, slug: plan.slug, billingCycle },
  }
}

// XENDIT WEBHOOK HANDLER
const handleWebhook = async (webhookData) => {
  const { external_id, status, payment_method } = webhookData

  // Cari payment berdasarkan invoice number
  const payment = await prisma.payment.findUnique({
    where: { invoiceNumber: external_id },
    include: { subscription: { include: { plan: true } }, user: true },
  })
  if (!payment) throw { status: 404, message: 'Payment tidak ditemukan.' }

  if (status === 'PAID') {
    // Hitung end date berdasarkan billing cycle
    const now = new Date()
    const endDate = payment.subscription.billingCycle === 'yearly'
      ? new Date(now.setFullYear(now.getFullYear() + 1))
      : new Date(now.setMonth(now.getMonth() + 1))

    await prisma.$transaction(async (tx) => {
      // Update payment jadi paid
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'paid', paymentMethod: payment_method, paidAt: new Date(), xenditResponse: webhookData },
      })

      // Update subscription jadi active dengan endDate benar
      await tx.userSubscription.update({
        where: { id: payment.subscriptionId },
        data: { status: 'active', startDate: new Date(), endDate },
      })

      // Update role user jadi member
      await tx.user.update({
        where: { id: payment.userId },
        data: { role: 'member' },
      })

      // Kirim notifikasi ke user
      await tx.notification.create({
        data: {
          userId:  payment.userId,
          type:    'payment_success',
          title:   'Pembayaran Berhasil! 🎉',
          message: `Membership ${payment.subscription.plan.name} kamu sudah aktif hingga ${endDate.toLocaleDateString('id-ID')}.`,
          data:    { invoiceNumber: payment.invoiceNumber, planName: payment.subscription.plan.name },
        },
      })
    })

    return { success: true, message: 'Membership activated' }
  }

  if (status === 'EXPIRED') {
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'expired', xenditResponse: webhookData },
      }),
      prisma.userSubscription.update({
        where: { id: payment.subscriptionId },
        data: { status: 'expired' },
      }),
    ])
    return { success: true, message: 'Invoice expired' }
  }

  return { success: true, message: 'Webhook received' }
}

// CANCEL SUBSCRIPTION
const cancelSubscription = async (userId) => {
  const sub = await prisma.userSubscription.findFirst({
    where: { userId, status: 'active' },
  })
  if (!sub) throw { status: 404, message: 'Tidak ada subscription aktif.' }

  await prisma.$transaction([
    prisma.userSubscription.update({
      where: { id: sub.id },
      data: { autoRenew: false, cancelledAt: new Date() },
    }),
    prisma.notification.create({
      data: {
        userId,
        type: 'subscription_cancelled',
        title: 'Auto-renewal dinonaktifkan',
        message: `Membership kamu akan tetap aktif hingga ${sub.endDate.toLocaleDateString('id-ID')} dan tidak akan diperpanjang otomatis.`,
        data: { endDate: sub.endDate },
      },
    }),
  ])
}

module.exports = { getPlans, getActiveSubscription, createPayment, handleWebhook, cancelSubscription }
