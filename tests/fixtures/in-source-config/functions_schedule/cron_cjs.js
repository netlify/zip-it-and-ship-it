const { schedule } = require('@netlify/functions')

module.exports.handler = schedule('@daily', () => {
  // function handler
})
