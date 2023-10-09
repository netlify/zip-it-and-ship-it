const { os } = require('process')

exports.name = typeof os === 'string' ? 'helper6' : new Error('Something went wrong')
