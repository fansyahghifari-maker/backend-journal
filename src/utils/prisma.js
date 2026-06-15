const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ]
    : [{ emit: 'stdout', level: 'error' }],
})

// Log query di development (opsional, uncomment kalau mau debug SQL)
// prisma.$on('query', (e) => {
//   console.log('[SQL]', e.query)
//   console.log('[Params]', e.params)
//   console.log('[Duration]', e.duration + 'ms')
// })

module.exports = prisma
