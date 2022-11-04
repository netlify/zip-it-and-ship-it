import { describe, expect, test } from 'vitest'

import { sanitizePackageJson } from '../../../../../src/runtimes/node/utils/package_json.js'

describe('sanitizePackageJson', () => {
  test('removes nulls from files', () => {
    const result = sanitizePackageJson({
      files: ['a.js', null, 'b.js'],
    })

    expect(result).toEqual({
      files: ['a.js', 'b.js'],
    })
  })

  test('does not crash on invalid files entries', () => {
    const result = sanitizePackageJson({
      files: { 'a.js': true, 'b.js': false },
    })

    expect(result).toEqual({
      files: undefined,
    })
  })
})
