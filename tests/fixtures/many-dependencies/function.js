// eslint-disable-next-line node/global-require
module.exports = [require('execa'), require('del'), require('nyc')].every(Boolean)
