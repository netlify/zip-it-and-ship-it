import { mkdir, rm } from 'fs/promises'
import { dirname, resolve, join, basename, relative } from 'path'
import { env, platform } from 'process'
import { fileURLToPath } from 'url'

import { execa } from 'execa'
import isCI from 'is-ci'
import { dir as getTmpDir } from 'tmp-promise'
import { afterAll, expect } from 'vitest'

import type { Config } from '../../src/config.js'
import { ListedFunction, zipFunctions } from '../../src/main.js'
import { listImports } from '../../src/runtimes/node/bundlers/zisi/list_imports.js'
import type { FunctionResult } from '../../src/utils/format_result.js'
import { ZipFunctionsOptions } from '../../src/zip.js'

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url))
export const FIXTURES_ESM_DIR = fileURLToPath(new URL('../fixtures-esm', import.meta.url))
export const BINARY_PATH = fileURLToPath(new URL('../../dist/bin.js', import.meta.url))

const keepTempDirs = env.ZISI_KEEP_TEMP_DIRS !== undefined

interface ZipOptions {
  length?: number
  fixtureDir?: string
  opts?: ZipFunctionsOptions
}

interface ZipReturn {
  files: FunctionResult[]
  tmpDir: string
}

export type TestFunctionResult = FunctionResult & { unzipPath: string }

interface ZipNodeReturn extends ZipReturn {
  files: TestFunctionResult[]
}

// Accumulator of temporary directories that need to be cleaned up afterwards.
let cleanupDirectories: string[] = []

// We have to manually clean up all the created temp directories.
// `tmp-promise` usually does this on process.exit(), but vitest runs the test files
// in worker threads which do not emit the exit event
afterAll(async () => {
  await Promise.all(cleanupDirectories.map((dir) => rm(dir, { force: true, recursive: true, maxRetries: 10 })))

  cleanupDirectories = []
})

export const zipNode = async function (
  fixture: string[] | string,
  zipOptions: ZipOptions = {},
): Promise<ZipNodeReturn> {
  const { files, tmpDir } = await zipFixture(fixture, zipOptions)
  const { archiveFormat } = zipOptions.opts || {}

  if (archiveFormat === undefined || archiveFormat === 'zip') {
    await requireExtractedFiles(files)
  }

  return { files: files as TestFunctionResult[], tmpDir }
}

export const getBundlerNameFromOptions = ({ config = {} }: { config?: Config }) =>
  config['*'] && config['*'].nodeBundler

export const zipFixture = async function (
  fixture: string[] | string,
  { length, fixtureDir, opts = {} }: ZipOptions = {},
): Promise<ZipReturn> {
  const bundlerString = getBundlerNameFromOptions(opts) || 'default'
  const { path: tmpDir } = await getTmpDir({
    prefix: `zip-it-test-bundler-${bundlerString}`,
    // Cleanup the folder even if there are still files in them
    unsafeCleanup: true,
    keep: keepTempDirs,
  })

  if (keepTempDirs) {
    console.log(tmpDir)
  } else if (!isCI) {
    // We only do the cleanup locally
    cleanupDirectories.push(tmpDir)
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

export const unzipFiles = async function (files: FunctionResult[]): Promise<TestFunctionResult[]> {
  await Promise.all(
    Object.keys(files).map(async (key) => {
      const { path, name } = files[key]
      const dest = join(dirname(path), name)
      await unzipFile(path, dest)

      // eslint-disable-next-line no-param-reassign
      files[key].unzipPath = dest
    }),
  )

  return files as TestFunctionResult[]
}

const unzipFile = async function (path: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })

  // eslint-disable-next-line unicorn/prefer-ternary
  if (platform === 'win32') {
    await execa('tar', ['-xf', path, '-C', dest])
  } else {
    await execa('unzip', ['-o', path, '-d', dest])
  }
}

const replaceUnzipPath = function ({ path }: { path: string }): string {
  return join(path.replace(/.zip$/, ''), basename(path).replace(/.zip$/, '.js'))
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

export const normalizeFiles = function (
  fixtureDir: string,
  {
    mainFile,
    srcFile,
    ...rest
  }: ListedFunction & {
    srcFile?: string
  },
) {
  return {
    mainFile: relative(fixtureDir, mainFile).replace(/\\/g, '/'),
    srcFile: srcFile ? relative(fixtureDir, srcFile).replace(/\\/g, '/') : undefined,
    ...rest,
  }
}
