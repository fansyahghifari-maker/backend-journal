const { success, error } = require('../utils/response')
const { getPositionsSummary } = require('../services/position.service')
const prisma = require('../utils/prisma')

// GET /api/v1/positions  — posisi DCA semua symbol milik user, dengan live PnL
const getMyPositions = async (req, res) => {
  try {
    const userId = req.user.id

    const trades = await prisma.journalTrade.findMany({
      where: {
        journal: { userId },
        instrumentType: 'crypto',
      },
      orderBy: { tradeDate: 'asc' },
    })

    if (trades.length === 0) {
      return success(res, { positions: {}, message: 'Belum ada trade tercatat.' })
    }

    const positions = await getPositionsSummary(trades)
    return success(res, { positions })
  } catch (err) {
    console.error('[POSITION] getMyPositions:', err.message)
    return error(res, 'Gagal menghitung posisi.', 500)
  }
}

module.exports = { getMyPositions }