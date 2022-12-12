import { describe, expect, test } from 'vitest'

import {
  DEFAULT_NODE_VERSION,
  getNodeVersion,
  parseVersion,
} from '../../../../../src/runtimes/node/utils/node_version.js'

describe('getNodeVersion', () => {
  test.each([
    ['nodejs14.x', 14],
    ['nodejs12.x', 12],
    ['nodejs8.x', 8],
    ['12.x', 12],
    ['8.x', 8],
    ['node16', DEFAULT_NODE_VERSION],
    [':shrug:', DEFAULT_NODE_VERSION],
  ])('handles `%s`', (input, expected) => {
    expect(getNodeVersion(input)).toBe(expected)
  })
})

describe('parseVersion', () => {
  test.each([
    ['nodejs14.x', 14],
    ['nodejs12.x', 12],
    ['nodejs8.x', 8],
    ['12.x', 12],
    ['8.x', 8],
    ['node16', undefined],
    [':shrug:', undefined],
  ])('handles `%s`', (input, expected) => {
    expect(parseVersion(input)).toBe(expected)
  })
})
