const router = require('express').Router()
const ctrl = require('../controllers/journal.controller')
const { createJournalRules, updateJournalRules, addTradeRules, addCommentRules } = require('../validators/journal.validator')
const { validate } = require('../middleware/validate')
const { authenticate } = require('../middleware/auth')

// PUBLIC tidak perlu login
// Feed publik (optional auth kalau login dapat lebih banyak konten)
router.get('/feed', (req, res, next) => {
  // Optional authenticate tidak error kalau tidak ada token
  const auth = req.headers.authorization
  if (auth) {
    return authenticate(req, res, () => next())
  }
  next()
}, ctrl.getPublicFeed)

// Lihat detail journal (visibility dicek di service)
router.get('/:id', (req, res, next) => {
  const auth = req.headers.authorization
  if (auth) return authenticate(req, res, () => next())
  next()
}, ctrl.getJournalById)

// Lihat komentar journal
router.get('/:id/comments', ctrl.getComments)

// PROTECTED wajib login
// Journal CRUD
router.post('/',        authenticate, createJournalRules, validate, ctrl.createJournal)
router.get('/me/list',  authenticate, ctrl.getMyJournals)
router.patch('/:id',    authenticate, updateJournalRules, validate, ctrl.updateJournal)
router.delete('/:id',   authenticate, ctrl.deleteJournal)

// Pin & Like
router.post('/:id/pin',  authenticate, ctrl.togglePin)
router.post('/:id/like', authenticate, ctrl.toggleLike)

// Comments
router.post('/:id/comments',           authenticate, addCommentRules, validate, ctrl.addComment)
router.delete('/:id/comments/:commentId', authenticate, ctrl.deleteComment)

// Trades
router.post('/:id/trades',         authenticate, addTradeRules, validate, ctrl.addTrade)
router.get('/:id/trades',          authenticate, ctrl.getTradesByJournal)
router.patch('/:id/trades/:tradeId', authenticate, ctrl.updateTrade)
router.delete('/:id/trades/:tradeId', authenticate, ctrl.deleteTrade)

// Stats
router.get('/me/trade-stats', authenticate, ctrl.getTradeStats)

module.exports = router
