const test = require('ava')

const {
  DEFAULT_NODE_VERSION,
  getNodeVersion,
  parseVersion,
} = require('../../../../../dist/runtimes/node/utils/node_version.js')

test('getNodeVersion', (t) => {
  t.is(getNodeVersion('nodejs14.x'), 14)
  t.is(getNodeVersion('nodejs12.x'), 12)
  t.is(getNodeVersion('nodejs8.x'), 8)
  t.is(getNodeVersion('12.x'), 12)
  t.is(getNodeVersion('8.x'), 8)
  t.is(getNodeVersion('node16'), DEFAULT_NODE_VERSION)
  t.is(getNodeVersion(':shrug:'), DEFAULT_NODE_VERSION)
})

test('parseVersion', (t) => {
  t.is(parseVersion('nodejs12.x'), 12)
  t.is(parseVersion('nodejs8.x'), 8)
  t.is(parseVersion('12.x'), 12)
  t.is(parseVersion('8.x'), 8)
  t.is(parseVersion('node14'), undefined)
  t.is(parseVersion(':shrug:'), undefined)
})
