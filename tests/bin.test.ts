import { readFile } from 'fs/promises'
import { join } from 'path'

import { execaNode, NodeOptions } from 'execa'
import { tmpName } from 'tmp-promise'
import { describe, expect, test } from 'vitest'

import { FIXTURES_DIR, BINARY_PATH } from './helpers/main.js'

const ROOT_PACKAGE_JSON = new URL('../package.json', import.meta.url)

const exec = (args: readonly string[], options?: NodeOptions) => execaNode(BINARY_PATH, args, options)

describe('CLI', () => {
  test('--version', async () => {
    const { stdout } = await exec(['--version'])
    const { version } = JSON.parse(await readFile(ROOT_PACKAGE_JSON, 'utf-8'))
    expect(stdout).toBe(version)
  })

  test('--help', async () => {
    const { stdout } = await exec(['--help'])

    expect(stdout).toMatch('Options:')
  })

  test('Normal execution', async () => {
    const tmpDir = await tmpName({ prefix: 'zip-it-bin-test' })
    const { stdout } = await exec([join(FIXTURES_DIR, 'simple'), tmpDir])
    const zipped = JSON.parse(stdout)

    expect(zipped).toHaveLength(1)
    expect(zipped[0].runtime).toBe('js')
  })

  test('Error execution', async () => {
    const tmpDir = await tmpName({ prefix: 'zip-it-bin-test' })
    const { exitCode, stderr } = await exec(['doesNotExist', join(tmpDir, 'destFolder')], { reject: false })

    expect(exitCode).toBe(1)
    expect(stderr).not.toBe('')
  })

  test('Should throw on missing srcFolder', async () => {
    const { exitCode, stderr } = await exec([], { reject: false })

    expect(exitCode).toBe(1)

    expect(stderr).toMatch('Not enough non-option arguments')
  })

  test('Should throw on missing destFolder', async () => {
    const { exitCode, stderr } = await exec(['srcFolder'], { reject: false })

    expect(exitCode).toBe(1)
    expect(stderr).toMatch('Not enough non-option arguments')
  })

  test('--config', async () => {
    const tmpDir = await tmpName({ prefix: 'zip-it-bin-test' })
    const { stdout } = await exec([
      join(FIXTURES_DIR, 'simple'),
      tmpDir,
      '--config',
      '{ "*": { "nodeBundler": "esbuild" } }',
    ])
    const zipped = JSON.parse(stdout)

    expect(zipped).toHaveLength(1)
    expect(zipped[0].config.nodeBundler).toBe('esbuild')
  })
})
