require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const testConnection = async () => {
  const prisma = new PrismaClient()

  console.log('\n🔌 Testing database connection...')
  console.log('─'.repeat(50))

  try {
    // 1. Test raw connection
    await prisma.$connect()
    console.log('✅ Connected to MySQL successfully')

    // 2. Test raw query — cek versi MySQL
    const version = await prisma.$queryRaw`SELECT VERSION() as version, NOW() as server_time`
    console.log(`✅ MySQL Version : ${version[0].version}`)
    console.log(`✅ Server Time   : ${version[0].server_time}`)

    // 3. Test semua tabel ada (cek schema sudah di-migrate)
    console.log('\n📋 Checking tables...')
    const tables = await prisma.$queryRaw`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `

    const expectedTables = [
      'users', 'refresh_tokens', 'membership_plans',
      'user_subscriptions', 'payments', 'journals',
      'journal_trades', 'journal_comments', 'journal_likes',
      'watchlists', 'watchlist_items', 'notifications'
    ]

    if (tables.length === 0) {
      console.log('⚠️  Tidak ada tabel ditemukan.')
      console.log('   Jalankan: npx prisma migrate dev --name init')
    } else {
      const foundNames = tables.map(t => t.TABLE_NAME)
      expectedTables.forEach(name => {
        const found = foundNames.includes(name)
        console.log(`   ${found ? '✅' : '❌'} ${name}`)
      })
    }

    // 4. Test membership plans ada (seed sudah jalan)
    console.log('\n🏷️  Checking membership plans...')
    const plans = await prisma.membershipPlan.findMany({
      select: { name: true, slug: true, priceMonthly: true }
    })

    if (plans.length === 0) {
      console.log('⚠️  Tidak ada plan ditemukan.')
      console.log('   Jalankan: npm run seed')
    } else {
      plans.forEach(p => {
        console.log(`   ✅ ${p.name} (${p.slug}) — Rp ${Number(p.priceMonthly).toLocaleString('id-ID')}/bulan`)
      })
    }

    console.log('\n🎉 Database siap digunakan!\n')

  } catch (err) {
    console.error('\n❌ Connection failed!\n')
    console.error('Error:', err.message)
    console.error('\n📖 Troubleshooting:')
    console.error('   1. Pastikan MySQL server running')
    console.error('   2. Cek DATABASE_URL di file .env')
    console.error('      Format: mysql://USER:PASSWORD@HOST:PORT/DB_NAME')
    console.error('   3. Pastikan database sudah dibuat: CREATE DATABASE crypto_journal;')
    console.error('   4. Jalankan migrate: npx prisma migrate dev --name init\n')
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()
