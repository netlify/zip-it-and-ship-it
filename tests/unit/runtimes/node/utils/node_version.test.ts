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
    ['nodejs16.x', 16],
    ['nodejs18.x', 18],
    ['nodejs20.x', 20],
    ['18.x', 18],
    ['node16', 16],
    ['14.1.1', 14],
    ['v14.1', 14],
    [':shrug:', DEFAULT_NODE_VERSION],
  ])('handles `%s`', (input, expected) => {
    expect(getNodeVersion(input)).toBe(expected)
  })
})

describe('parseVersion', () => {
  test.each([
    ['nodejs14.x', 14],
    ['nodejs12.x', 12],
    ['nodejs18.x', 18],
    ['nodejs20.x', 20],
    ['18.x', 18],
    ['node14', 14],
    ['14.1.1', 14],
    ['v14.1', 14],
    [':shrug:', undefined],
  ])('handles `%s`', (input, expected) => {
    expect(parseVersion(input)).toBe(expected)
  })
})
