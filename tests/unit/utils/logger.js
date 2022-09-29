// adapted from https://github.com/netlify/edge-bundler/blob/main/node/logger.test.ts

const test = require('ava')
const { stub } = require('sinon')

const { getLogger } = require('../../../dist/utils/logger.js')

const consoleLog = console.log

const noopLogger = () => {
  // no-op
}

test.afterEach.always(() => {
  // Restoring global `console.log`.
  console.log = consoleLog
})

test.serial('Prints user logs to stdout', (t) => {
  const mockConsoleLog = stub()
  console.log = mockConsoleLog

  const logger1 = getLogger(noopLogger, true)
  const logger2 = getLogger(noopLogger, false)

  logger1.user('Hello with `debug: true`')
  logger2.user('Hello with `debug: false`')

  t.is(mockConsoleLog.callCount, 2)
  t.is(mockConsoleLog.firstCall.firstArg, 'Hello with `debug: true`')
  t.is(mockConsoleLog.secondCall.firstArg, 'Hello with `debug: false`')
})

test.serial('Prints system logs to the system logger provided', (t) => {
  const mockSystemLog = stub()
  const mockConsoleLog = stub()
  console.log = mockSystemLog

  const logger1 = getLogger(mockSystemLog, true)
  const logger2 = getLogger(mockSystemLog, false)

  logger1.system('Hello with `debug: true`')
  logger2.system('Hello with `debug: false`')

  t.is(mockConsoleLog.callCount, 0)
  t.is(mockSystemLog.callCount, 2)
  t.is(mockSystemLog.firstCall.firstArg, 'Hello with `debug: true`')
  t.is(mockSystemLog.secondCall.firstArg, 'Hello with `debug: false`')
})

test.serial('Prints system logs to stdout if there is no system logger provided and `debug` is enabled', (t) => {
  const mockConsoleLog = stub()
  console.log = mockConsoleLog

  const logger1 = getLogger(undefined, true)
  const logger2 = getLogger(undefined, false)

  logger1.system('Hello with `debug: true`')
  logger2.system('Hello with `debug: false`')

  t.is(mockConsoleLog.callCount, 1)
  t.is(mockConsoleLog.firstCall.firstArg, 'Hello with `debug: true`')
})
