const { schedule: foo } = require('@netlify/functions')

module.exports.handler = foo('@daily', () => {
  // function handler
})
