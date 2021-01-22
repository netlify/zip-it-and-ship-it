const { join } = require('path')

const test = require('ava')
const execa = require('execa')
const { tmpName } = require('tmp-promise')

const { version } = require('../package.json')

const { FIXTURES_DIR } = require('./helpers/main.js')

const BINARY_PATH = `${__dirname}/../src/bin.js`

test('CLI | --version', async (t) => {
  const { stdout } = await execa(BINARY_PATH, ['--version'])

  t.is(stdout, version)
})

test('CLI | --help', async (t) => {
  const { stdout } = await execa(BINARY_PATH, ['--help'])

  t.true(stdout.includes('Options:'))
})

test('CLI | Normal execution', async (t) => {
  const tmpDir = await tmpName({ prefix: 'zip-it-test' })
  const { stdout } = await execa(BINARY_PATH, [join(FIXTURES_DIR, 'simple'), tmpDir])
  const zipped = JSON.parse(stdout)

  t.is(zipped.length, 1)
  t.is(zipped[0].runtime, 'js')
})

test('CLI | Error execution', async (t) => {
  const { exitCode, stderr } = await execa(BINARY_PATH, ['doesNotExist', 'destFolder'], { reject: false })

  t.is(exitCode, 1)
  t.true(stderr !== '')
})

test('CLI | Should throw on missing srcFolder', async (t) => {
  const { exitCode, stderr } = await execa(BINARY_PATH, { reject: false })

  t.is(exitCode, 1)
  t.true(stderr.includes('Not enough non-option arguments'))
})

test('CLI | Should throw on missing destFolder', async (t) => {
  const { exitCode, stderr } = await execa(BINARY_PATH, ['srcFolder'], { reject: false })

  t.is(exitCode, 1)
  t.true(stderr.includes('Not enough non-option arguments'))
})
