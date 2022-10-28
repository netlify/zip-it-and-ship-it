import { afterEach, test, expect, vi } from 'vitest'

import { getLogger } from '../../../src/utils/logger.js'

const consoleLog = console.log

const noopLogger = () => {
  // no-op
}

afterEach(() => {
  // Restoring global `console.log`.
  console.log = consoleLog
})

test('Prints user logs to stdout', () => {
  const mockConsoleLog = vi.fn()
  console.log = mockConsoleLog

  const logger1 = getLogger(noopLogger, true)
  const logger2 = getLogger(noopLogger, false)

  logger1.user('Hello with `debug: true`')
  logger2.user('Hello with `debug: false`')

  expect(mockConsoleLog).toHaveBeenCalledTimes(2)
  expect(mockConsoleLog.firstCall.firstArg).toBe('Hello with `debug: true`')
  expect(mockConsoleLog.secondCall.firstArg).toBe('Hello with `debug: false`')
})

test('Prints system logs to the system logger provided', () => {
  const mockSystemLog = stub()
  const mockConsoleLog = stub()
  console.log = mockSystemLog

  const logger1 = getLogger(mockSystemLog, true)
  const logger2 = getLogger(mockSystemLog, false)

  logger1.system('Hello with `debug: true`')
  logger2.system('Hello with `debug: false`')

  expect(mockConsoleLog.callCount).toBe(0)
  expect(mockSystemLog.callCount).toBe(2)
  expect(mockSystemLog.firstCall.firstArg).toBe('Hello with `debug: true`')
  expect(mockSystemLog.secondCall.firstArg).toBe('Hello with `debug: false`')
})

test('Prints system logs to stdout if there is no system logger provided and `debug` is enabled', () => {
  const mockConsoleLog = stub()
  console.log = mockConsoleLog

  const logger1 = getLogger(undefined, true)
  const logger2 = getLogger(undefined, false)

  logger1.system('Hello with `debug: true`')
  logger2.system('Hello with `debug: false`')

  expect(mockConsoleLog.callCount).toBe(1)
  expect(mockConsoleLog.firstCall.firstArg).toBe('Hello with `debug: true`')
})
