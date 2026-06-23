const router = require('express').Router()
const { authenticate } = require('../middleware/auth.middleware')
const { getMyPositions } = require('../controllers/position.controller')

router.get('/', authenticate, getMyPositions)

module.exports = router