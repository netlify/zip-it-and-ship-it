const test = require('ava')

const { sanitisePackageJson } = require('../dist/runtimes/node/utils/package_json')

test('sanitisePackageJson', (t) => {
  t.deepEqual(
    sanitisePackageJson({
      files: ['a.js', null, 'b.js'],
    }),
    {
      files: ['a.js', 'b.js'],
    },
  )

  t.deepEqual(
    sanitisePackageJson({
      files: { 'a.js': true, 'b.js': false },
    }),
    {
      files: undefined,
    },
  )
})
