//  METAAPI SERVICE — pengganti EA (.mq5) buat integrasi MT4/MT5
//
//  Alurnya:
//  1. User isi login, password (investor password disarankan, read-only), server, platform (mt4/mt5) di app.
//  2. connectAccount() bikin "trading account" di MetaApi cloud pakai kredensial itu, lalu deploy.
//     Terminal MT4/5-nya jalan di server MetaApi, BUKAN di device user — jadi bisa dipakai dari HP juga,
//     gak perlu MT5 nyala terus atau EA ke-attach.
//  3. testConnection() konek RPC ke akun itu buat mastiin login/password/server bener & ambil saldo.
//  4. importAll() ambil histori deal dari MetaApi (bukan file/webhook EA lagi) dan diubah ke bentuk
//     trade generik yang sama persis dipakai exchange.service.js buat Binance/Indodax/dll,
//     jadi tinggal nyambung ke pipeline auto-sync yang sudah ada (termasuk cron auto-sync).
//
//  Catatan: field `apiKey` dari exchangeAccount TIDAK dipakai di sini (khusus MT4/5 kita simpan
//  MetaApi account id di `metadata.metaApiAccountId`). `apiSecret` = password MT yang di-enkripsi.

const { getApi } = require('../metaapi/metaapi.client')
const { detectInstrumentType } = require('../mt/mt.parser')

const DEAL_TYPE_BUY  = 'DEAL_TYPE_BUY'
const DEAL_TYPE_SELL = 'DEAL_TYPE_SELL'
const ENTRY_IN  = 'DEAL_ENTRY_IN'
const ENTRY_OUT = 'DEAL_ENTRY_OUT'

// Tipe non-trade (deposit/withdraw/koreksi/dll) yang harus diabaikan
const NON_TRADE_TYPES = [
  'DEAL_TYPE_BALANCE', 'DEAL_TYPE_CREDIT', 'DEAL_TYPE_CHARGE', 'DEAL_TYPE_CORRECTION',
  'DEAL_TYPE_BONUS', 'DEAL_TYPE_COMMISSION', 'DEAL_TYPE_COMMISSION_DAILY',
  'DEAL_TYPE_COMMISSION_MONTHLY', 'DEAL_TYPE_COMMISSION_AGENT_DAILY',
  'DEAL_TYPE_COMMISSION_AGENT_MONTHLY', 'DEAL_TYPE_INTEREST', 'DEAL_TYPE_BUY_CANCELED',
  'DEAL_TYPE_SELL_CANCELED', 'DEAL_DIVIDEND', 'DEAL_DIVIDEND_FRANKED', 'DEAL_TAX',
]

// ── HELPER: cari/bikin provisioning profile buat broker server tertentu ──
// SDK versi baru biasanya bisa auto-detect broker cuma dari nama server (tanpa profile manual).
// Fallback ini cuma jalan kalau MetaApi minta provisioningProfileId secara eksplisit.
const ensureProvisioningProfile = async (api, { serverName, platform }) => {
  const list = await api.provisioningProfileApi.getProvisioningProfiles()
  const existing = list.find(p => p.name === serverName)
  if (existing) return existing.id

  const profile = await api.provisioningProfileApi.createProvisioningProfile({
    name:    serverName,
    version: platform === 'mt4' ? 4 : 5,
    brokerTimezone:     'EET',
    brokerDSTSwitchTimezone: 'EET',
  })
  return profile.id
}

//  PROVISION — bikin akun trading di MetaApi cloud + deploy
const provisionAccount = async ({ loginNumber, password, serverName, platform, accountName }) => {
  const api = getApi()

  if (!loginNumber || !password || !serverName) {
    throw { status: 400, message: 'Login, password, dan server MT wajib diisi untuk konek via MetaApi.' }
  }
  if (!['mt4', 'mt5'].includes(platform)) {
    throw { status: 400, message: 'Platform harus mt4 atau mt5.' }
  }

  const payload = {
    name:     accountName || `MT ${loginNumber}`,
    type:     'cloud-g2',
    login:    String(loginNumber),
    password,
    server:   serverName,
    platform,
    magic:    0,
    manualTrades: true,
    reliability: 'regular',
    application: 'MetaApi',
  }

  let created
  try {
    created = await api.metatraderAccountApi.createAccount(payload)
  } catch (err) {
    const msg = err?.details ? JSON.stringify(err.details) : (err?.message || '')
    // Kalau MetaApi minta provisioning profile, bikinin otomatis lalu retry sekali
    if (/provisioningProfileId/i.test(msg)) {
      const provisioningProfileId = await ensureProvisioningProfile(api, { serverName, platform })
      created = await api.metatraderAccountApi.createAccount({ ...payload, provisioningProfileId })
    } else {
      throw { status: 400, message: `Gagal bikin akun MetaApi: ${err.message || 'unknown error'} | Detail: ${msg || '(kosong)'}` }
    }
  }

  const account = await api.metatraderAccountApi.getAccount(created.id)

  try {
    await account.deploy()
    await account.waitDeployed(180)
  } catch (err) {
    // Deploy gagal biasanya karena login/password/server salah — biar jelas errornya
    throw { status: 400, message: `Akun dibuat tapi gagal deploy: ${err.message}. Cek lagi login/password/server.` }
  }

  return { metaApiAccountId: account.id, state: account.state }
}

//  TEST CONNECTION — konek RPC, ambil info akun buat verifikasi
const testConnection = async ({ metaApiAccountId }) => {
  if (!metaApiAccountId) {
    return { success: false, message: 'Akun MetaApi belum di-provision. Reconnect akun terlebih dahulu.' }
  }

  const api = getApi()
  const account = await api.metatraderAccountApi.getAccount(metaApiAccountId)

  if (account.state !== 'DEPLOYED') {
    await account.deploy()
    await account.waitDeployed(180)
  }
  await account.waitConnected(120)

  const connection = account.getRPCConnection()
  await connection.connect()
  try {
    await connection.waitSynchronized(120)
    const info = await connection.getAccountInformation()

    return {
      success:     true,
      message:     `Koneksi ${account.platform.toUpperCase()} via MetaApi berhasil!`,
      accountType: info.name,
      balances:    [{ asset: info.currency, free: info.balance, locked: info.equity - info.balance }],
      balance:     info.balance,
      equity:      info.equity,
      currency:    info.currency,
      leverage:    info.leverage,
      broker:      info.broker,
    }
  } finally {
    await connection.close()
  }
}

//  MAPPING DEALS -> bentuk trade generik (dipakai bareng exchange.service.js)
const mapDealsToTrades = (deals, platform) => {
  const tradeDeals = deals.filter(d => !NON_TRADE_TYPES.includes(d.type) && d.symbol)

  // Kelompokin per positionId
  const byPosition = new Map()
  for (const deal of tradeDeals) {
    const key = deal.positionId || deal.id
    if (!byPosition.has(key)) byPosition.set(key, [])
    byPosition.get(key).push(deal)
  }

  const trades = []
  for (const [positionId, group] of byPosition) {
    group.sort((a, b) => new Date(a.time) - new Date(b.time))
    const openDeal  = group.find(d => d.entryType === ENTRY_IN)  || group[0]
    const closeDeal = [...group].reverse().find(d => d.entryType === ENTRY_OUT)

    if (!openDeal || !openDeal.symbol) continue

    const commission = group.reduce((sum, d) => sum + (d.commission || 0), 0)
    const swap       = group.reduce((sum, d) => sum + (d.swap || 0), 0)
    const profit     = group.reduce((sum, d) => sum + (d.profit || 0), 0)

    trades.push({
      externalTradeId: `${platform}-${positionId}`,
      symbol:          openDeal.symbol,
      instrumentType:  detectInstrumentType(openDeal.symbol) || 'forex',
      tradeType:       openDeal.type === DEAL_TYPE_SELL ? 'sell' : 'buy',
      entryPrice:      openDeal.price,
      exitPrice:       closeDeal ? closeDeal.price : null,
      quantity:        openDeal.volume,
      commission,
      swap,
      realizedPnl:     closeDeal ? profit : null,
      tradeDate:       openDeal.time,
      raw:             { open: openDeal, close: closeDeal || null },
    })
  }

  return trades
}

//  IMPORT ALL — ambil histori deal dari MetaApi lalu convert ke trade generik
const importAll = async ({ metaApiAccountId, platform }, options = {}) => {
  if (!metaApiAccountId) {
    throw { status: 400, message: 'Akun MetaApi belum di-provision. Reconnect akun terlebih dahulu.' }
  }

  const api = getApi()
  const account = await api.metatraderAccountApi.getAccount(metaApiAccountId)

  if (account.state !== 'DEPLOYED') {
    await account.deploy()
    await account.waitDeployed(180)
  }
  await account.waitConnected(120)

  const connection = account.getRPCConnection()
  await connection.connect()

  try {
    await connection.waitSynchronized(180)

    const endTime   = new Date()
    const startTime = options.sinceDate
      ? new Date(options.sinceDate)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // default: 90 hari terakhir kalau belum pernah sync

    // Paginate — MetaApi limit default 1000 per request
    let offset = 0
    const limit = 1000
    let allDeals = []
    while (true) {
      const { deals } = await connection.getDealsByTimeRange(startTime, endTime, offset, limit)
      allDeals = allDeals.concat(deals || [])
      if (!deals || deals.length < limit) break
      offset += limit
    }

    const trades = mapDealsToTrades(allDeals, platform || account.platform)

    return { trades, symbols: [...new Set(trades.map(t => t.symbol))] }
  } finally {
    await connection.close()
  }
}

//  DEPROVISION — dipanggil pas user disconnect akun dari app
const removeAccount = async ({ metaApiAccountId }) => {
  if (!metaApiAccountId) return { removed: false }
  try {
    const api = getApi()
    const account = await api.metatraderAccountApi.getAccount(metaApiAccountId)
    await account.undeploy().catch(() => {})
    await account.remove()
    return { removed: true }
  } catch (err) {
    console.error('[METAAPI] removeAccount error:', err.message)
    return { removed: false, error: err.message }
  }
}

module.exports = {
  provisionAccount,
  testConnection,
  importAll,
  removeAccount,
}
