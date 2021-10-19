const test = require('ava')

const { getFlags } = require('../dist/feature_flags')

test('Respects default value of flags', (t) => {
  const flags = getFlags({}, { someFlag: false })

  t.is(flags.someFlag, false)
})

test('Ignores undeclared flags', (t) => {
  const flags = getFlags({ unknownFlag: true }, { someFlag: false })

  t.is(flags.unknownFlag, undefined)
})

test('Supplied flag values override defaults', (t) => {
  const flags = getFlags({ someFlag: true, otherFlag: false }, { someFlag: false, otherFlag: true })

  t.is(flags.someFlag, true)
  t.is(flags.otherFlag, false)
})

test('Uses built-in defaults', (t) => {
  t.notThrows(() => getFlags({ someFlag: true, otherFlag: false }))
})
