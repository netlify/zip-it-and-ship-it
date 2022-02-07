const test = require('ava')

const { getNodeVersion, DEFAULT_NODE_VERSION } = require('../../../../../dist/runtimes/node/utils/node_version')

test('getNodeVersion', (t) => {
  t.is(getNodeVersion('nodejs12.x'), 12)
  t.is(getNodeVersion('nodejs8.x'), 8)
  t.is(getNodeVersion('12.x'), 12)
  t.is(getNodeVersion('8.x'), 8)
  t.is(getNodeVersion('node14'), DEFAULT_NODE_VERSION)
  t.is(getNodeVersion(':shrug'), DEFAULT_NODE_VERSION)
})
