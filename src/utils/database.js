const { PrismaClient } = require('@prisma/client')

// ── Singleton pattern — satu instance Prisma untuk seluruh app
// Ini penting agar tidak terjadi connection pool exhausted
const globalForPrisma = globalThis

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ]
    : [{ emit: 'stdout', level: 'error' }],

  // Connection pool config untuk MySQL
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
})

// Log query di development (optional — bisa dimatiin kalau terlalu verbose)
if (process.env.NODE_ENV === 'development' && process.env.LOG_QUERIES === 'true') {
  prisma.$on('query', (e) => {
    console.log(`\n[QUERY] ${e.query}`)
    console.log(`[PARAMS] ${e.params}`)
    console.log(`[DURATION] ${e.duration}ms\n`)
  })
}

// Simpan instance di global supaya hot reload (nodemon) tidak bikin koneksi baru terus
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

module.exports = prisma
