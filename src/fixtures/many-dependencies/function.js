/* eslint-disable node/no-unpublished-require */
module.exports = [require('@babel/core'), require('ava'), require('eslint'), require('nyc'), require('prettier')].every(
  Boolean
)
