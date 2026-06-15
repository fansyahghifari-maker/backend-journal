const router = require('express').Router()
const ctrl   = require('../controllers/calendar.controller')
const { authenticate } = require('../middleware/auth')

// Semua route kalender butuh login
router.use(authenticate)

// Monthly view — ?year=2024&month=5
router.get('/monthly', ctrl.getMonthlyCalendar)

// Yearly view — ?year=2024
router.get('/yearly', ctrl.getYearlyCalendar)

// Shortcut hari ini
router.get('/today', ctrl.getToday)

// Jurnal per tanggal — /date/2024-05-15
router.get('/date/:date', ctrl.getByDate)

module.exports = router
