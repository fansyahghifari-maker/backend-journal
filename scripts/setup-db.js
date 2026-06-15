#!/usr/bin/env node
const { execSync } = require('child_process')
const fs   = require('fs')
const path = require('path')

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', X = '\x1b[0m', B = '\x1b[1m'
const ok   = m => console.log(`${G}  ✓${X} ${m}`)
const fail = m => console.log(`${R}  ✗${X} ${m}`)
const info = m => console.log(`${C}  →${X} ${m}`)
const warn = m => console.log(`${Y}  !${X} ${m}`)
const head = m => console.log(`\n${B}${m}${X}`)
const ROOT = path.join(__dirname, '..')

const run = (cmd, label) => {
  try {
    info(`Running: ${cmd}`)
    execSync(cmd, { stdio: 'pipe', cwd: ROOT })
    ok(label); return true
  } catch (err) {
    fail(`${label} — GAGAL`)
    console.error(`     ${R}${(err.stderr?.toString() || err.message).slice(0,300)}${X}`)
    return false
  }
}

async function main() {
  console.log(`\n${B}╔══════════════════════════════════════════╗`)
  console.log(`║  CryptoJournal — Database Setup Tool    ║`)
  console.log(`╚══════════════════════════════════════════╝${X}`)

  // Step 1: Cek .env
  head('Step 1: Cek file .env')
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) {
    fail('.env tidak ditemukan!')
    warn('Jalankan: cp .env.example .env')
    warn('Lalu isi DATABASE_URL di file .env')
    process.exit(1)
  }
  require('dotenv').config({ path: envPath })
  ok('.env ditemukan')

  // Step 2: Validasi DATABASE_URL
  head('Step 2: Validasi DATABASE_URL')
  const dbUrl = process.env.DATABASE_URL || ''
  if (!dbUrl.startsWith('mysql://')) {
    fail('DATABASE_URL tidak valid!')
    warn('Format yang benar: mysql://USER:PASSWORD@HOST:PORT/NAMA_DATABASE')
    console.log(`
  ${Y}Contoh lokal (XAMPP):${X}
    ${C}DATABASE_URL="mysql://root:@localhost:3306/crypto_journal"${X}

  ${Y}Contoh lokal (MySQL dengan password):${X}
    ${C}DATABASE_URL="mysql://root:password123@localhost:3306/crypto_journal"${X}
`)
    process.exit(1)
  }
  ok('DATABASE_URL: ' + dbUrl.replace(/:([^@:]+)@/, ':***@'))

  // Step 3: Generate Prisma Client
  head('Step 3: Generate Prisma Client')
  if (!run('npx prisma generate', 'Prisma client generated')) process.exit(1)

  // Step 4: Push schema
  head('Step 4: Buat semua tabel di MySQL')
  warn('Tabel akan dibuat dari schema.prisma...')
  if (!run('npx prisma db push --accept-data-loss', 'Semua tabel berhasil dibuat')) {
    console.log(`
  ${R}Koneksi database GAGAL!${X}

  ${B}Kemungkinan masalah:${X}
    ${Y}1.${X} MySQL belum jalan
       → Buka XAMPP, start MySQL service
       → Atau: sudo service mysql start (Linux)

    ${Y}2.${X} Database belum ada
       → Buka phpMyAdmin atau MySQL CLI, jalankan:
       ${C}CREATE DATABASE crypto_journal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;${X}

    ${Y}3.${X} Password salah
       → Cek user & password di file .env
       → Kalau pakai XAMPP tanpa password: mysql://root:@localhost:3306/crypto_journal
`)
    process.exit(1)
  }

  // Step 5: Seed
  head('Step 5: Seed data membership plans')
  run('node prisma/seed.js', 'Free, Pro, Elite plans seeded')

  // Step 6: Verifikasi
  head('Step 6: Verifikasi final')
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()
  try {
    await prisma.$connect()
    ok('Koneksi database BERHASIL!')

    const plans = await prisma.membershipPlan.count()
    ok(`Membership plans tersimpan: ${plans} paket`)

    const tables = await prisma.$queryRaw`SHOW TABLES`
    ok(`Total tabel di database: ${tables.length} tabel`)
    console.log('')
    tables.forEach(t => info(Object.values(t)[0]))

    await prisma.$disconnect()
  } catch (e) {
    fail('Verifikasi koneksi gagal: ' + e.message)
    process.exit(1)
  }

  console.log(`
${G}${B}
╔═══════════════════════════════════════════════════╗
║   Database siap 100%! Siap development.          ║
╚═══════════════════════════════════════════════════╝${X}

  ${B}Jalankan server:${X}
    ${C}npm run dev${X}         → Start server (auto-reload)
    ${C}npm run studio${X}      → Prisma Studio (GUI database)

  ${B}API berjalan di:${X} http://localhost:${process.env.PORT || 5000}
  ${B}Health check:${X}    http://localhost:${process.env.PORT || 5000}/api/v1/health
`)
}

main().catch(e => { fail('Setup error: ' + e.message); process.exit(1) })
