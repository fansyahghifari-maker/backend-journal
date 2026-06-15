const router  = require('express').Router()
const ctrl    = require('../controllers/social.controller')
const { addCommentRules, updateCommentRules } = require('../validators/social.validator')
const { validate }     = require('../middleware/validate')
const { authenticate } = require('../middleware/auth')

//  Helper: optional auth
const optionalAuth = (req, res, next) => {
  if (req.headers.authorization) return authenticate(req, res, next)
  next()
}

//  FEED
router.get('/feed',     optionalAuth, ctrl.getFeed)
router.get('/trending', optionalAuth, ctrl.getTrending)

//  USER PROFILE PUBLIK
router.get('/users/:username', optionalAuth, ctrl.getUserProfile)

//  LIKES
router.post('/journals/:journalId/like',  authenticate, ctrl.toggleLike)
router.get('/journals/:journalId/likes',  optionalAuth, ctrl.getLikes)

//  COMMENTS
router.get('/journals/:journalId/comments',       optionalAuth,  ctrl.getComments)
router.post('/journals/:journalId/comments',      authenticate, addCommentRules, validate, ctrl.addComment)
router.patch('/comments/:commentId',              authenticate, updateCommentRules, validate, ctrl.updateComment)
router.delete('/comments/:commentId',             authenticate, ctrl.deleteComment)

//  NOTIFIKASI — semua wajib login
router.get('/notifications',              authenticate, ctrl.getNotifications)
router.patch('/notifications/read-all',   authenticate, ctrl.markAllRead)
router.patch('/notifications/:id/read',   authenticate, ctrl.markNotificationRead)
router.delete('/notifications/:id',       authenticate, ctrl.deleteNotification)

module.exports = router
