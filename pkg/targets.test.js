const test = require('ava')

const { getTargets } = require('./targets')

test('Should use different targets', t => {
  const targets = getTargets().map(normalizeTarget)
  t.snapshot(targets)
})

const normalizeTarget = function({ node, os, arch }) {
  return { node, os, arch }
}
