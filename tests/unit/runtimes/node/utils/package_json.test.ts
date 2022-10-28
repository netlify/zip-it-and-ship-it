import { describe, expect, test } from 'vitest'

import { sanitisePackageJson } from '../../../../../src/runtimes/node/utils/package_json.js'

describe('sanitisePackageJson', () => {
  test('removes nulls from files', () => {
    const result = sanitisePackageJson({
      files: ['a.js', null, 'b.js'],
    })

    expect(result).toEqual({
      files: ['a.js', 'b.js'],
    })
  })

  test('does not crash on invalid files entries', () => {
    const result = sanitisePackageJson({
      files: { 'a.js': true, 'b.js': false },
    })

    expect(result).toEqual({
      files: undefined,
    })
  })
})
