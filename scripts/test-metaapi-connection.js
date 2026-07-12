//  TEST KONEKSI METAAPI — standalone, TIDAK butuh server/database nyala
//
//  Tujuan: validasi cepat apakah token MetaApi + login/password/server MT4/MT5
//  kamu itu BENERAN bisa konek & narik history trade, SEBELUM dipakai di app.
//
//  Cara pakai:
//    1. Isi METAAPI_TOKEN di file .env (root project)
//    2. Jalankan:
//       node scripts/test-metaapi-connection.js --login 12345678 --password "investor_password_kamu" --server "ICMarketsSC-Demo" --platform mt5
//
//  Kalau berhasil, script ini bakal nge-print:
//    - status provisioning & deploy akun
//    - saldo/equity akun MT kamu
//    - daftar trade (history deals) 90 hari terakhir
//
//  Kalau gagal, errornya bakal jelas kenapa (token salah, login/password salah,
//  server gak ketemu, dll) — jadi kamu tau persis apa yang perlu dibenerin.

require('dotenv').config()

const args = {}
process.argv.slice(2).forEach((arg, i, arr) => {
  if (arg.startsWith('--')) args[arg.slice(2)] = arr[i + 1]
})

const LOGIN    = args.login
const PASSWORD = args.password
const SERVER   = args.server
const PLATFORM = args.platform || 'mt5'

const log  = (...a) => console.log(...a)
const step = (n, msg) => console.log(`\n[${n}] ${msg}`)

async function main() {
  if (!process.env.METAAPI_TOKEN) {
    console.error('❌ METAAPI_TOKEN belum di-set di .env. Ambil di https://app.metaapi.cloud/token lalu isi di .env')
    process.exit(1)
  }
  if (!LOGIN || !PASSWORD || !SERVER) {
    console.error('❌ Wajib kasih --login, --password, --server. Contoh:')
    console.error('   node scripts/test-metaapi-connection.js --login 12345678 --password "xxx" --server "ICMarketsSC-Demo" --platform mt5')
    process.exit(1)
  }

  step(1, `Konek ke MetaApi pakai token dari .env...`)
  const metaapi = require('../src/services/exchanges/metaapi.service')

  step(2, `Provisioning akun ${PLATFORM.toUpperCase()} login ${LOGIN} @ ${SERVER} (bisa makan waktu 1-3 menit buat deploy)...`)
  let provisioned
  try {
    provisioned = await metaapi.provisionAccount({
      loginNumber: LOGIN,
      password:    PASSWORD,
      serverName:  SERVER,
      platform:    PLATFORM,
      accountName: `TEST ${LOGIN}`,
    })
    log('✅ Akun berhasil di-provision & deploy.')
    log('   metaApiAccountId:', provisioned.metaApiAccountId)
    log('   state:', provisioned.state)
  } catch (err) {
    console.error('❌ Gagal provisioning:', err.message || err)
    console.error('   Kemungkinan: login/password/server salah, atau broker butuh provisioning profile manual.')
    process.exit(1)
  }

  const { metaApiAccountId } = provisioned

  step(3, 'Test koneksi & ambil info akun (saldo, equity, broker)...')
  try {
    const result = await metaapi.testConnection({ metaApiAccountId })
    if (!result.success) {
      console.error('❌ Test koneksi gagal:', result.message)
      process.exit(1)
    }
    log('✅', result.message)
    log('   Broker      :', result.broker)
    log('   Balance     :', result.balance, result.currency)
    log('   Equity      :', result.equity, result.currency)
    log('   Leverage    :', result.leverage)
  } catch (err) {
    console.error('❌ Error saat test koneksi:', err.message || err)
    process.exit(1)
  }

  step(4, 'Tarik history trade (90 hari terakhir)...')
  try {
    const { trades } = await metaapi.importAll({ metaApiAccountId, platform: PLATFORM }, {})
    log(`✅ Ketemu ${trades.length} trade.`)
    trades.slice(0, 10).forEach((t, i) => {
      log(`   ${i + 1}. ${t.symbol} | ${t.tradeType.toUpperCase()} | entry ${t.entryPrice} -> exit ${t.exitPrice ?? '(masih open)'} | lot ${t.quantity} | pnl ${t.realizedPnl ?? '-'}`)
    })
    if (trades.length > 10) log(`   ... dan ${trades.length - 10} lainnya.`)
    if (trades.length === 0) log('   (Kosong — wajar kalau akun demo/live ini belum ada history transaksi 90 hari terakhir.)')
  } catch (err) {
    console.error('❌ Error saat tarik history:', err.message || err)
    process.exit(1)
  }

  step(5, 'Cleanup — hapus akun test dari MetaApi cloud (biar gak numpuk kuota)...')
  try {
    await metaapi.removeAccount({ metaApiAccountId })
    log('✅ Akun test sudah dihapus dari MetaApi.')
  } catch (err) {
    console.warn('⚠️  Gagal hapus otomatis, hapus manual di https://app.metaapi.cloud/accounts kalau perlu.')
  }

  console.log('\n🎉 SEMUA TEST LOLOS. Integrasi MetaApi kamu valid dan siap dipakai di app.')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Error tak terduga:', err)
  process.exit(1)
})
