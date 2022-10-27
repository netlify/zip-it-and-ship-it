import { describe, expect, test } from 'vitest'

import { getFlags } from '../src/feature_flags.js'

describe('feature flags', () => {
  test('Respects default value of flags', () => {
    const flags = getFlags({}, { someFlag: false })

    expect(flags.someFlag).toBe(false)
  })

  test('Ignores undeclared flags', () => {
    const flags = getFlags({ unknownFlag: true }, { someFlag: false })

    expect(flags.unknownFlag).toBeUndefined()
  })

  test('Supplied flag values override defaults', () => {
    const flags = getFlags({ someFlag: true, otherFlag: false }, { someFlag: false, otherFlag: true })

    expect(flags.someFlag).toBe(true)
    expect(flags.otherFlag).toBe(false)
  })

  test('Uses built-in defaults', () => {
    expect(() => getFlags({ someFlag: true, otherFlag: false })).not.toThrow()
  })
})
