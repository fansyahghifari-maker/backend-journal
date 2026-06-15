const prisma = require('../utils/prisma')

//  OVERVIEW — ringkasan utama dashboard
const getOverview = async (userId) => {
  const now        = new Date()
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startWeek  = new Date(now.setDate(now.getDate() - now.getDay()))

  // Semua query paralel — tidak perlu tunggu satu-satu
  const [
    totalJournals,
    totalTrades,
    openTrades,
    subscription,
    thisMonthTrades,
    thisWeekTrades,
    allClosedTrades,
    journalStats,
    notifUnread,
  ] = await Promise.all([
    prisma.journal.count({ where: { userId } }),
    prisma.journalTrade.count({ where: { journal: { userId } } }),
    prisma.journalTrade.count({ where: { journal: { userId }, status: 'open' } }),
    prisma.userSubscription.findFirst({
      where:   { userId, status: 'active', endDate: { gt: new Date() } },
      include: { plan: { select: { name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.journalTrade.findMany({
      where: { journal: { userId }, status: 'closed', tradeDate: { gte: startMonth } },
      select: { pnlAmount: true },
    }),
    prisma.journalTrade.findMany({
      where: { journal: { userId }, status: 'closed', tradeDate: { gte: startWeek } },
      select: { pnlAmount: true },
    }),
    prisma.journalTrade.findMany({
      where:  { journal: { userId }, status: 'closed', pnlAmount: { not: null } },
      select: { pnlAmount: true, pnlPercent: true },
    }),
    prisma.journal.aggregate({
      where: { userId },
      _sum:  { viewCount: true },
      _count: { id: true },
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ])

  // Kalkulasi PnL
  const totalPnl      = allClosedTrades.reduce((s, t) => s + Number(t.pnlAmount), 0)
  const monthlyPnl    = thisMonthTrades.reduce((s, t) => s + Number(t.pnlAmount), 0)
  const weeklyPnl     = thisWeekTrades.reduce((s, t) => s + Number(t.pnlAmount), 0)
  const wins          = allClosedTrades.filter(t => Number(t.pnlAmount) > 0)
  const winRate       = allClosedTrades.length > 0
    ? parseFloat(((wins.length / allClosedTrades.length) * 100).toFixed(2))
    : 0

  return {
    journals: {
      total:      totalJournals,
      totalViews: journalStats._sum.viewCount || 0,
    },
    trades: {
      total:       totalTrades,
      open:        openTrades,
      closed:      allClosedTrades.length,
      winRate,
      totalPnl:    parseFloat(totalPnl.toFixed(2)),
      monthlyPnl:  parseFloat(monthlyPnl.toFixed(2)),
      weeklyPnl:   parseFloat(weeklyPnl.toFixed(2)),
    },
    membership: {
      plan:      subscription?.plan?.name || 'Free',
      slug:      subscription?.plan?.slug || 'free',
      isActive:  !!subscription,
      expiresAt: subscription?.endDate || null,
    },
    notifications: {
      unreadCount: notifUnread,
    },
  }
}

//  MONTHLY PnL CHART — 12 bulan data untuk line chart
const getMonthlyPnlChart = async (userId, year) => {
  const targetYear = year ? Number(year) : new Date().getFullYear()

  const trades = await prisma.journalTrade.findMany({
    where: {
      journal:   { userId },
      status:    'closed',
      pnlAmount: { not: null },
      tradeDate: {
        gte: new Date(`${targetYear}-01-01`),
        lte: new Date(`${targetYear}-12-31T23:59:59`),
      },
    },
    select: { tradeDate: true, pnlAmount: true },
    orderBy: { tradeDate: 'asc' },
  })

  // Build 12 bulan dengan data kosong dulu
  const months = Array.from({ length: 12 }, (_, i) => ({
    month:       i + 1,
    label:       new Date(targetYear, i).toLocaleString('id-ID', { month: 'short' }),
    pnl:         0,
    tradeCount:  0,
    winCount:    0,
    lossCount:   0,
    cumulative:  0,
  }))

  trades.forEach(t => {
    const idx = new Date(t.tradeDate).getMonth()
    const pnl = Number(t.pnlAmount)
    months[idx].pnl        += pnl
    months[idx].tradeCount++
    if (pnl > 0) months[idx].winCount++
    else         months[idx].lossCount++
  })

  // Hitung cumulative PnL
  let cumulative = 0
  months.forEach(m => {
    m.pnl        = parseFloat(m.pnl.toFixed(2))
    cumulative  += m.pnl
    m.cumulative = parseFloat(cumulative.toFixed(2))
    m.winRate    = m.tradeCount > 0
      ? parseFloat(((m.winCount / m.tradeCount) * 100).toFixed(1))
      : 0
  })

  // Cari bulan terbaik dan terburuk
  const nonEmpty    = months.filter(m => m.tradeCount > 0)
  const bestMonth   = nonEmpty.reduce((b, m) => !b || m.pnl > b.pnl ? m : b, null)
  const worstMonth  = nonEmpty.reduce((w, m) => !w || m.pnl < w.pnl ? m : w, null)

  return {
    year:            targetYear,
    months,
    totalYearlyPnl:  parseFloat(cumulative.toFixed(2)),
    bestMonth,
    worstMonth,
  }
}

//  DAILY PnL HEATMAP — per hari dalam sebulan
const getDailyPnlHeatmap = async (userId, year, month) => {
  const y = year  ? Number(year)  : new Date().getFullYear()
  const m = month ? Number(month) : new Date().getMonth() + 1

  const startDate = new Date(y, m - 1, 1)
  const endDate   = new Date(y, m, 0, 23, 59, 59)

  const trades = await prisma.journalTrade.findMany({
    where: {
      journal:   { userId },
      status:    'closed',
      tradeDate: { gte: startDate, lte: endDate },
    },
    select: { tradeDate: true, pnlAmount: true },
  })

  const dayMap = {}
  trades.forEach(t => {
    const date = new Date(t.tradeDate).toISOString().split('T')[0]
    if (!dayMap[date]) dayMap[date] = { date, pnl: 0, tradeCount: 0, winCount: 0 }
    const pnl = Number(t.pnlAmount)
    dayMap[date].pnl        += pnl
    dayMap[date].tradeCount++
    if (pnl > 0) dayMap[date].winCount++
  })

  const days = Object.values(dayMap).map(d => ({
    ...d,
    pnl:    parseFloat(d.pnl.toFixed(2)),
    result: d.pnl > 0 ? 'profit' : d.pnl < 0 ? 'loss' : 'breakeven',
  })).sort((a, b) => a.date.localeCompare(b.date))

  const profitDays   = days.filter(d => d.result === 'profit').length
  const lossDays     = days.filter(d => d.result === 'loss').length

  return {
    year: y, month: m,
    days,
    summary: {
      activeDays:  days.length,
      profitDays,
      lossDays,
      totalPnl:    parseFloat(days.reduce((s, d) => s + d.pnl, 0).toFixed(2)),
    },
  }
}

//  COIN PERFORMANCE — ranking coin berdasarkan berbagai metrik
const getCoinPerformance = async (userId) => {
  const trades = await prisma.journalTrade.findMany({
    where: {
      journal:   { userId },
      status:    'closed',
      pnlAmount: { not: null },
    },
    select: {
      coinSymbol: true, coinName: true,
      pnlAmount: true, pnlPercent: true,
      tradeType: true, entryPrice: true,
      exitPrice: true, quantity: true,
    },
  })

  // Group by coin
  const coinMap = {}
  trades.forEach(t => {
    const sym = t.coinSymbol
    if (!coinMap[sym]) {
      coinMap[sym] = {
        symbol:      sym,
        name:        t.coinName,
        totalPnl:    0,
        tradeCount:  0,
        winCount:    0,
        lossCount:   0,
        longCount:   0,
        shortCount:  0,
        totalVolume: 0,
      }
    }
    const pnl    = Number(t.pnlAmount)
    const volume = Number(t.entryPrice) * Number(t.quantity)
    coinMap[sym].totalPnl    += pnl
    coinMap[sym].tradeCount++
    coinMap[sym].totalVolume += volume
    if (pnl > 0)               coinMap[sym].winCount++
    else                        coinMap[sym].lossCount++
    if (t.tradeType === 'long') coinMap[sym].longCount++
    else                        coinMap[sym].shortCount++
  })

  const coins = Object.values(coinMap).map(c => ({
    ...c,
    totalPnl:    parseFloat(c.totalPnl.toFixed(2)),
    totalVolume: parseFloat(c.totalVolume.toFixed(2)),
    winRate:     c.tradeCount > 0
      ? parseFloat(((c.winCount / c.tradeCount) * 100).toFixed(1))
      : 0,
    dominantSide: c.longCount >= c.shortCount ? 'long' : 'short',
  }))

  return {
    byPnl:        [...coins].sort((a, b) => b.totalPnl    - a.totalPnl),
    byWinRate:    [...coins].sort((a, b) => b.winRate      - a.winRate),
    byFrequency:  [...coins].sort((a, b) => b.tradeCount   - a.tradeCount),
    byVolume:     [...coins].sort((a, b) => b.totalVolume  - a.totalVolume),
    total:        coins.length,
  }
}

//  TRADE PERFORMANCE STATS — metrik mendalam
const getTradePerformance = async (userId) => {
  const trades = await prisma.journalTrade.findMany({
    where:   { journal: { userId }, status: 'closed', pnlAmount: { not: null } },
    orderBy: { tradeDate: 'asc' },
    select:  {
      pnlAmount: true, pnlPercent: true, tradeType: true,
      coinSymbol: true, tradeDate: true, entryPrice: true,
      exitPrice: true, quantity: true,
    },
  })

  if (trades.length === 0) {
    return {
      totalClosed: 0,
      winRate: 0, totalPnl: 0, avgPnl: 0,
      avgWin: 0, avgLoss: 0, riskReward: 0,
      maxWinStreak: 0, maxLossStreak: 0,
      bestTrade: null, worstTrade: null,
      longStats: null, shortStats: null,
    }
  }

  const wins   = trades.filter(t => Number(t.pnlAmount) > 0)
  const losses = trades.filter(t => Number(t.pnlAmount) <= 0)

  const totalPnl  = trades.reduce((s, t) => s + Number(t.pnlAmount), 0)
  const avgPnl    = totalPnl / trades.length
  const avgWin    = wins.length   > 0 ? wins.reduce((s, t) => s + Number(t.pnlAmount), 0)   / wins.length   : 0
  const avgLoss   = losses.length > 0 ? losses.reduce((s, t) => s + Number(t.pnlAmount), 0) / losses.length : 0
  const riskReward = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : 0

  // Win/Loss streak
  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0
  trades.forEach(t => {
    if (Number(t.pnlAmount) > 0) {
      curWin++; curLoss = 0
      maxWinStreak = Math.max(maxWinStreak, curWin)
    } else {
      curLoss++; curWin = 0
      maxLossStreak = Math.max(maxLossStreak, curLoss)
    }
  })

  // Best & worst trade
  const bestTrade  = trades.reduce((b, t) => !b || Number(t.pnlAmount) > Number(b.pnlAmount) ? t : b)
  const worstTrade = trades.reduce((w, t) => !w || Number(t.pnlAmount) < Number(w.pnlAmount) ? t : w)

  // Long vs Short performance breakdown
  const longTrades  = trades.filter(t => t.tradeType === 'long')
  const shortTrades = trades.filter(t => t.tradeType === 'short')

  const calcSideStats = (sideTrades) => {
    if (sideTrades.length === 0) return null
    const sideWins = sideTrades.filter(t => Number(t.pnlAmount) > 0)
    return {
      count:      sideTrades.length,
      winCount:   sideWins.length,
      winRate:    parseFloat(((sideWins.length / sideTrades.length) * 100).toFixed(2)),
      totalPnl:   parseFloat(sideTrades.reduce((s, t) => s + Number(t.pnlAmount), 0).toFixed(2)),
    }
  }

  return {
    totalClosed:  trades.length,
    winCount:     wins.length,
    lossCount:    losses.length,
    winRate:      parseFloat(((wins.length / trades.length) * 100).toFixed(2)),
    totalPnl:     parseFloat(totalPnl.toFixed(2)),
    avgPnl:       parseFloat(avgPnl.toFixed(2)),
    avgWin:       parseFloat(avgWin.toFixed(2)),
    avgLoss:      parseFloat(avgLoss.toFixed(2)),
    riskReward:   parseFloat(riskReward.toFixed(2)),
    maxWinStreak,
    maxLossStreak,
    bestTrade,
    worstTrade,
    longStats:    calcSideStats(longTrades),
    shortStats:   calcSideStats(shortTrades),
  }
}

//  JOURNAL STATS — aktivitas journaling user
const getJournalStats = async (userId) => {
  const now       = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

  const [
    total, thisMonthCount, lastMonthCount,
    byVisibility, topViewed, recentActivity,
    totalLikesReceived, totalCommentsReceived,
  ] = await Promise.all([
    prisma.journal.count({ where: { userId } }),

    prisma.journal.count({ where: { userId, createdAt: { gte: thisMonth } } }),

    prisma.journal.count({
      where: { userId, createdAt: { gte: lastMonth, lte: lastMonthEnd } },
    }),

    prisma.journal.groupBy({
      by:    ['visibility'],
      where: { userId },
      _count: { id: true },
    }),

    prisma.journal.findMany({
      where:   { userId },
      orderBy: { viewCount: 'desc' },
      take:    5,
      select:  { id: true, title: true, viewCount: true, visibility: true,
                 _count: { select: { likes: true, comments: true } } },
    }),

    prisma.journal.findMany({
      where:   { userId },
      orderBy: { updatedAt: 'desc' },
      take:    5,
      select:  { id: true, title: true, updatedAt: true, visibility: true },
    }),

    prisma.journalLike.count({ where: { journal: { userId } } }),
    prisma.journalComment.count({ where: { journal: { userId } } }),
  ])

  const growthRate = lastMonthCount > 0
    ? parseFloat((((thisMonthCount - lastMonthCount) / lastMonthCount) * 100).toFixed(1))
    : thisMonthCount > 0 ? 100 : 0

  const visibilityMap = {}
  byVisibility.forEach(v => { visibilityMap[v.visibility] = v._count.id })

  return {
    total,
    thisMonth:   thisMonthCount,
    lastMonth:   lastMonthCount,
    growthRate,
    byVisibility: {
      private:     visibilityMap['private']     || 0,
      public:      visibilityMap['public']      || 0,
      members_only: visibilityMap['members_only'] || 0,
    },
    engagement: {
      totalLikes:    totalLikesReceived,
      totalComments: totalCommentsReceived,
    },
    topViewed,
    recentActivity,
  }
}

//  ACTIVITY STREAK — berapa hari berturut trading/journaling
const getActivityStreak = async (userId) => {
  // Ambil semua tanggal ada journal atau trade
  const [journals, trades] = await Promise.all([
    prisma.journal.findMany({
      where:  { userId },
      select: { createdAt: true },
    }),
    prisma.journalTrade.findMany({
      where:  { journal: { userId } },
      select: { tradeDate: true },
    }),
  ])

  // Kumpulkan semua tanggal aktif (unique)
  const activeDatesSet = new Set()
  journals.forEach(j => activeDatesSet.add(j.createdAt.toISOString().split('T')[0]))
  trades.forEach(t => activeDatesSet.add(new Date(t.tradeDate).toISOString().split('T')[0]))

  const activeDates = [...activeDatesSet].sort()

  if (activeDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalActiveDays: 0, lastActiveDate: null }
  }

  // Hitung longest streak
  let longestStreak = 1, currentCount = 1
  for (let i = 1; i < activeDates.length; i++) {
    const prev = new Date(activeDates[i - 1])
    const curr = new Date(activeDates[i])
    const diff = (curr - prev) / (1000 * 60 * 60 * 24)
    if (diff === 1) { currentCount++; longestStreak = Math.max(longestStreak, currentCount) }
    else currentCount = 1
  }

  // Hitung current streak (dari hari ini mundur)
  const today     = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  let currentStreak = 0

  if (activeDatesSet.has(today) || activeDatesSet.has(yesterday)) {
    const startCheck = activeDatesSet.has(today) ? today : yesterday
    let checkDate = new Date(startCheck)
    while (activeDatesSet.has(checkDate.toISOString().split('T')[0])) {
      currentStreak++
      checkDate = new Date(checkDate.getTime() - 86400000)
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalActiveDays: activeDates.length,
    lastActiveDate:  activeDates[activeDates.length - 1],
  }
}

//  FULL DASHBOARD — semua data sekaligus dalam 1 request
const getFullDashboard = async (userId) => {
  // Jalankan semua query paralel untuk performa maksimal
  const [overview, tradePerformance, journalStats, streak, monthlyPnl, coinPerformance] =
    await Promise.all([
      getOverview(userId),
      getTradePerformance(userId),
      getJournalStats(userId),
      getActivityStreak(userId),
      getMonthlyPnlChart(userId, new Date().getFullYear()),
      getCoinPerformance(userId),
    ])

  return {
    overview,
    tradePerformance,
    journalStats,
    streak,
    monthlyPnl,
    coinPerformance: {
      top5ByPnl:       coinPerformance.byPnl.slice(0, 5),
      top5ByWinRate:   coinPerformance.byWinRate.slice(0, 5),
      top5ByFrequency: coinPerformance.byFrequency.slice(0, 5),
    },
  }
}

module.exports = {
  getOverview,
  getMonthlyPnlChart,
  getDailyPnlHeatmap,
  getCoinPerformance,
  getTradePerformance,
  getJournalStats,
  getActivityStreak,
  getFullDashboard,
}
