const isEven = require('is-even')

module.exports = (number) => (isEven(number) ? `${number} is even` : `${number} is odd`)
