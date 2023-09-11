import { describe, expect, test } from 'vitest'

import { getNodeRuntime, getNodeRuntimeForV2 } from '../../../../../src/runtimes/node/utils/node_runtime.js'

describe('getNodeRuntime', () => {
  test.each([
    ['nodejs14.x', 'nodejs14.x'],
    ['nodejs16.x', 'nodejs16.x'],
    ['nodejs18.x', 'nodejs18.x'],
    ['14.x', 'nodejs14.x'],
    ['v16.x', 'nodejs16.x'],
    ['18.0.0', 'nodejs18.x'],
    ['v14.2.0', 'nodejs14.x'],
    ['14.1', 'nodejs14.x'],
    [':shrug:', undefined],
  ])('handles `%s`', (input, expected) => {
    expect(getNodeRuntime(input)).toBe(expected)
  })
})

describe('getNodeRuntimeForV2', () => {
  test.each([
    ['nodejs12.x', 'nodejs18.x'],
    ['nodejs16.x', 'nodejs18.x'],
    ['nodejs18.x', 'nodejs18.x'],
    // enable once supported
    // ['nodejs20.x', 'nodejs20.x'],
    ['14.x', 'nodejs18.x'],
    ['v16.x', 'nodejs18.x'],
    ['18.0.0', 'nodejs18.x'],
    // ['20.0.0', 'nodejs20.x'],
    ['v14.2.0', 'nodejs18.x'],
    ['14.1', 'nodejs18.x'],
    [':shrug:', 'nodejs18.x'],
    ['99.0.0', undefined],
  ])('handles `%s`', (input, expected) => {
    expect(getNodeRuntimeForV2(input)).toBe(expected)
  })
})
