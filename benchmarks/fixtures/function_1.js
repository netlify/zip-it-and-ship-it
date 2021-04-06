const d3 = require('d3')
const jquery = require('jquery')
const lodash = require('lodash')
const moment = require('moment')

const handler = async function () {
  return {
    statusCode: 200,
    body: JSON.stringify({
      d3: Boolean(d3),
      lodash: Boolean(lodash),
      jquery: Boolean(jquery),
      moment: Boolean(moment),
    }),
  }
}

module.exports = { handler }
