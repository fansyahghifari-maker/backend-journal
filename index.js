require('dotenv').config()
const http   = require('http')
const app    = require('./src/app')
const prisma = require('./src/utils/prisma')
const { initCronJobs }       = require('./src/services/cron.service')
const { initWebSocketServer } = require('./src/services/websocket.service')

const PORT = process.env.PORT || 5000

const start = async () => {
  try {
    // Connect database
    console.log('\n🔌 Connecting to database...')
    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ Database connected')

    // Buat HTTP server dari Express app
    // WebSocket harus share server yang sama dengan HTTP
    const httpServer = http.createServer(app)

    // Init WebSocket server (attach ke HTTP server)
    const wss = initWebSocketServer(httpServer)

    // Init cron jobs
    initCronJobs()

    // Start server
    httpServer.listen(PORT, () => {
      console.log(`\n🚀 TradingJournal Server running`)
      console.log(`   HTTP:      http://localhost:${PORT}`)
      console.log(`   API:       http://localhost:${PORT}/api/v1`)
      console.log(`   WebSocket: ws://localhost:${PORT}/ws?token=ACCESS_TOKEN`)
      console.log(`   Health:    http://localhost:${PORT}/api/v1/health\n`)
    })

  } catch (err) {
    console.error('\n❌ Gagal start server:', err.message)
    await prisma.$disconnect()
    process.exit(1)
  }
}

start()

const shutdown = async (signal) => {
  console.log(`\n${signal} — Shutting down gracefully...`)
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason))
