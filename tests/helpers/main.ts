import { mkdir } from 'fs/promises'
import { dirname, resolve, normalize } from 'path'
import { env, platform } from 'process'
import { fileURLToPath } from 'url'

import { execa } from 'execa'
import { dir as getTmpDir } from 'tmp-promise'
import { expect } from 'vitest'

import type { Config } from '../../src/config.js'
import { zipFunctions } from '../../src/main.js'
import { listImports } from '../../src/runtimes/node/bundlers/zisi/list_imports.js'
import type { FunctionResult } from '../../src/utils/format_result.js'
import { ZipFunctionsOptions } from '../../src/zip.js'

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url))
export const BINARY_PATH = fileURLToPath(new URL('../../dist/bin.js', import.meta.url))

interface ZipOptions {
  length?: number
  fixtureDir?: string
  opts?: ZipFunctionsOptions
}

interface ZipReturn {
  files: FunctionResult[]
  tmpDir: string
}

export const zipNode = async function (fixture: string[] | string, zipOptions: ZipOptions = {}): Promise<ZipReturn> {
  const { files, tmpDir } = await zipFixture(fixture, zipOptions)
  const { archiveFormat } = zipOptions.opts || {}

  if (archiveFormat === undefined || archiveFormat === 'zip') {
    await requireExtractedFiles(files)
  }

  return { files, tmpDir }
}

export const getBundlerNameFromConfig = (config: Config) => config['*'] && config['*'].nodeBundler
export const zipFixture = async function (
  fixture: string[] | string,
  { length, fixtureDir, opts = {} }: ZipOptions = {},
): Promise<ZipReturn> {
  const { config = {} } = opts
  const bundlerString = getBundlerNameFromConfig(config) || 'default'
  const { path: tmpDir } = await getTmpDir({
    prefix: `zip-it-test-bundler-${bundlerString}`,
    // Cleanup the folder on process exit even if there are still files in them
    unsafeCleanup: true,
  })

  if (env.ZISI_KEEP_TEMP_DIRS !== undefined) {
    console.log(tmpDir)
  }

  const { files } = await zipCheckFunctions(fixture, { length, fixtureDir, tmpDir, opts })
  return { files, tmpDir }
}

export const zipCheckFunctions = async function (
  fixture: string[] | string,
  { length = 1, fixtureDir = FIXTURES_DIR, tmpDir, opts }: ZipOptions & { tmpDir: string },
): Promise<ZipReturn> {
  const srcFolders = Array.isArray(fixture)
    ? fixture.map((srcFolder) => `${fixtureDir}/${srcFolder}`)
    : `${fixtureDir}/${fixture}`
  const files = await zipFunctions(srcFolders, tmpDir, opts)

  expect(Array.isArray(files)).toBe(true)
  expect(files).toHaveLength(length)

  return { files, tmpDir }
}

const requireExtractedFiles = async function (files: FunctionResult[]): Promise<void> {
  await unzipFiles(files)

  const jsFiles = await Promise.all(files.map(replaceUnzipPath).map((file) => importFunctionFile(file)))

  expect(jsFiles.every(Boolean)).toBe(true)
}

export const unzipFiles = async function (files: FunctionResult[], targetPathGenerator?: (path: string) => string) {
  // unzip functions in series, as on windows it sometimes fails with permission
  // errors if two unzip calls try to create the same file
  for (const { path } of files) {
    await unzipFile({ path, targetPathGenerator })
  }
}

const unzipFile = async function ({
  path,
  targetPathGenerator,
}: {
  path: string
  targetPathGenerator?: (path: string) => string
}): Promise<void> {
  let dest = dirname(path)
  if (targetPathGenerator) {
    dest = resolve(targetPathGenerator(path))
  }

  await mkdir(dest, { recursive: true })

  // eslint-disable-next-line unicorn/prefer-ternary
  if (platform === 'win32') {
    await execa('tar', ['-xf', path, '-C', dest])
  } else {
    await execa('unzip', ['-o', path, '-d', dest])
  }
}

const replaceUnzipPath = function ({ path }: { path: string }): string {
  return path.replace('.zip', '.js')
}

// Returns a list of paths included using `require` calls. Relative requires
// will be traversed recursively up to a depth defined by `depth`. All the
// required paths — relative or not — will be returned in a flattened array.
export const getRequires = async function (
  { depth = Number.POSITIVE_INFINITY, filePath }: { depth?: number; filePath: string },
  currentDepth = 1,
): Promise<string[]> {
  const requires = await listImports({
    featureFlags: { parseWithEsbuild: true },
    functionName: 'test-function',
    path: filePath,
  })

  if (currentDepth >= depth) {
    return requires
  }

  const result = requires
  const basePath = dirname(filePath)
  for (const requirePath of requires) {
    if (!requirePath.startsWith('.')) {
      continue
    }

    const fullRequirePath = resolve(basePath, requirePath)

    const subRequires = await getRequires({ depth, filePath: fullRequirePath }, currentDepth + 1)
    result.push(...subRequires)
  }

  return result
}

// Import a file exporting a function.
// Returns `default` exports as is.
export const importFunctionFile = async function <T = any>(functionPath: string): Promise<T> {
  // eslint-disable-next-line import/no-dynamic-require
  const result = await import(functionPath)
  return result.default === undefined ? result : result.default
}

export const normalizeFiles = function (fixtureDir: string, { name, mainFile, runtime, extension, srcFile, schedule }) {
  const mainFileA = normalize(`${fixtureDir}/${mainFile}`)
  const srcFileA = srcFile === undefined ? {} : { srcFile: normalize(`${fixtureDir}/${srcFile}`) }

  return { name, mainFile: mainFileA, runtime, extension, schedule, ...srcFileA }
}
