const { schedule } = require('@netlify/functions')

module.exports.handler = schedule(null, () => {
  // function handler
})
