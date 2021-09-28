const { cron } = require('@netlify/functions')

module.exports.handler = cron('@daily', () => {
  // function handler
})
