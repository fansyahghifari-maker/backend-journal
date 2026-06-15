const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {

  // ─── SEED 1: Membership Plans ────────────────────────────────
  const plans = [
    {
      name: 'Free', slug: 'free',
      description: 'Untuk trader pemula yang baru mulai journaling',
      priceMonthly: 0, priceYearly: 0, sortOrder: 0,
      features: [
        { key: 'max_journals',     label: 'Maks jurnal',        value: 5,     type: 'limit' },
        { key: 'visibility',       label: 'Visibilitas',         value: 'Private only', type: 'text' },
        { key: 'instrument_types', label: 'Instrumen',           value: ['crypto'], type: 'list' },
        { key: 'trade_tracking',   label: 'Trade tracking',      value: true,  type: 'bool' },
        { key: 'community_access', label: 'Akses komunitas',     value: false, type: 'bool' },
        { key: 'ai_analysis',      label: 'Analisis AI',         value: false, type: 'bool' },
        { key: 'export_pdf',       label: 'Export PDF',          value: false, type: 'bool' },
        { key: 'watchlist_limit',  label: 'Maks watchlist',      value: 1,     type: 'limit' },
        { key: 'exchange_connect', label: 'Koneksi exchange',    value: false, type: 'bool' },
        { key: 'mt_connect',       label: 'Koneksi MT4/MT5',     value: false, type: 'bool' },
      ],
    },
    {
      name: 'Pro', slug: 'pro',
      description: 'Untuk trader aktif crypto dan forex',
      priceMonthly: 99000, priceYearly: 950000, sortOrder: 1,
      features: [
        { key: 'max_journals',     label: 'Maks jurnal',         value: -1,    type: 'limit' },
        { key: 'visibility',       label: 'Visibilitas',          value: 'Public + Private', type: 'text' },
        { key: 'instrument_types', label: 'Instrumen',            value: ['crypto','forex','commodity','index'], type: 'list' },
        { key: 'trade_tracking',   label: 'Trade tracking',       value: true,  type: 'bool' },
        { key: 'community_access', label: 'Akses komunitas',      value: true,  type: 'bool' },
        { key: 'ai_analysis',      label: 'Analisis AI',          value: false, type: 'bool' },
        { key: 'export_pdf',       label: 'Export PDF',           value: true,  type: 'bool' },
        { key: 'watchlist_limit',  label: 'Maks watchlist',       value: 10,    type: 'limit' },
        { key: 'exchange_connect', label: 'Koneksi exchange',     value: true,  type: 'bool' },
        { key: 'mt_connect',       label: 'Koneksi MT4/MT5',      value: true,  type: 'bool' },
      ],
    },
    {
      name: 'Elite', slug: 'elite',
      description: 'Untuk professional trader semua instrument dengan AI',
      priceMonthly: 199000, priceYearly: 1800000, sortOrder: 2,
      features: [
        { key: 'max_journals',     label: 'Maks jurnal',         value: -1,    type: 'limit' },
        { key: 'visibility',       label: 'Visibilitas',          value: 'Public + Private + Members', type: 'text' },
        { key: 'instrument_types', label: 'Instrumen',            value: ['crypto','forex','commodity','index','stock','crypto_futures'], type: 'list' },
        { key: 'trade_tracking',   label: 'Trade tracking',       value: true,  type: 'bool' },
        { key: 'community_access', label: 'Akses komunitas',      value: true,  type: 'bool' },
        { key: 'ai_analysis',      label: 'Analisis AI',          value: true,  type: 'bool' },
        { key: 'export_pdf',       label: 'Export PDF',           value: true,  type: 'bool' },
        { key: 'watchlist_limit',  label: 'Maks watchlist',       value: -1,    type: 'limit' },
        { key: 'exchange_connect', label: 'Koneksi exchange',     value: true,  type: 'bool' },
        { key: 'mt_connect',       label: 'Koneksi MT4/MT5',      value: true,  type: 'bool' },
        { key: 'priority_support', label: 'Priority support',     value: true,  type: 'bool' },
        { key: 'ib_dashboard',     label: 'IB dashboard',         value: true,  type: 'bool' },
      ],
    },
  ]

  for (const plan of plans) {
    await prisma.membershipPlan.upsert({ where: { slug: plan.slug }, update: plan, create: plan })
    console.log(`✅ Plan: ${plan.name}`)
  }

  // ─── SEED 2: Master Instruments ──────────────────────────────
  const instruments = [
    // Crypto
    { symbol: 'BTCUSDT',  name: 'Bitcoin / USDT',       type: 'crypto',    baseCurrency: 'BTC', quoteCurrency: 'USDT', pipSize: 0.01,    exchange: 'Binance' },
    { symbol: 'ETHUSDT',  name: 'Ethereum / USDT',      type: 'crypto',    baseCurrency: 'ETH', quoteCurrency: 'USDT', pipSize: 0.01,    exchange: 'Binance' },
    { symbol: 'BNBUSDT',  name: 'BNB / USDT',           type: 'crypto',    baseCurrency: 'BNB', quoteCurrency: 'USDT', pipSize: 0.01,    exchange: 'Binance' },
    { symbol: 'SOLUSDT',  name: 'Solana / USDT',        type: 'crypto',    baseCurrency: 'SOL', quoteCurrency: 'USDT', pipSize: 0.001,   exchange: 'Binance' },
    { symbol: 'BTCIDR',   name: 'Bitcoin / IDR',         type: 'crypto',    baseCurrency: 'BTC', quoteCurrency: 'IDR',  pipSize: 1000,    exchange: 'Indodax' },
    { symbol: 'ETHIDR',   name: 'Ethereum / IDR',        type: 'crypto',    baseCurrency: 'ETH', quoteCurrency: 'IDR',  pipSize: 100,     exchange: 'Indodax' },

    // Forex
    { symbol: 'EURUSD',   name: 'Euro / US Dollar',      type: 'forex',     baseCurrency: 'EUR', quoteCurrency: 'USD',  pipSize: 0.0001, lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'GBPUSD',   name: 'British Pound / USD',   type: 'forex',     baseCurrency: 'GBP', quoteCurrency: 'USD',  pipSize: 0.0001, lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'USDJPY',   name: 'US Dollar / Yen',       type: 'forex',     baseCurrency: 'USD', quoteCurrency: 'JPY',  pipSize: 0.01,   lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'USDCHF',   name: 'US Dollar / Swiss Franc',type: 'forex',    baseCurrency: 'USD', quoteCurrency: 'CHF',  pipSize: 0.0001, lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'AUDUSD',   name: 'Australian Dollar / USD',type: 'forex',    baseCurrency: 'AUD', quoteCurrency: 'USD',  pipSize: 0.0001, lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'USDCAD',   name: 'US Dollar / Canadian',  type: 'forex',     baseCurrency: 'USD', quoteCurrency: 'CAD',  pipSize: 0.0001, lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'NZDUSD',   name: 'New Zealand Dollar / USD',type: 'forex',   baseCurrency: 'NZD', quoteCurrency: 'USD',  pipSize: 0.0001, lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'EURGBP',   name: 'Euro / British Pound',  type: 'forex',     baseCurrency: 'EUR', quoteCurrency: 'GBP',  pipSize: 0.0001, lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'EURJPY',   name: 'Euro / Japanese Yen',   type: 'forex',     baseCurrency: 'EUR', quoteCurrency: 'JPY',  pipSize: 0.01,   lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'GBPJPY',   name: 'British Pound / Yen',   type: 'forex',     baseCurrency: 'GBP', quoteCurrency: 'JPY',  pipSize: 0.01,   lotSize: 100000, marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'USDIDR',   name: 'US Dollar / Indonesian Rupiah', type: 'forex', baseCurrency: 'USD', quoteCurrency: 'IDR', pipSize: 1, lotSize: 100000, exchange: 'MIFX' },

    // Commodity / Precious Metals
    { symbol: 'XAUUSD',   name: 'Gold / US Dollar',      type: 'commodity', baseCurrency: 'XAU', quoteCurrency: 'USD',  pipSize: 0.01,   contractSize: 100,   marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'XAGUSD',   name: 'Silver / US Dollar',    type: 'commodity', baseCurrency: 'XAG', quoteCurrency: 'USD',  pipSize: 0.001,  contractSize: 5000,  marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'XPTUSD',   name: 'Platinum / US Dollar',  type: 'commodity', baseCurrency: 'XPT', quoteCurrency: 'USD',  pipSize: 0.01,   contractSize: 50,    marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'USOIL',    name: 'Crude Oil (WTI)',        type: 'commodity', baseCurrency: 'OIL', quoteCurrency: 'USD',  pipSize: 0.01,   contractSize: 1000,  marginRequired: 1.00, exchange: 'MIFX' },
    { symbol: 'UKOIL',    name: 'Brent Crude Oil',        type: 'commodity', baseCurrency: 'OIL', quoteCurrency: 'USD',  pipSize: 0.01,   contractSize: 1000,  marginRequired: 1.00, exchange: 'MIFX' },

    // Index
    { symbol: 'US30',     name: 'Dow Jones Industrial',  type: 'index',     baseCurrency: 'US30',quoteCurrency: 'USD',  pipSize: 1,      exchange: 'MIFX' },
    { symbol: 'US500',    name: 'S&P 500 Index',          type: 'index',     baseCurrency: 'US500',quoteCurrency:'USD',  pipSize: 0.1,    exchange: 'MIFX' },
    { symbol: 'NAS100',   name: 'NASDAQ 100 Index',       type: 'index',     baseCurrency: 'NAS100',quoteCurrency:'USD', pipSize: 0.1,    exchange: 'MIFX' },
    { symbol: 'GER40',    name: 'DAX 40 Index',           type: 'index',     baseCurrency: 'GER40',quoteCurrency:'EUR',  pipSize: 0.1,    exchange: 'MIFX' },

    // Crypto Futures
    { symbol: 'BTCPERP',  name: 'Bitcoin Perpetual',      type: 'crypto_futures', baseCurrency: 'BTC', quoteCurrency: 'USDT', pipSize: 0.1,  contractSize: 1, exchange: 'Binance' },
    { symbol: 'ETHPERP',  name: 'Ethereum Perpetual',     type: 'crypto_futures', baseCurrency: 'ETH', quoteCurrency: 'USDT', pipSize: 0.01, contractSize: 1, exchange: 'Binance' },
  ]

  for (const inst of instruments) {
    await prisma.instrument.upsert({
      where:  { symbol: inst.symbol },
      update: inst,
      create: inst,
    })
  }
  console.log(`✅ Instruments: ${instruments.length} seeded`)

  console.log('\n🎉 Seed selesai! Database siap untuk multi instrument.\n')
}

main().catch(console.error).finally(() => prisma.$disconnect())
