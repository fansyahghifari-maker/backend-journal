//  METAAPI CLIENT — singleton wrapper buat SDK metaapi.cloud-sdk
//
//  Kenapa perlu ini: satu MetaApi instance (dibuat dari 1 token akun MetaApi milik APLIKASI,
//  bukan token milik user) dipakai buat provision & baca SEMUA akun MT4/MT5 user.
//  User cuma perlu kasih login/password(investor)/server broker mereka lewat app —
//  gak perlu install EA (.mq5) atau nyalain MT5 di laptop/HP mereka lagi, karena
//  terminal MT4/5 nya jalan di cloud MetaApi.
//
//  Dapatkan token di: https://app.metaapi.cloud/token
//  Simpan di .env sebagai METAAPI_TOKEN

let MetaApi
try {
  MetaApi = require('metaapi.cloud-sdk').default || require('metaapi.cloud-sdk')
} catch {
  MetaApi = null
}

let apiInstance = null

const getApi = () => {
  const token = process.env.METAAPI_TOKEN
  if (!token) {
    throw { status: 500, message: 'METAAPI_TOKEN belum di-set di .env. Ambil di https://app.metaapi.cloud/token' }
  }
  if (!MetaApi) {
    throw { status: 500, message: 'Package metaapi.cloud-sdk belum terinstall. Jalankan: npm install metaapi.cloud-sdk' }
  }
  if (!apiInstance) {
    apiInstance = new MetaApi(token, {
      // 'high' reliability = pakai infra redundant, lebih stabil buat production
      requestTimeout: 60000,
    })
  }
  return apiInstance
}

module.exports = { getApi }
