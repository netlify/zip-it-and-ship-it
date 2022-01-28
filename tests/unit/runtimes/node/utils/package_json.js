import test from 'ava'

import { sanitisePackageJson } from '../../../../../dist/runtimes/node/utils/package_json.js'

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
