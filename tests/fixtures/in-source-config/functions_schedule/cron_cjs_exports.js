const { schedule } = require('@netlify/functions')

exports.handler = schedule('@daily', () => {
  // function handler
})
