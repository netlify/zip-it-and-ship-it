import { mkdir, readFile, rm, symlink, writeFile } from 'fs/promises'
import { dirname, isAbsolute, join, resolve } from 'path'
import { arch, version as nodeVersion, platform } from 'process'

import cpy from 'cpy'
import decompress from 'decompress'
import merge from 'deepmerge'
import { execa, execaNode } from 'execa'
import glob from 'fast-glob'
import isCI from 'is-ci'
import { pathExists } from 'path-exists'
import semver from 'semver'
import { dir as getTmpDir, tmpName } from 'tmp-promise'
import unixify from 'unixify'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'

import { ARCHIVE_FORMAT } from '../src/archive.js'
import { ESBUILD_LOG_LIMIT } from '../src/runtimes/node/bundlers/esbuild/bundler.js'
import { NODE_BUNDLER } from '../src/runtimes/node/bundlers/types.js'
import { detectEsModule } from '../src/runtimes/node/utils/detect_es_module.js'
import { MODULE_FORMAT } from '../src/runtimes/node/utils/module_format.js'
import { shellUtils } from '../src/utils/shell.js'
import type { ZipFunctionsOptions } from '../src/zip.js'

import {
  BINARY_PATH,
  FIXTURES_DIR,
  getBundlerNameFromOptions,
  getRequires,
  importFunctionFile,
  unzipFiles,
  zipCheckFunctions,
  zipFixture,
  zipNode,
} from './helpers/main.js'
import { computeSha1 } from './helpers/sha.js'
import { allBundleConfigs, testMany } from './helpers/test_many.js'

// eslint-disable-next-line import/no-unassigned-import
import 'source-map-support/register'

vi.mock('../src/utils/shell.js', () => ({ shellUtils: { runCommand: vi.fn() } }))

const getZipChecksum = async function (opts: ZipFunctionsOptions) {
  const {
    files: [{ path }],
  } = await zipFixture('many-dependencies', { opts, fixtureDir: opts.basePath })

  return computeSha1(path)
}

interface CustomMatchers {
  toPathExist(): Promise<void>
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Assertion extends CustomMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

describe('zip-it-and-ship-it', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  testMany('Zips Node.js function files', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const fixtureName = 'simple'
    const { files } = await zipNode(fixtureName, { opts: options })

    expect(files[0].invocationMode).toBeUndefined()
    expect(files[0].runtime).toBe('js')
    expect(files[0].mainFile).toBe(join(FIXTURES_DIR, fixtureName, 'function.js'))
  })

  testMany(
    'Zips Node.js function files from an internal functions dir with a configured fields',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const fixtureName = join('node-internal', '.netlify/internal-functions')
      const { files } = await zipFixture(fixtureName, {
        length: 2,
        opts: {
          ...options,
          internalSrcFolder: join(FIXTURES_DIR, fixtureName),
          config: { 'function-1': { name: 'Function One', generator: '@netlify/mock-plugin@1.0.0' } },
        },
      })

      expect(files[0].displayName).toBe('Function One')
      expect(files[0].generator).toBe('@netlify/mock-plugin@1.0.0')
      expect(files[0].invocationMode).toBeUndefined()
      expect(files[1].displayName).toBeUndefined()
      expect(files[1].generator).toBe('internalFunc')
      expect(files[1].invocationMode).toBeUndefined()
    },
  )

  testMany(
    'Handles Node module with native bindings (buildtime marker module)',
    [...allBundleConfigs],
    async (opts) => {
      const bundler = getBundlerNameFromOptions(opts)
      const fixtureDir = 'node-module-native-buildtime'
      const { files } = await zipNode(fixtureDir, { opts })
      const [{ runtime, unzipPath }] = files
      const requires = await getRequires({ filePath: resolve(unzipPath, 'function.js') })
      const normalizedRequires = new Set(requires.map((path) => unixify(path)))

      expect(runtime).toBe('js')

      const moduleWithNodeFile = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/module-with-node-file`)
      await expect(`${unzipPath}/node_modules/module-with-node-file/native.node`).toPathExist()
      await expect(`${unzipPath}/node_modules/module-with-node-file/side-file.js`).toPathExist()
      expect(normalizedRequires.has('module-with-node-file')).toBe(true)

      const moduleWithNodeGypPath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/module-with-node-gyp`)
      await expect(`${unzipPath}/node_modules/module-with-node-gyp/native.node`).toPathExist()
      await expect(`${unzipPath}/node_modules/module-with-node-gyp/side-file.js`).toPathExist()
      expect(normalizedRequires.has('module-with-node-gyp')).toBe(true)

      const moduleWithPrebuildPath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/module-with-prebuild`)
      await expect(`${unzipPath}/node_modules/module-with-prebuild/native.node`).toPathExist()
      await expect(`${unzipPath}/node_modules/module-with-prebuild/side-file.js`).toPathExist()
      expect(normalizedRequires.has('module-with-prebuild')).toBe(true)

      // We can only detect native modules when using esbuild.
      if (bundler === NODE_BUNDLER.ESBUILD || bundler === NODE_BUNDLER.ESBUILD_ZISI) {
        expect(files[0].nativeNodeModules).toEqual({
          'module-with-node-file': { [moduleWithNodeFile]: '3.0.0' },
          'module-with-node-gyp': { [moduleWithNodeGypPath]: '1.0.0' },
          'module-with-prebuild': { [moduleWithPrebuildPath]: '2.0.0' },
        })
      }
    },
  )

  testMany(
    'Handles Node module with native bindings (runtime marker module)',
    [...allBundleConfigs],
    async (options) => {
      const bundler = getBundlerNameFromOptions(options)
      const fixtureDir = 'node-module-native-runtime'
      const { files } = await zipNode(fixtureDir, {
        opts: options,
      })
      const requires = await getRequires({ filePath: resolve(files[0].unzipPath, 'function.js') })
      const normalizedRequires = new Set(requires.map((path) => unixify(path)))
      const modulePath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/test`)

      const [{ runtime, unzipPath }] = files

      expect(runtime).toBe('js')
      await expect(`${unzipPath}/node_modules/test/native.node`).toPathExist()
      await expect(`${unzipPath}/node_modules/test/side-file.js`).toPathExist()
      expect(normalizedRequires.has('test')).toBe(true)

      // We can only detect native modules when using esbuild.
      if (bundler === NODE_BUNDLER.ESBUILD || bundler === NODE_BUNDLER.ESBUILD_ZISI) {
        expect(files[0].nativeNodeModules).toEqual({ test: { [modulePath]: '1.0.0' } })
      }
    },
  )

  testMany('Can require node modules', [...allBundleConfigs], async (options) => {
    await zipNode('local-node-module', { opts: options })
  })

  testMany('Can require deep paths in node modules', [...allBundleConfigs], async (options) => {
    const { files } = await zipNode('local-node-module-deep-require', {
      opts: options,
    })

    const func = await importFunctionFile(`${files[0].unzipPath}/function.js`)

    expect(func).toEqual({ mock: { stack: 'jam' }, stack: 'jam' })
  })

  testMany('Can require Node modules with destructuring expressions', [...allBundleConfigs], async (options) => {
    await zipNode(`local-node-module-destructure-require`, {
      opts: options,
    })
  })

  testMany('Can require scoped node modules', [...allBundleConfigs], async (options) => {
    await zipNode('node-module-scope', { opts: options })
  })

  testMany('Can require node modules nested files', [...allBundleConfigs], async (options) => {
    await zipNode('node-module-path', { opts: options })
  })

  testMany('Can require dynamically generated node modules', [...allBundleConfigs], async (options) => {
    await zipNode('side-module', { opts: options })
  })

  describe('aws-sdk special case', () => {
    testMany(
      'On Node v18, includes v2 and excludes v3',
      ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
      async (options) => {
        const fixtureName = 'node-module-excluded'
        const opts = merge(options, {
          basePath: join(FIXTURES_DIR, fixtureName),
          config: {
            '*': {
              ...options.config['*'],
              nodeVersion: '18',
            },
          },
        })
        const { files } = await zipNode(fixtureName, { opts })

        const [{ unzipPath, bundler, entryFilename }] = files

        if (bundler === 'esbuild') {
          // esbuild bundles everything into one file, so we need to assert on the file contents
          const bundle = await readFile(`${unzipPath}/${entryFilename}`, 'utf-8')
          expect(bundle).toContain('/aws-sdk')
          expect(bundle).not.toContain('/@aws-sdk')
        } else {
          await expect(`${files[0].unzipPath}/node_modules/aws-sdk`).toPathExist()
          await expect(`${files[0].unzipPath}/node_modules/@aws-sdk/client-s3`).not.toPathExist()
        }

        try {
          const func = await importFunctionFile(`${files[0].unzipPath}/function.js`)

          func()

          expect.fail('Running the function should fail due to the missing module')
        } catch (error) {
          expect(error.code).toBe('MODULE_NOT_FOUND')
        }
      },
    )

    testMany(
      'On Node v16, excludes v2 and includes v3',
      ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
      async (options) => {
        const fixtureName = 'node-module-excluded'
        const opts = merge(options, {
          basePath: join(FIXTURES_DIR, fixtureName),
          config: {
            '*': {
              ...options.config['*'],
              nodeVersion: '16',
            },
          },
        })
        const { files } = await zipNode(fixtureName, { opts })

        const [{ unzipPath, bundler, entryFilename }] = files
        if (bundler === 'esbuild') {
          // esbuild bundles everything into one file, so we need to assert on the file contents
          const bundle = await readFile(`${unzipPath}/${entryFilename}`, 'utf-8')
          expect(bundle).not.toContain('/aws-sdk')
          expect(bundle).toContain('/@aws-sdk')
        } else {
          await expect(`${files[0].unzipPath}/node_modules/aws-sdk`).not.toPathExist()
          await expect(`${files[0].unzipPath}/node_modules/@aws-sdk/client-s3`).toPathExist()
        }

        try {
          const func = await importFunctionFile(`${files[0].unzipPath}/function.js`)

          func()

          expect.fail('Running the function should fail due to the missing module')
        } catch (error) {
          expect(error.code).toBe('MODULE_NOT_FOUND')
        }
      },
    )
  })

  testMany('Ignore TypeScript types', [...allBundleConfigs], async (options) => {
    const { files } = await zipNode('node-module-typescript-types', {
      opts: options,
    })
    await expect(`${files[0].unzipPath}/node_modules/@types/node`).not.toPathExist()
  })

  testMany('Throws on runtime errors', [...allBundleConfigs], async (options) => {
    await expect(zipNode('node-module-error', { opts: options })).rejects.toThrowError()
  })

  testMany('Throws on missing dependencies', [...allBundleConfigs], async (options) => {
    await expect(zipNode('node-module-missing', { opts: options })).rejects.toThrowError()
  })

  testMany('Throws on missing dependencies with no optionalDependencies', [...allBundleConfigs], async (options) => {
    await expect(zipNode('node-module-missing-package', { opts: options })).rejects.toThrowError()
  })

  testMany('Throws on missing conditional dependencies', [...allBundleConfigs], async (options) => {
    await expect(zipNode('node-module-missing-conditional', { opts: options })).rejects.toThrowError()
  })

  testMany("Throws on missing dependencies' dependencies", [...allBundleConfigs], async (options) => {
    await expect(zipNode('node-module-missing-deep', { opts: options })).rejects.toThrowError()
  })

  testMany('Ignore missing optional dependencies', [...allBundleConfigs], async (options) => {
    await zipNode('node-module-missing-optional', { opts: options })
  })

  testMany('Ignore modules conditional dependencies', [...allBundleConfigs], async (options) => {
    await zipNode('node-module-deep-conditional', { opts: options })
  })

  testMany('Ignore missing optional peer dependencies', [...allBundleConfigs], async (options) => {
    await zipNode('node-module-peer-optional', { opts: options })
  })

  testMany(
    'Throws on missing optional peer dependencies with no peer dependencies',
    [...allBundleConfigs],
    async (options) => {
      await expect(zipNode('node-module-peer-optional-none', { opts: options })).rejects.toThrowError()
    },
  )

  testMany('Throws on missing non-optional peer dependencies', [...allBundleConfigs], async (options) => {
    await expect(zipNode('node-module-peer-not-optional', { opts: options })).rejects.toThrowError()
  })

  testMany(
    'Resolves dependencies from .netlify/plugins/node_modules when using `zipFunctions()`',
    [...allBundleConfigs],
    async (options) => {
      await zipNode('node-module-next-image', { opts: options })
    },
  )

  // We persist `package.json` as `package.json.txt` in git. Otherwise ESLint
  // tries to load when linting sibling JavaScript files. In this test, we
  // temporarily rename it to an actual `package.json`.
  testMany(
    'Throws on invalid package.json',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi'],
    async (options) => {
      await expect(zipNode('invalid-package-json', { opts: options })).rejects.toThrowError(
        /(invalid json|package.json:1:1: error: expected string in json but found "{")/i,
      )
    },
  )

  testMany('Ignore invalid require()', [...allBundleConfigs], async (options) => {
    await zipNode('invalid-require', { opts: options })
  })

  testMany('Can use dynamic import() with esbuild', ['bundler_esbuild'], async (options) => {
    await zipNode('dynamic-import', { opts: options })
  })

  testMany('Can require local files', [...allBundleConfigs], async (options) => {
    await zipNode('local-require', { opts: options })
  })

  testMany(
    'Can bundle ESM functions and transpile them to CJS when the Node version is <14 and `archiveType` is `none`',
    ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
    async (options) => {
      const length = 4
      const fixtureName = 'local-require-esm'
      const opts = merge(options, {
        archiveFormat: ARCHIVE_FORMAT.NONE,
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            nodeVersion: 'nodejs12.x',
          },
        },
        featureFlags: { zisi_pure_esm: false },
      })
      const { tmpDir } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      const functionPaths = [
        join(tmpDir, 'function', 'function.js'),
        join(tmpDir, 'function_cjs', 'function_cjs.js'),
        join(tmpDir, 'function_export_only', 'function_export_only.js'),
        join(tmpDir, 'function_import_only', 'function_import_only.js'),
      ]
      const func1 = () => importFunctionFile(functionPaths[0])
      const func2 = () => importFunctionFile(functionPaths[1])
      const func3 = () => importFunctionFile(functionPaths[2])
      const func4 = () => importFunctionFile(functionPaths[3])

      const functionsAreESM = await Promise.all(
        functionPaths.map((functionPath) => detectEsModule({ mainFile: functionPath })),
      )

      // None of the functions should be ESM since we're transpiling them to CJS.
      expect(functionsAreESM.some(Boolean)).toBe(false)

      const func2Default = await func2()
      expect(await func2Default()).toBe(0)

      const { ZERO } = await func1()
      expect(ZERO).toBe(0)

      const { howdy } = await func3()
      expect(howdy).toBeTypeOf('string')

      expect(await func4()).toEqual({})
    },
  )

  testMany(
    'Can bundle CJS functions that import ESM files with an `import()` expression',
    ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
    async (opts) => {
      const fixtureName = 'node-cjs-importing-mjs-extension'
      const { files } = await zipFixture(fixtureName, {
        opts,
      })

      const unzippedFunctions = await unzipFiles(files)

      const func = await importFunctionFile(join(unzippedFunctions[0].unzipPath, 'function.js'))

      const { body, statusCode } = await func.handler()

      expect(body).toBe('Hello world')
      expect(statusCode).toBe(200)
    },
  )

  testMany(
    'Can bundle native ESM functions when the Node version is >=14 and the `zisi_pure_esm` flag is on',
    ['bundler_default', 'bundler_nft', 'bundler_esbuild'],
    async (options) => {
      const length = 2
      const fixtureName = 'node-esm'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        featureFlags: { zisi_pure_esm: true },
      })
      const { files } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      const unzippedFunctions = await unzipFiles(files)

      const functionPaths = [
        join(unzippedFunctions[0].unzipPath, 'func1.js'),
        join(unzippedFunctions[1].unzipPath, 'func2.js'),
      ]
      const func1 = await importFunctionFile(functionPaths[0])
      const func2 = await importFunctionFile(functionPaths[1])

      expect(func1.handler()).toBe(true)
      expect(func2.handler()).toBe(true)

      const functionsAreESM = await Promise.all(
        functionPaths.map((functionPath) => detectEsModule({ mainFile: functionPath })),
      )

      expect(functionsAreESM.every(Boolean)).toBe(true)
    },
  )

  testMany(
    'Can bundle ESM functions and transpile them to CJS when the Node version is >=14 and the `zisi_pure_esm` flag is off',
    ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
    async (options) => {
      const length = 2
      const fixtureName = 'node-esm'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
      })
      const { files } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      const unzippedFunctions = await unzipFiles(files)

      const functionPaths = [
        join(unzippedFunctions[0].unzipPath, 'func1.js'),
        join(unzippedFunctions[1].unzipPath, 'func2.js'),
      ]
      const func1 = await importFunctionFile(functionPaths[0])
      const func2 = await importFunctionFile(functionPaths[1])

      expect(func1.handler()).toBe(true)
      expect(func2.handler()).toBe(true)

      const functionsAreESM = await Promise.all(
        functionPaths.map((functionPath) => detectEsModule({ mainFile: functionPath })),
      )

      expect(functionsAreESM.some(Boolean)).toBe(false)
    },
  )

  testMany('Can require local files deeply', [...allBundleConfigs], async (options) => {
    await zipNode('local-deep-require', { opts: options })
  })

  testMany('Can require local files in the parent directories', [...allBundleConfigs], async (options) => {
    await zipNode('local-parent-require', { opts: options })
  })

  testMany('Ignore missing critters dependency for Next.js 10', [...allBundleConfigs], async (options) => {
    await zipNode('node-module-next10-critters', { opts: options })
  })

  testMany(
    'Ignore missing critters dependency for Next.js exact version 10.0.5',
    [...allBundleConfigs],
    async (options) => {
      await zipNode('node-module-next10-critters-exact', { opts: options })
    },
  )

  testMany(
    'Ignore missing critters dependency for Next.js with range ^10.0.5',
    [...allBundleConfigs],
    async (options) => {
      await zipNode('node-module-next10-critters-10.0.5-range', {
        opts: options,
      })
    },
  )

  testMany(
    "Ignore missing critters dependency for Next.js with version='latest'",
    [...allBundleConfigs],
    async (options) => {
      await zipNode('node-module-next10-critters-latest', { opts: options })
    },
  )

  // Need to create symlinks dynamically because they sometimes get lost when
  // committed on Windows
  if (platform !== 'win32') {
    testMany('Can require symlinks', [...allBundleConfigs], async (options) => {
      const fixtureTmpDir = await tmpName({ prefix: 'zip-it-test' })
      const opts = merge(options, {
        basePath: `${fixtureTmpDir}/symlinks`,
      })
      await cpy('symlinks/**', `${fixtureTmpDir}/symlinks`, {
        cwd: FIXTURES_DIR,
      })

      const symlinkDir = `${fixtureTmpDir}/symlinks/function`
      const symlinkFile = `${symlinkDir}/file.js`
      const targetFile = `${symlinkDir}/target.js`

      if (!(await pathExists(symlinkFile))) {
        await symlink(targetFile, symlinkFile)
      }

      try {
        await zipNode('symlinks', { opts, fixtureDir: fixtureTmpDir })
      } finally {
        await rm(symlinkFile, { force: true, maxRetries: 10 })
      }
    })
  }

  testMany('Can target a directory with a main file with the same name', [...allBundleConfigs], async (options) => {
    const fixtureName = 'directory-handler'
    const { files } = await zipNode(fixtureName, { opts: options })

    expect(files[0].mainFile).toBe(join(FIXTURES_DIR, fixtureName, 'function', 'function.js'))
  })

  testMany(
    'Includes side files when the function is in a subdirectory',
    [...allBundleConfigs],
    async (options, variant) => {
      const shouldIncludeFiles = variant === 'bundler_default' || variant === 'bundler_default_nft'
      const { files } = await zipFixture('directory-side-files', { length: 2, opts: options })
      const unzippedFunctions = await unzipFiles(files)
      const [funcV1, funcV2] = unzippedFunctions
      const expectedBundler = {
        bundler_default: 'zisi',
        bundler_esbuild: 'esbuild',
        bundler_esbuild_zisi: 'esbuild',
        bundler_default_nft: 'nft',
        bundler_nft: 'nft',
      }

      expect(funcV1.bundler).toBe(expectedBundler[variant])
      expect(funcV1.runtimeAPIVersion).toBe(1)

      if (shouldIncludeFiles) {
        await expect(`${funcV1.unzipPath}/robots.txt`).toPathExist()
        await expect(`${funcV1.unzipPath}/sub-dir/sub-file.js`).toPathExist()
      } else {
        await expect(`${funcV1.unzipPath}/robots.txt`).not.toPathExist()
        await expect(`${funcV1.unzipPath}/sub-dir/sub-file.js`).not.toPathExist()
      }

      await expect(`${funcV1.unzipPath}/Desktop.ini`).not.toPathExist()
      await expect(`${funcV1.unzipPath}/node_modules`).not.toPathExist()

      expect(funcV2.bundler).toBe('nft')
      expect(funcV2.runtimeAPIVersion).toBe(2)
      await expect(`${funcV2.unzipPath}/robots.txt`).not.toPathExist()
      await expect(`${funcV2.unzipPath}/Desktop.ini`).not.toPathExist()
      await expect(`${funcV2.unzipPath}/node_modules`).not.toPathExist()
    },
  )

  testMany('Can target a directory with an index.js file', [...allBundleConfigs], async (options) => {
    const fixtureName = 'index-handler'
    const { files } = await zipFixture(fixtureName, {
      opts: options,
    })
    const unzippedFunctions = await unzipFiles(files)
    const returnValue = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
    expect(returnValue).toBe(true)
    expect(files[0].mainFile).toBe(join(FIXTURES_DIR, fixtureName, 'function', 'index.js'))
  })

  testMany('Keeps non-required files inside the target directory', [...allBundleConfigs], async (options) => {
    const { files } = await zipNode('keep-dir-files', { opts: options })
    await expect(`${files[0].unzipPath}/function.js`).toPathExist()
  })

  testMany('Ignores non-required node_modules inside the target directory', [...allBundleConfigs], async (options) => {
    const { files } = await zipNode('ignore-dir-node-modules', {
      opts: options,
    })
    await expect(`${files[0].unzipPath}/node_modules`).not.toPathExist()
  })

  testMany(
    'Ignores deep non-required node_modules inside the target directory',
    [...allBundleConfigs],
    async (options) => {
      const { files } = await zipNode('ignore-deep-dir-node-modules', {
        opts: options,
      })
      await expect(`${files[0].unzipPath}/deep/node_modules`).not.toPathExist()
    },
  )

  describe('many-dependencies fixture', () => {
    let fixtureTmpDir: string

    beforeAll(async () => {
      fixtureTmpDir = await tmpName({ prefix: 'many-dependencies' })
      const basePath = `${fixtureTmpDir}/many-dependencies`

      await cpy('many-dependencies/**', basePath, { cwd: FIXTURES_DIR })

      await execa('npm', ['install', '--no-package-lock', '--no-audit', '--prefer-offline', '--progress=false'], {
        cwd: basePath,
      })
    }, 30_000)

    afterAll(async () => {
      // No need to cleanup on CI
      if (isCI) return

      await rm(fixtureTmpDir, { recursive: true, force: true, maxRetries: 10 })
    })

    testMany('Works with many dependencies', [...allBundleConfigs], async (options) => {
      const opts = merge(options, {
        basePath: fixtureTmpDir,
      })

      await zipNode('many-dependencies', { opts, fixtureDir: fixtureTmpDir })
    })

    testMany('Produces deterministic checksums', [...allBundleConfigs, 'bundler_none'], async (options) => {
      const opts = merge(options, {
        basePath: fixtureTmpDir,
      })

      const [checksumOne, checksumTwo] = await Promise.all([getZipChecksum(opts), getZipChecksum(opts)])

      expect(checksumOne).toBe(checksumTwo)
    })
  })

  testMany('Works with many function files', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const names = new Set(['one', 'two', 'three', 'four', 'five', 'six'])
    const { files } = await zipNode('many-functions', {
      opts: options,
      length: 6,
    })

    files.forEach(({ name }) => {
      expect(names.has(name)).toBe(true)
    })
  })

  testMany('Throws when the source folder does not exist', [...allBundleConfigs, 'bundler_none'], async (options) => {
    await expect(zipNode('does-not-exist', { opts: options })).rejects.toThrowError(/Functions folders do not exist/)
  })

  testMany(
    'Works even if destination folder does not exist',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      await zipNode('simple', { opts: options })
    },
  )

  testMany(
    'Do not consider node_modules as a function file',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      await zipNode('ignore-node-modules', { opts: options })
    },
  )

  testMany('Ignore directories without a main file', [...allBundleConfigs, 'bundler_none'], async (options) => {
    await zipNode('ignore-directories', { opts: options })
  })

  testMany('Remove useless files', [...allBundleConfigs], async (options) => {
    const { files } = await zipNode('useless', { opts: options })
    await expect(`${files[0].unzipPath}/Desktop.ini`).not.toPathExist()
  })

  testMany('Works on empty directories', [...allBundleConfigs, 'bundler_none'], async (options) => {
    await zipNode('empty', { opts: options, length: 0 })
  })

  testMany('Works when no package.json is present', [...allBundleConfigs], async (options) => {
    const fixtureDir = await tmpName({ prefix: 'zip-it-test' })
    const opts = merge(options, {
      basePath: fixtureDir,
    })
    await cpy('no-package-json/**', `${fixtureDir}/no-package-json`, {
      cwd: FIXTURES_DIR,
    })
    await zipNode('no-package-json', { opts, fixtureDir })
  })

  testMany('Copies already zipped files', [...allBundleConfigs, 'bundler_none'], async () => {
    const tmpDir = await tmpName({ prefix: 'zip-it-test' })
    const { files } = await zipCheckFunctions('keep-zip', { tmpDir })

    expect(files[0].runtime).toBe('js')

    const fileContents = await readFile(files[0].path, 'utf8')
    expect(fileContents.trim()).toBe('test')
  })

  testMany('Ignore unsupported programming languages', [...allBundleConfigs, 'bundler_none'], async (options) => {
    await zipFixture('unsupported', { length: 0, opts: options })
  })

  testMany('Can reduce parallelism', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const opts = merge(options, { parallelLimit: 1 })

    await zipNode('simple', { opts })
  })

  testMany('Zips node modules', ['bundler_default', 'bundler_nft'], async (options) => {
    await zipNode('node-module', { opts: options })
  })

  testMany('Include most files from node modules', ['bundler_default'], async (options) => {
    const fixtureName = 'node-module-included'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    const { files } = await zipNode('node-module-included', { opts })

    await expect(`${files[0].unzipPath}/node_modules/test/test.map`).not.toPathExist()
    await expect(`${files[0].unzipPath}/node_modules/test/test.html`).toPathExist()
  })

  testMany('Throws on missing critters dependency for Next.js 9', ['bundler_default'], async (options) => {
    await expect(zipNode('node-module-next9-critters', { opts: options })).rejects.toThrowError()
  })

  testMany(
    'Includes specific Next.js dependencies when using next-on-netlify',
    ['bundler_default'],
    async (options) => {
      const { files } = await zipNode('node-module-next-on-netlify', {
        opts: options,
      })

      await expect(`${files[0].unzipPath}/node_modules/next/dist/next-server/lib/constants.js`).toPathExist()
      await expect(`${files[0].unzipPath}/node_modules/next/dist/compiled/semver.js`).toPathExist()
      await expect(`${files[0].unzipPath}/node_modules/next/dist/other.js`).not.toPathExist()
      await expect(`${files[0].unzipPath}/node_modules/next/index.js`).not.toPathExist()
    },
  )

  testMany('Includes all Next.js dependencies when not using next-on-netlify', ['bundler_default'], async (options) => {
    const { files } = await zipNode('node-module-next', { opts: options })

    await expect(`${files[0].unzipPath}/node_modules/next/dist/next-server/lib/constants.js`).toPathExist()
    await expect(`${files[0].unzipPath}/node_modules/next/dist/compiled/semver.js`).toPathExist()
    await expect(`${files[0].unzipPath}/node_modules/next/dist/other.js`).toPathExist()
    await expect(`${files[0].unzipPath}/node_modules/next/index.js`).toPathExist()
  })

  testMany('Inlines node modules in the bundle', ['bundler_esbuild'], async (options) => {
    const { files } = await zipNode('node-module-included-try-catch', {
      opts: options,
    })
    const requires = await getRequires({ filePath: resolve(files[0].unzipPath, 'function.js') })

    expect(requires.includes('test')).toBe(false)
    await expect(`${files[0].unzipPath}/node_modules/test`).not.toPathExist()
  })

  testMany(
    'Does not inline node modules and includes them in a `node_modules` directory if they are defined in `externalNodeModules`',
    ['bundler_esbuild'],
    async (options) => {
      const opts = merge(options, {
        config: {
          function: {
            externalNodeModules: ['test'],
          },
        },
      })
      const { files } = await zipNode('node-module-included-try-catch', {
        opts,
      })
      const requires = await getRequires({ filePath: resolve(files[0].unzipPath, 'function.js') })

      expect(requires.includes('test')).toBe(true)
      await expect(`${files[0].unzipPath}/node_modules/test`).toPathExist()
    },
  )

  testMany(
    'Does not inline node modules and excludes them from the bundle if they are defined in `ignoredNodeModules`',
    ['bundler_esbuild'],
    async (options) => {
      const opts = merge(options, {
        config: {
          function: {
            ignoredNodeModules: ['test'],
          },
        },
      })
      const { files } = await zipNode('node-module-included-try-catch', {
        opts,
      })
      const requires = await getRequires({ filePath: resolve(files[0].unzipPath, 'function.js') })

      expect(requires.includes('test')).toBe(true)
      await expect(`${files[0].unzipPath}/function/node_modules/test`).not.toPathExist()
    },
  )

  testMany(
    'Include most files from node modules present in `externalNodeModules`',
    ['bundler_esbuild'],
    async (options) => {
      const opts = merge(options, {
        config: {
          function: {
            externalNodeModules: ['test'],
          },
        },
      })
      const { files } = await zipNode('node-module-included', {
        opts,
      })

      expect(`${files[0].unzipPath}/node_modules/test/test.map`).not.toPathExist()
      expect(`${files[0].unzipPath}/node_modules/test/test.html`).toPathExist()
    },
  )

  testMany(
    'Does not throw if one of the modules defined in `externalNodeModules` does not exist',
    ['bundler_esbuild'],
    async (options) => {
      const opts = merge(options, {
        config: {
          function: {
            externalNodeModules: ['i-do-not-exist'],
          },
        },
      })
      const { files } = await zipNode('node-module-included-try-catch', {
        opts,
      })

      await expect(`${files[0].unzipPath}/node_modules/i-do-not-exist`).not.toPathExist()
    },
  )

  testMany(
    'Exposes the main export of `node-fetch` when imported using `require()`',
    [...allBundleConfigs],
    async (options) => {
      const { files } = await zipFixture('node-fetch', { opts: options })
      const unzippedFunctions = await unzipFiles(files)
      const returnValue = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)

      expect(returnValue).toBeTypeOf('function')
    },
  )

  testMany(
    '{name}/{name}.js takes precedence over {name}.js and {name}/index.js',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const { files } = await zipFixture('conflicting-names-1', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)
      const returnValue = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
      expect(returnValue).toBe('function-js-file-in-directory')
    },
  )

  testMany(
    '{name}/index.js takes precedence over {name}.js',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const { files } = await zipFixture('conflicting-names-2', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)
      const returnValue = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
      expect(returnValue).toBe('index-js-file-in-directory')
    },
  )

  testMany(
    '{name}/index.js takes precedence over {name}/index.ts',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const { files } = await zipFixture('conflicting-names-3', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)
      const { type } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
      expect(type).toBe('index-js-file-in-directory')
    },
  )

  testMany('{name}.js takes precedence over {name}.ts', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const { files } = await zipFixture('conflicting-names-4', {
      opts: options,
    })
    const unzippedFunctions = await unzipFiles(files)
    const { type } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
    expect(type).toBe('function-js-file')
  })

  testMany('{name}.js takes precedence over {name}.zip', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const { files } = await zipFixture('conflicting-names-5', {
      opts: options,
    })
    const unzippedFunctions = await unzipFiles(files)
    const { type } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
    expect(type).toBe('function-js-file')
  })

  testMany(
    'Handles a TypeScript function ({name}.ts)',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('node-typescript', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)
      const { handler } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
      expect(handler()).toBe('❤️ TypeScript')
    },
  )

  testMany(
    'Handles a TypeScript function ({name}/{name}.ts)',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('node-typescript-directory-1', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)
      const { handler } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
      expect(handler()).toBe('❤️ TypeScript')
    },
  )

  testMany(
    'Handles a TypeScript function ({name}/index.ts)',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('node-typescript-directory-2', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)
      const { handler } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
      expect(handler()).toBe('❤️ TypeScript')
    },
  )

  testMany(
    'Handles a TypeScript function with imports',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('node-typescript-with-imports', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)
      const { handler } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)

      expect(handler()).toBe('❤️ TypeScript')
    },
  )

  testMany(
    'Handles a JavaScript function ({name}.mjs, {name}/{name}.mjs, {name}/index.mjs)',
    ['bundler_esbuild', 'bundler_default'],
    async (options) => {
      const expectedLength = 3
      const { files } = await zipFixture('node-mjs-extension', {
        length: expectedLength,
        opts: options,
      })

      const unzippedFunctions = await unzipFiles(files)

      for (let index = 0; index < expectedLength; index++) {
        const funcFile = `${unzippedFunctions[index].unzipPath}/func${index + 1}.js`
        const { handler: handler1 } = await importFunctionFile(funcFile)

        expect(handler1()).toBe(true)
        expect(files[index].bundler).toBe('esbuild')

        // Asserting that we're transpiling these files to CJS.
        expect(await detectEsModule({ mainFile: funcFile })).toBe(false)
      }
    },
  )

  testMany(
    'Handles a JavaScript function ({name}.mts, {name}/{name}.mts, {name}/index.mts)',
    ['bundler_esbuild', 'bundler_default'],
    async (options) => {
      const { files } = await zipFixture('node-mts-extension', {
        length: 3,
        opts: options,
      })

      const unzippedFunctions = await unzipFiles(files)

      files.forEach((file) => {
        expect(file.bundler).toBe('esbuild')
      })

      const { handler: handler1 } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/func1.js`)
      expect(handler1()).toBe(true)
      const { handler: handler2 } = await importFunctionFile(`${unzippedFunctions[1].unzipPath}/func2.js`)
      expect(handler2()).toBe(true)
      const { handler: handler3 } = await importFunctionFile(`${unzippedFunctions[2].unzipPath}/func3.js`)
      expect(handler3()).toBe(true)
    },
  )

  testMany(
    'Handles a JavaScript function ({name}.cts, {name}/{name}.cts, {name}/index.cts)',
    ['bundler_esbuild', 'bundler_default'],
    async (options) => {
      const { files } = await zipFixture('node-cts-extension', {
        length: 3,
        opts: options,
      })

      const unzippedFunctions = await unzipFiles(files)

      files.forEach((file) => {
        expect(file.bundler).toBe('esbuild')
      })

      const { handler: handler1 } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/func1.js`)
      expect(handler1()).toBe(true)
      const { handler: handler2 } = await importFunctionFile(`${unzippedFunctions[1].unzipPath}/func2.js`)
      expect(handler2()).toBe(true)
      const { handler: handler3 } = await importFunctionFile(`${unzippedFunctions[2].unzipPath}/func3.js`)
      expect(handler3()).toBe(true)
    },
  )

  testMany(
    'Handles a JavaScript function ({name}.cjs, {name}/{name}.cjs, {name}/index.cjs)',
    ['bundler_esbuild'],
    async (options) => {
      const { files } = await zipFixture('node-cjs-extension', {
        length: 3,
        opts: options,
      })

      const unzippedFunctions = await unzipFiles(files)

      files.forEach((file) => {
        expect(file.bundler).toBe(getBundlerNameFromOptions(options) ?? 'zisi')
      })

      const { handler: handler1 } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/func1.js`)
      expect(handler1()).toBe(true)
      const { handler: handler2 } = await importFunctionFile(`${unzippedFunctions[1].unzipPath}/func2.js`)
      expect(handler2()).toBe(true)
      const { handler: handler3 } = await importFunctionFile(`${unzippedFunctions[2].unzipPath}/func3.js`)
      expect(handler3()).toBe(true)
    },
  )

  // TODO can be merged with the above once the FF is on `zisi_output_cjs_extension`
  testMany(
    'Handles a JavaScript function ({name}.cjs, {name}/{name}.cjs, {name}/index.cjs)',
    ['bundler_default'],
    async (options) => {
      const { files } = await zipFixture('node-cjs-extension', {
        length: 3,
        opts: options,
      })

      const unzippedFunctions = await unzipFiles(files)

      files.forEach((file) => {
        expect(file.bundler).toBe(getBundlerNameFromOptions(options) ?? 'zisi')
      })

      const { handler: handler1 } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/func1.cjs`)
      expect(handler1()).toBe(true)
      const { handler: handler2 } = await importFunctionFile(`${unzippedFunctions[1].unzipPath}/func2.cjs`)
      expect(handler2()).toBe(true)
      const { handler: handler3 } = await importFunctionFile(`${unzippedFunctions[2].unzipPath}/func3.js`)
      expect(handler3()).toBe(true)
    },
  )

  testMany(
    'Loads a tsconfig.json placed in the same directory as the function',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('node-typescript-tsconfig-sibling', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)
      const { value } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
      expect(value).toBe(true)
    },
  )

  testMany(
    'Loads a tsconfig.json placed in a parent directory',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('node-typescript-tsconfig-parent/functions', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)
      const { value } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)
      expect(value).toBe(true)
    },
  )

  testMany(
    'Respects the target defined in the config over a `target` property defined in tsconfig',
    ['bundler_esbuild', 'bundler_default', 'todo:bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('node-typescript-tsconfig-target/functions', {
        opts: options,
      })
      const unzippedFunctions = await unzipFiles(files)

      const result = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)

      // We want to assert that the `target` specified in the tsconfig file (es5)
      // was overridden by our own target. It's not easy to assert that without
      // parsing the generated file, and evem then we're subject to failures due
      // to internal changes in esbuild. The best we can do here is assert that
      // the bundling was successful and the return values are what we expect,
      // because the bundling should fail if the ES5 target is being used, since
      // esbuild can't currently transpile object destructuring down to ES5.
      expect(result.foo).toBe(true)
      expect(result.bar).toBe(false)
      expect(result.others).toEqual({ baz: true })
    },
  )

  test('Limits the amount of log lines produced by esbuild', async () => {
    const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
    const fixturePath = join(FIXTURES_DIR, 'esbuild-log-limit')

    try {
      await execa('node', [BINARY_PATH, fixturePath, tmpDir, `--config.*.nodeBundler=esbuild`])

      expect.fail('Bundling should have thrown')
    } catch (error) {
      const logCount = (error.stderr.match(/require\('module-\d+'\)/g) || []).length

      expect(logCount).toBeLessThanOrEqual(ESBUILD_LOG_LIMIT)
      expect(error.stderr).toMatch(`${ESBUILD_LOG_LIMIT} of 13 errors shown`)
    }
  })

  // We're not running this test for the `DEFAULT` bundler — not because it's not
  // supported, but because the legacy bundler doesn't use any of the available
  // configuration properties and therefore there is nothing we could test.
  testMany(
    'Applies the configuration parameters supplied in the `config` property and returns the config in the response',
    ['bundler_esbuild', 'todo:bundler_nft'],
    async (options) => {
      const opts = merge(options, {
        config: {
          '*': {
            externalNodeModules: ['test-1'],
          },

          function_one: {
            externalNodeModules: ['test-3'],
          },

          'function_*': {
            externalNodeModules: ['test-2'],
          },
        },
      })
      const { files } = await zipNode('config-apply-1', { length: 3, opts })

      const anotherFunc = files.find(({ name }) => name === 'another_function')!
      const func2 = files.find(({ name }) => name === 'function_two')!
      const func1 = files.find(({ name }) => name === 'function_one')!

      expect(anotherFunc).toBeDefined()
      expect(func2).toBeDefined()
      expect(func1).toBeDefined()

      const requires = await Promise.all([
        getRequires({ filePath: resolve(anotherFunc.unzipPath, 'another_function.js') }),
        getRequires({ filePath: resolve(func2.unzipPath, 'function_two.js') }),
        getRequires({ filePath: resolve(func1.unzipPath, 'function_one.js') }),
      ])

      expect(requires[0]).toEqual(['test-1'])
      expect(requires[1]).toEqual(['test-1', 'test-2'])
      expect(requires[2]).toEqual(['test-1', 'test-2', 'test-3'])

      expect(anotherFunc.config).toEqual({ externalNodeModules: ['test-1'], nodeBundler: 'esbuild' })
      expect(func2.config).toEqual({ externalNodeModules: ['test-1', 'test-2'], nodeBundler: 'esbuild' })
      expect(func1.config).toEqual({
        externalNodeModules: ['test-1', 'test-2', 'test-3'],
        nodeBundler: 'esbuild',
      })
    },
  )

  testMany(
    'Ignores `undefined` values when computing the configuration object for a function',
    ['bundler_esbuild'],
    async (options) => {
      const externalNodeModules = ['test-1', 'test-2', 'test-3']
      const opts = merge(options, {
        config: {
          '*': {
            externalNodeModules,
          },

          function_one: {
            externalNodeModules: undefined,
            nodeBundler: undefined,
          },
        },
      })
      const { files } = await zipNode('config-apply-1', { length: 3, opts })

      const anotherFunc = files.find(({ name }) => name === 'another_function')!
      const func2 = files.find(({ name }) => name === 'function_two')!
      const func1 = files.find(({ name }) => name === 'function_one')!

      expect(anotherFunc).toBeDefined()
      expect(func2).toBeDefined()
      expect(func1).toBeDefined()

      const requires = await Promise.all([
        getRequires({ filePath: resolve(anotherFunc.unzipPath, 'another_function.js') }),
        getRequires({ filePath: resolve(func2.unzipPath, 'function_two.js') }),
        getRequires({ filePath: resolve(func1.unzipPath, 'function_one.js') }),
      ])

      expect(requires[0]).toEqual(externalNodeModules)
      expect(requires[1]).toEqual(externalNodeModules)
      expect(requires[2]).toEqual(externalNodeModules)

      expect(anotherFunc.config).toEqual({ externalNodeModules, nodeBundler: 'esbuild' })
      expect(func2.config).toEqual({ externalNodeModules, nodeBundler: 'esbuild' })
      expect(func1.config).toEqual({ externalNodeModules, nodeBundler: 'esbuild' })
    },
  )

  testMany('Generates a directory if `archiveFormat` is set to `none`', [...allBundleConfigs], async (options) => {
    const opts = merge(options, {
      archiveFormat: ARCHIVE_FORMAT.NONE,
    })
    const { files } = await zipNode('node-module-included', {
      opts,
    })

    const functionEntry = await importFunctionFile(`${files[0].path}/function.js`)

    expect(functionEntry).toBe(true)
  })

  testMany(
    'Includes in the bundle any paths matched by a `included_files` glob',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const fixtureName = 'included_files'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            includedFiles: ['content/*', '!content/post3.md', 'something.md'],
          },
        },
      })
      const { files } = await zipNode(`${fixtureName}/netlify/functions`, {
        opts,
      })

      const func = await importFunctionFile(`${files[0].unzipPath}/func1.js`)

      const { body: body1 } = await func.handler({ queryStringParameters: { name: 'post1' } })
      const { body: body2 } = await func.handler({ queryStringParameters: { name: 'post2' } })
      const { body: body3 } = await func.handler({ queryStringParameters: { name: 'post3' } })

      expect(body1.includes('Hello from the other side')).toBe(true)
      expect(body2.includes("I must've called a thousand times")).toBe(true)
      expect(body3.includes('Uh-oh')).toBe(true)

      await expect(`${files[0].unzipPath}/content/post1.md`).toPathExist()
      await expect(`${files[0].unzipPath}/content/post2.md`).toPathExist()
      await expect(`${files[0].unzipPath}/content/post3.md`).not.toPathExist()
      await expect(`${files[0].unzipPath}/something.md`).toPathExist()
    },
  )

  testMany('Returns an `inputs` property with all the imported paths', [...allBundleConfigs], async (opts) => {
    const fixtureName = 'node-module-and-local-imports'
    const { files } = await zipNode(fixtureName, { opts })

    expect(files[0].inputs?.includes(join(FIXTURES_DIR, fixtureName, 'function.js'))).toBe(true)
    expect(files[0].inputs?.includes(join(FIXTURES_DIR, fixtureName, 'lib', 'file1.js'))).toBe(true)
    expect(files[0].inputs?.includes(join(FIXTURES_DIR, fixtureName, 'lib2', 'file2.js'))).toBe(true)
    expect(files[0].inputs?.includes(join(FIXTURES_DIR, fixtureName, 'node_modules', 'test', 'index.js'))).toBe(true)
    expect(files[0].inputs?.includes(join(FIXTURES_DIR, fixtureName, 'node_modules', 'test-child', 'index.js'))).toBe(
      true,
    )

    expect(files[0].inputs?.includes(join(FIXTURES_DIR, fixtureName, 'lib2', 'unused_file.js'))).toBe(false)

    // Tree-shaking of node modules only happens with esbuild.
    if (files[0].bundler === 'esbuild') {
      expect(files[0].inputs?.includes(join(FIXTURES_DIR, fixtureName, 'node_modules', 'test', 'unused_file.js'))).toBe(
        false,
      )
      expect(
        files[0].inputs?.includes(join(FIXTURES_DIR, fixtureName, 'node_modules', 'test-child', 'unused_file.js')),
      ).toBe(false)
    }

    const functionEntry = await importFunctionFile(`${files[0].unzipPath}/function.js`)

    expect(functionEntry).toBe(true)
  })

  testMany(
    'Places all user-defined files at the root of the target directory',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const fixtureName = 'base_path'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            includedFiles: ['content/*'],
          },
        },
      })
      const { files } = await zipNode(`${fixtureName}/netlify/functions1`, {
        opts,
      })

      const function1Entry = await importFunctionFile(`${files[0].unzipPath}/func1.js`)

      // The function should not be on a `src/` namespace.
      expect(unixify(function1Entry[0]).includes('/src/')).toBe(false)
      await expect(`${files[0].unzipPath}/src/func1.js`).not.toPathExist()
      await expect(`${files[0].unzipPath}/content/post1.md`).toPathExist()
      await expect(`${files[0].unzipPath}/content/post2.md`).toPathExist()
      await expect(`${files[0].unzipPath}/content/post3.md`).toPathExist()
      await expect(`${files[0].unzipPath}/src/content/post1.md`).not.toPathExist()
      await expect(`${files[0].unzipPath}/src/content/post2.md`).not.toPathExist()
      await expect(`${files[0].unzipPath}/src/content/post3.md`).not.toPathExist()
    },
  )

  testMany(
    'Places all user-defined files in a `src/` sub-directory if there is a naming conflict with the entry file',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const fixtureName = 'base_path'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            includedFiles: ['content/*', 'func2.js'],
          },
        },
      })
      const { files } = await zipNode(`${fixtureName}/netlify/functions2`, {
        opts,
      })

      const function2Entry = await importFunctionFile(`${files[0].unzipPath}/func2.js`)

      // The function should be on a `src/` namespace because there's a conflict
      // with the /func2.js path present in `includedFiles`.
      expect(unixify(function2Entry[0]).includes('/src/')).toBe(true)
      await expect(`${files[0].unzipPath}/src/func2.js`).toPathExist()
      await expect(`${files[0].unzipPath}/content/post1.md`).not.toPathExist()
      await expect(`${files[0].unzipPath}/content/post2.md`).not.toPathExist()
      await expect(`${files[0].unzipPath}/content/post3.md`).not.toPathExist()
      await expect(`${files[0].unzipPath}/src/content/post1.md`).toPathExist()
      await expect(`${files[0].unzipPath}/src/content/post2.md`).toPathExist()
      await expect(`${files[0].unzipPath}/src/content/post3.md`).toPathExist()
    },
  )

  testMany(
    'Generates a entry file if no entry file needed but naming conflict occurs',
    ['bundler_default', 'bundler_nft'],
    async (options) => {
      const fixtureName = 'naming_conflict'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
      })
      const { files } = await zipNode(fixtureName, { opts })

      const function2Entry = await importFunctionFile(`${files[0].unzipPath}/func1.js`)

      expect(await function2Entry.handler()).toBe(true)

      await expect(`${files[0].unzipPath}/src/func1.js`).toPathExist()
      await expect(`${files[0].unzipPath}/src/func1.mjs`).toPathExist()
    },
  )

  testMany(
    'Bundles functions from multiple directories when the first argument of `zipFunctions()` is an array',
    ['bundler_esbuild', 'bundler_default', 'bundler_nft'],
    async (options) => {
      const fixtureName = 'multiple-src-directories'
      const pathInternal = `${fixtureName}/.netlify/internal-functions`
      const pathUser = `${fixtureName}/netlify/functions`
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
      })
      const { files } = await zipNode([pathInternal, pathUser], {
        length: 3,
        opts,
      })

      const functionCommonEntry = files.find(({ name }) => name === 'function')!
      const functionInternalEntry = files.find(({ name }) => name === 'function_internal')!
      const functionUserEntry = files.find(({ name }) => name === 'function_user')!

      expect(functionCommonEntry).toBeDefined()
      expect(functionInternalEntry).toBeDefined()
      expect(functionUserEntry).toBeDefined()

      const functionCommon = await importFunctionFile(`${functionCommonEntry.unzipPath}/function.js`)
      const functionInternal = await importFunctionFile(`${functionInternalEntry.unzipPath}/function_internal.js`)
      const functionUser = await importFunctionFile(`${functionUserEntry.unzipPath}/function_user.js`)

      // Functions from rightmost directories in the array take precedence.
      expect(functionCommon).toBe('user')
      expect(functionInternal).toBe('internal')
      expect(functionUser).toBe('user')

      expect(dirname(functionCommonEntry.mainFile)).toBe(resolve(join(FIXTURES_DIR, pathUser)))
      expect(dirname(functionInternalEntry.mainFile)).toBe(resolve(join(FIXTURES_DIR, pathInternal)))
      expect(dirname(functionUserEntry.mainFile)).toBe(resolve(join(FIXTURES_DIR, pathUser)))
    },
  )

  test('Throws an error if the `archiveFormat` property contains an invalid value`', async () => {
    await expect(
      zipNode('node-module-included', {
        // @ts-expect-error test
        opts: { archiveFormat: 'gzip' },
      }),
    ).rejects.toThrowError('Invalid archive format: gzip')
  })

  testMany(
    'Adds `type: "functionsBundling"` to user errors when parsing with esbuild or zisi',
    ['bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default'],
    async (options) => {
      const bundler = getBundlerNameFromOptions(options)

      try {
        // using zipFixture, because we only want to assert errors from bundling and not when importing the bundled functions
        await zipFixture('node-syntax-error-cjs', {
          opts: options,
        })

        expect.fail('Bundling should have thrown')
      } catch (error) {
        const { customErrorInfo } = error

        expect(customErrorInfo.type).toBe('functionsBundling')
        expect(customErrorInfo.location.bundler).toBe(bundler?.startsWith('esbuild') ? 'esbuild' : 'zisi')
        expect(customErrorInfo.location.functionName).toBe('function')
        expect(customErrorInfo.location.runtime).toBe('js')
      }
    },
  )

  test('Adds `type: "functionsBundling"` to user errors when transpiling esm in nft bundler', async () => {
    try {
      await zipNode('node-esm-top-level-await-error', {
        opts: { config: { '*': { nodeBundler: NODE_BUNDLER.NFT } } },
      })

      expect.fail('Bundling should have thrown')
    } catch (error) {
      const { customErrorInfo } = error

      expect(customErrorInfo.type).toBe('functionsBundling')
      expect(customErrorInfo.location.bundler).toBe('nft')
      expect(customErrorInfo.location.functionName).toBe('function')
      expect(customErrorInfo.location.runtime).toBe('js')
    }
  })

  test('Bundles dynamic imports', async () => {
    const fixtureName = 'node-module-dynamic-import'
    await zipNode(fixtureName, {
      opts: { basePath: join(FIXTURES_DIR, fixtureName), config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } } },
    })
  })

  test('Bundles dynamic imports with template literals', async () => {
    const fixtureName = 'node-module-dynamic-import-template-literal'
    const { files } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${files[0].unzipPath}/function.js`)
    const values = func('one')
    const expectedLength = 5

    // eslint-disable-next-line unicorn/new-for-builtins
    expect(values).toEqual(Array(expectedLength).fill(true))
    expect(() => func('two')).toThrowError()
  })

  test('Leaves dynamic imports untouched when the files required to resolve the expression cannot be packaged at build time', async () => {
    const fixtureName = 'node-module-dynamic-import-unresolvable'
    const { files } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } },
      },
    })
    const functionSource = await readFile(`${files[0].unzipPath}/function.js`, 'utf8')

    expect(functionSource).toMatch('const require1 = require(number)')
    // eslint-disable-next-line no-template-curly-in-string
    expect(functionSource).toMatch('const require2 = require(`${number}.json`);')
    expect(functionSource).toMatch('const require3 = require(foo(number));')
  })

  test('Bundles dynamic imports with the `+` operator', async () => {
    const fixtureName = 'node-module-dynamic-import-2'
    const { files } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${files[0].unzipPath}/function.js`)

    expect(func('en')[0]).toEqual(['yes', 'no'])
    expect(func('en')[1]).toEqual(['yes', 'no'])
    expect(func('pt')[0]).toEqual(['sim', 'não'])
    expect(func('pt')[1]).toEqual(['sim', 'não'])
    expect(() => func('fr')).toThrowError()
  })

  test('Bundles dynamic imports with nested directories', async () => {
    const fixtureName = 'node-module-dynamic-import-4'
    const { files } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${files[0].unzipPath}/function.js`)

    expect(func('en')[0]).toEqual(['yes', 'no'])
    expect(func('en')[1]).toEqual(['yes', 'no'])
    expect(func('pt')[0]).toEqual(['sim', 'não'])
    expect(func('pt')[1]).toEqual(['sim', 'não'])
    expect(func('nested/es')[0]).toEqual(['sí', 'no'])
    expect(func('nested/es')[1]).toEqual(['sí', 'no'])
    expect(() => func('fr')).toThrowError()
  })

  test('Bundles dynamic imports with nested directories when using `archiveFormat: "none"`', async () => {
    const fixtureName = 'node-module-dynamic-import-4'
    const { tmpDir } = await zipNode(fixtureName, {
      opts: {
        archiveFormat: ARCHIVE_FORMAT.NONE,
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${tmpDir}/function/function.js`)

    expect(func('en')[0]).toEqual(['yes', 'no'])
    expect(func('en')[1]).toEqual(['yes', 'no'])
    expect(func('pt')[0]).toEqual(['sim', 'não'])
    expect(func('pt')[1]).toEqual(['sim', 'não'])
    expect(func('nested/es')[0]).toEqual(['sí', 'no'])
    expect(func('nested/es')[1]).toEqual(['sí', 'no'])
    expect(() => func('fr')).toThrowError()
  })

  test('Negated files in `included_files` are excluded from the bundle even if they match a dynamic import expression', async () => {
    const fixtureName = 'node-module-dynamic-import-2'
    const { files } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { includedFiles: ['!lang/en.*'], nodeBundler: NODE_BUNDLER.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${files[0].unzipPath}/function.js`)

    expect(func('pt')[0]).toEqual(['sim', 'não'])
    expect(func('pt')[1]).toEqual(['sim', 'não'])
    expect(() => func('en')).toThrowError()
  })

  test('included_files` with multiple glob stars are correctly resolved before passing to esbuild', async () => {
    const fixtureName = 'node-module-dynamic-import-2'

    const { files } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { includedFiles: ['!**/en.*'], nodeBundler: NODE_BUNDLER.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${files[0].unzipPath}/function.js`)

    expect(() => func('en')).toThrowError()
  })

  test('included_files` with node_modules pattern is correctly transformed into module name', async () => {
    const fixtureName = 'node-module-dynamic-import'

    await expect(
      zipNode(fixtureName, {
        opts: {
          basePath: join(FIXTURES_DIR, fixtureName),
          config: { '*': { includedFiles: ['!node_modules/@org/*'], nodeBundler: NODE_BUNDLER.ESBUILD } },
        },
      }),
    ).rejects.toThrowError("Cannot find module '@org/test'")
  })

  testMany(
    'Negated files in `included_files` are excluded from the bundle even if they match Node modules required in a function',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const fixtureName = 'node-module-included-try-catch'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            externalNodeModules: ['test'],
            includedFiles: ['!node_modules/test/**'],
          },
        },
      })
      const { files } = await zipNode(fixtureName, { opts })

      await expect(`${files[0].unzipPath}/function.js`).toPathExist()
      await expect(`${files[0].unzipPath}/node_modules/test/index.js`).not.toPathExist()
    },
  )

  test('Creates dynamic import shims for functions with the same name and same shim contents with no naming conflicts', async () => {
    const FUNCTION_COUNT = 30
    const fixtureName = 'node-module-dynamic-import-3'

    const { files } = await zipNode(fixtureName, {
      length: FUNCTION_COUNT,
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } },
      },
    })

    for (let ind = 0; ind < FUNCTION_COUNT; ind++) {
      const func = await importFunctionFile(`${files[ind].unzipPath}/${files[ind].name}.js`)

      expect(func('en')[0]).toEqual(['yes', 'no'])
      expect(func('en')[1]).toEqual(['yes', 'no'])
      expect(func('pt')[0]).toEqual(['sim', 'não'])
      expect(func('pt')[1]).toEqual(['sim', 'não'])
      expect(() => func('fr')).toThrowError()
    }
  })

  test('Uses the default Node bundler if no configuration object is supplied', async () => {
    const { files } = await zipNode('local-node-module')
    const requires = await getRequires({ filePath: resolve(files[0].unzipPath, 'function.js') })

    expect(requires).toEqual(['test'])
    expect(files[0].bundler).toBe('zisi')
    expect(files[0].config).toEqual({})
  })

  test('Zips Rust function files', async () => {
    const { files } = await zipFixture('rust-simple')

    expect(files.every(({ runtime }) => runtime === 'rs')).toBe(true)

    const unzippedFunctions = await unzipFiles(files)

    const unzippedFile = `${unzippedFunctions[0].unzipPath}/bootstrap`
    await expect(unzippedFile).toPathExist()

    const tcFile = `${unzippedFunctions[0].unzipPath}/netlify-toolchain`
    await expect(tcFile).toPathExist()
    const tc = await readFile(tcFile, 'utf8')
    expect(tc.trim()).toBe('{"runtime":"rs"}')
  })

  test('Does not zip Go function binaries by default', async () => {
    const { files } = await zipFixture('go-simple')

    expect(files[0].runtime).toBe('go')
    expect(files[0].path).not.toMatch(/\.zip$/)
    await expect(files[0].path).toPathExist()
  })

  test('Zips Go function binaries if the `zipGo` config property is set', async () => {
    const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
    const manifestPath = join(tmpDir, 'manifest.json')

    const fixtureName = 'go-simple'
    const { files } = await zipFixture(fixtureName, {
      opts: {
        manifest: manifestPath,
        config: {
          '*': {
            zipGo: true,
          },
        },
      },
    })
    const binaryPath = join(FIXTURES_DIR, fixtureName, 'test')
    await expect(binaryPath).toPathExist()
    const binarySha = await computeSha1(binaryPath)
    const [func] = files

    expect(func.runtime).toBe('go')
    expect(func.path.endsWith('.zip')).toBe(true)

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

    expect(manifest.functions[0].runtimeVersion).toBeUndefined()

    const unzippedFunctions = await unzipFiles([func])
    const unzippedBinaryPath = join(unzippedFunctions[0].unzipPath, 'bootstrap')

    await expect(unzippedBinaryPath).toPathExist()

    const unzippedBinarySha = await computeSha1(unzippedBinaryPath)

    expect(binarySha).toBe(unzippedBinarySha)
  })

  test('Zips Go functions built from source if the `zipGo` config property is set', async () => {
    const mockSource = Math.random().toString()
    vi.mocked(shellUtils.runCommand).mockImplementationOnce(async (...args) => {
      await writeFile(args[1][2], mockSource)

      return {} as any
    })

    const { path: manifestTmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
    const manifestPath = join(manifestTmpDir, 'manifest.json')

    const fixtureName = 'go-source'
    const { files, tmpDir } = await zipFixture(fixtureName, {
      opts: {
        manifest: manifestPath,
        config: {
          '*': {
            zipGo: true,
          },
        },
      },
    })
    const [func] = files

    expect(func.runtime).toBe('go')
    expect(func.path.endsWith('.zip')).toBe(true)

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

    expect(manifest.functions[0].runtimeVersion).toBeUndefined()

    // remove the binary before unzipping
    await rm(join(tmpDir, 'go-func-1'), { maxRetries: 10 })

    const unzippedFunctions = await unzipFiles([func])

    const unzippedBinaryPath = join(unzippedFunctions[0].unzipPath, 'bootstrap')
    const unzippedBinaryContents = await readFile(unzippedBinaryPath, 'utf8')

    expect(mockSource).toBe(unzippedBinaryContents)
  })

  test('Builds Go functions from an internal functions dir with configured fields', async () => {
    vi.mocked(shellUtils.runCommand).mockImplementation(async (...args) => {
      await writeFile(args[1][2], '')

      return {} as any
    })

    const fixtureName = join('go-internal', '.netlify/internal-functions')
    const { files } = await zipFixture(fixtureName, {
      length: 2,
      opts: {
        internalSrcFolder: join(FIXTURES_DIR, fixtureName),
        config: {
          'go-func-1': {
            name: 'Go Function One',
            generator: '@netlify/mock-plugin@1.0.0',
          },
        },
      },
    })

    expect(files[0].displayName).toBe('Go Function One')
    expect(files[0].generator).toBe('@netlify/mock-plugin@1.0.0')
    expect(files[1].displayName).toBeUndefined()
    expect(files[1].generator).toBe('internalFunc')
  })

  test('Builds Go functions from source', async () => {
    vi.mocked(shellUtils.runCommand).mockImplementation(async (...args) => {
      await writeFile(args[1][2], '')

      return {} as any
    })

    const fixtureName = 'go-source-multiple'
    const { files } = await zipFixture(fixtureName, {
      length: 2,
    })

    expect(files).toEqual([
      {
        config: expect.anything(),
        mainFile: join(FIXTURES_DIR, fixtureName, 'go-func-1', 'main.go'),
        name: 'go-func-1',
        path: expect.anything(),
        entryFilename: '',
        runtime: 'go',
      },
      {
        config: expect.anything(),
        mainFile: join(FIXTURES_DIR, fixtureName, 'go-func-2', 'go-func-2.go'),
        name: 'go-func-2',
        path: expect.anything(),
        entryFilename: '',
        runtime: 'go',
      },
    ])

    expect(shellUtils.runCommand).toHaveBeenCalledTimes(2)

    expect(shellUtils.runCommand).toHaveBeenNthCalledWith(
      1,
      'go',
      ['build', '-o', expect.stringMatching(/(\/|\\)go-func-1$/), '-ldflags', '-s -w', '-tags', 'lambda.norpc'],
      expect.objectContaining({
        env: expect.objectContaining({ CGO_ENABLED: '0', GOOS: 'linux' }),
      }),
    )

    expect(shellUtils.runCommand).toHaveBeenNthCalledWith(
      2,
      'go',
      ['build', '-o', expect.stringMatching(/(\/|\\)go-func-2$/), '-ldflags', '-s -w', '-tags', 'lambda.norpc'],
      expect.objectContaining({
        env: expect.objectContaining({ CGO_ENABLED: '0', GOOS: 'linux' }),
      }),
    )
  })

  test('Adds `type: "functionsBundling"` to errors resulting from compiling Go binaries', async () => {
    vi.mocked(shellUtils.runCommand).mockImplementation(() => {
      throw new Error('Fake error')
    })

    try {
      await zipFixture('go-source')

      expect.fail('Expected catch block')
    } catch (error) {
      expect(error.customErrorInfo).toEqual({
        type: 'functionsBundling',
        location: { functionName: 'go-func-1', runtime: 'go' },
      })
    }
  })

  test('Does not build Rust functions from source if the `buildRustSource` feature flag is not enabled', async () => {
    await zipFixture('rust-source-multiple', { length: 0 })

    expect(shellUtils.runCommand).not.toHaveBeenCalled()
  })

  test('Builds Rust functions from source if the `buildRustSource` feature flag is enabled', async () => {
    const targetDirectory = await tmpName({ prefix: `zip-it-test-rust-function-[name]` })
    const tmpDirectory = await tmpName({ prefix: `zip-it-test` })

    vi.mocked(shellUtils.runCommand).mockImplementation(async (...args) => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      const [rootCommand, , { cwd = undefined, env: environment = undefined } = {}] = args

      if (rootCommand === 'cargo') {
        const directory = join(environment.CARGO_TARGET_DIR, args[1][2], 'release')
        const binaryPath = join(directory, 'hello')

        if (cwd.endsWith('rust-func-1')) {
          expect(dirname(environment.CARGO_TARGET_DIR)).toBe(dirname(tmpDirectory))
        }

        if (cwd.endsWith('rust-func-2')) {
          expect(environment.CARGO_TARGET_DIR).toBe(targetDirectory.replace('[name]', 'rust-func-2'))
        }

        await mkdir(directory, { recursive: true })
        await writeFile(binaryPath, '')

        return {} as any
      }
    })

    const fixtureName = 'rust-source-multiple'
    const { files } = await zipFixture(fixtureName, {
      length: 2,
      opts: {
        config: {
          'rust-func-2': {
            rustTargetDirectory: targetDirectory,
          },
        },
        featureFlags: {
          buildRustSource: true,
        },
      },
    })

    expect(files).toEqual([
      {
        config: expect.anything(),
        mainFile: join(FIXTURES_DIR, fixtureName, 'rust-func-1', 'src', 'main.rs'),
        name: 'rust-func-1',
        path: expect.anything(),
        entryFilename: '',
        runtime: 'rs',
        size: 278,
      },
      {
        config: expect.anything(),
        mainFile: join(FIXTURES_DIR, fixtureName, 'rust-func-2', 'src', 'main.rs'),
        name: 'rust-func-2',
        path: expect.anything(),
        entryFilename: '',
        runtime: 'rs',
        size: 278,
      },
    ])

    expect(shellUtils.runCommand).toHaveBeenCalledTimes(4)

    expect(shellUtils.runCommand).toHaveBeenNthCalledWith(1, 'rustup', ['default', 'stable'])
    expect(shellUtils.runCommand).toHaveBeenNthCalledWith(2, 'rustup', ['target', 'add', 'x86_64-unknown-linux-musl'])
    expect(shellUtils.runCommand).toHaveBeenNthCalledWith(
      3,
      'cargo',
      ['build', '--target', 'x86_64-unknown-linux-musl', '--release'],
      expect.anything(),
    )
    expect(shellUtils.runCommand).toHaveBeenNthCalledWith(
      4,
      'cargo',
      ['build', '--target', 'x86_64-unknown-linux-musl', '--release'],
      expect.anything(),
    )
  })

  test('Builds Rust functions from an internal functions dir with a configured name', async () => {
    vi.mocked(shellUtils.runCommand).mockImplementation(async (...args) => {
      const [rootCommand, , { env: environment }] = args

      if (rootCommand === 'cargo') {
        const directory = join(environment.CARGO_TARGET_DIR, args[1][2], 'release')
        const binaryPath = join(directory, 'hello')

        await mkdir(directory, { recursive: true })
        await writeFile(binaryPath, '')

        return {} as any
      }
    })

    const fixtureName = join('rust-internal', '.netlify/internal-functions')
    const { files } = await zipFixture(fixtureName, {
      length: 2,
      opts: {
        internalSrcFolder: join(FIXTURES_DIR, fixtureName),
        config: {
          'rust-func-1': {
            name: 'Rust Function Two',
            generator: '@netlify/mock-plugin@1.0.0',
          },
        },
        featureFlags: {
          buildRustSource: true,
        },
      },
    })

    expect(files[0].displayName).toBe('Rust Function Two')
    expect(files[0].generator).toBe('@netlify/mock-plugin@1.0.0')
    expect(files[1].displayName).toBeUndefined()
    expect(files[1].generator).toBe('internalFunc')
  })

  test('Adds `type: "functionsBundling"` to errors resulting from compiling Rust binaries', async () => {
    vi.mocked(shellUtils.runCommand).mockImplementation((...args) => {
      if (args[0] === 'cargo') {
        throw new Error('Fake error')
      }

      return {} as any
    })

    try {
      await zipFixture('rust-source', {
        opts: {
          featureFlags: {
            buildRustSource: true,
          },
        },
      })

      expect.fail('Expected catch block')
    } catch (error) {
      expect(error.customErrorInfo).toEqual({
        type: 'functionsBundling',
        location: { functionName: 'rust-func-1', runtime: 'rs' },
      })
    }
  })

  test('Throws an error with an informative message when the Rust toolchain is missing', async () => {
    vi.mocked(shellUtils.runCommand).mockImplementation(() => {
      throw new Error('Fake error')
    })

    try {
      await zipFixture('rust-source', {
        opts: {
          featureFlags: {
            buildRustSource: true,
          },
        },
      })

      expect.fail('Expected catch block')
    } catch (error) {
      expect(error.message.startsWith('There is no Rust toolchain installed')).toBe(true)
      expect(error.customErrorInfo).toEqual({
        type: 'functionsBundling',
        location: { functionName: 'rust-func-1', runtime: 'rs' },
      })
    }
  })

  test('Does not generate a sourcemap unless `nodeSourcemap` is set', async () => {
    const { files } = await zipNode('node-module-and-local-imports', {
      opts: { config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } } },
    })

    await expect(`${files[0].unzipPath}/function.js.map`).not.toPathExist()

    const functionSource = await readFile(`${files[0].unzipPath}/function.js`, 'utf8')

    expect(functionSource).not.toMatch('sourceMappingURL')
  })

  test.skipIf(platform === 'win32')('Generates a sourcemap if `nodeSourcemap` is set', async () => {
    const { files } = await zipNode('node-module-and-local-imports', {
      opts: { config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD, nodeSourcemap: true } } },
    })
    const sourcemap = await readFile(`${files[0].unzipPath}/function.js.map`, 'utf8')
    const { sourceRoot, sources } = JSON.parse(sourcemap)

    await Promise.all(
      sources.map(async (source) => {
        const absolutePath = resolve(sourceRoot, source)

        await expect(absolutePath).toPathExist()
      }),
    )
  })

  test('Creates a manifest file with the list of created functions if the `manifest` property is supplied', async () => {
    const FUNCTIONS_COUNT = 6
    const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
    const manifestPath = join(tmpDir, 'manifest.json')
    const { files } = await zipNode('many-functions', {
      length: FUNCTIONS_COUNT,
      opts: {
        manifest: manifestPath,
        config: {
          five: {
            schedule: '@daily',
          },
        },
      },
    })

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

    expect(manifest.version).toBe(1)
    expect(manifest.system.arch).toBe(arch)
    expect(manifest.system.platform).toBe(platform)
    expect(manifest.timestamp).toBeTypeOf('number')

    manifest.functions.forEach((fn, index) => {
      const file = files[index]

      expect(isAbsolute(fn.path)).toBe(true)
      expect(fn.mainFile).toBe(file.mainFile)
      expect(fn.name).toBe(file.name)
      expect(fn.runtime).toBe(file.runtime)
      expect(fn.path).toBe(file.path)
      expect(fn.schedule).toBe(fn.name === 'five' ? '@daily' : undefined)
    })
  })

  testMany(
    'Correctly follows node_modules via symlink',
    ['bundler_esbuild', platform === 'win32' ? 'todo:bundler_nft' : 'bundler_nft'],
    async (options) => {
      const fixtureName = 'node-module-symlinks'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
      })
      const { files } = await zipNode(fixtureName, {
        opts,
      })

      const isEven = await importFunctionFile(`${files[0].unzipPath}/function.js`)
      expect(isEven(2)).toBe('2 is even')
    },
  )

  testMany(
    'Handles built-in modules imported with the `node:` prefix',
    [...allBundleConfigs, 'bundler_none'],
    async (options, variation) => {
      const importSyntaxIsCompiledAway = variation.includes('esbuild')
      const zip = importSyntaxIsCompiledAway ? zipNode : zipFixture
      await zip('node-force-builtin-esm', {
        opts: options,
      })
    },
  )

  testMany(
    'Handles built-in modules required with the `node:` prefix',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const nodePrefixIsUnderstood = semver.gte(nodeVersion, '14.18.0')
      const zip = nodePrefixIsUnderstood ? zipNode : zipFixture
      await zip('node-force-builtin-cjs', {
        opts: options,
      })
    },
  )

  testMany(
    'Returns a `size` property with the size of each generated archive',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const FUNCTIONS_COUNT = 6
      const { files } = await zipNode('many-functions', {
        length: FUNCTIONS_COUNT,
        opts: options,
      })

      files.forEach(({ size }) => {
        expect(Number.isInteger(size)).toBe(true)
        expect(size).toBeGreaterThan(0)
      })
    },
  )

  testMany(
    'Should surface schedule declarations on a top-level `schedule` property',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const schedule = '* * * * *'
      const fixtureName = 'with-schedule'
      const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
      const manifestPath = join(tmpDir, 'manifest.json')
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            schedule,
          },
        },
        manifest: manifestPath,
      })
      const { files } = await zipNode(fixtureName, { opts })

      files.every((file) => expect(file.schedule).toBe(schedule))

      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

      manifest.functions.forEach((fn) => {
        expect(fn.schedule).toBe(schedule)
      })
    },
  )

  test('Generates a sourcemap for any transpiled files when `nodeSourcemap: true`', async () => {
    const fixtureName = 'esm-throwing-error'
    const basePath = join(FIXTURES_DIR, fixtureName)
    const { files } = await zipFixture(fixtureName, {
      opts: {
        archiveFormat: ARCHIVE_FORMAT.NONE,
        basePath,
        config: { '*': { nodeBundler: NODE_BUNDLER.NFT, nodeSourcemap: true } },
      },
    })
    const func = await importFunctionFile(join(files[0].path, 'function.js'))

    try {
      func.handler()

      expect.fail()
    } catch (error) {
      const filePath = join('tests', 'fixtures', fixtureName, 'function.js')
      // Asserts that the line/column of the error match the position of the
      // original source file, not the transpiled one.
      expect(error.stack).toMatch(`${filePath}:2:9`)
    }
  })

  testMany(
    'Finds in-source config declarations using the `schedule` helper',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const { files } = await zipFixture(join('in-source-config', 'functions'), {
        opts: options,
        length: 13,
      })

      files.forEach((result) => {
        expect(result.schedule).toBe('@daily')
      })
    },
  )

  testMany(
    'Finds in-source config declarations using the `stream` helper',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const { files } = await zipFixture(join('in-source-config', 'functions_stream'), {
        opts: options,
        length: 1,
      })

      files.forEach((result) => {
        expect(result.invocationMode).toBe('stream')
      })
    },
  )

  testMany(
    'Sets `invocationMode: "background"` on functions with a `-background` suffix in the filename',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const { files } = await zipFixture('background', {
        opts: options,
        length: 3,
      })

      files.forEach((result) => {
        expect(result.invocationMode).toBe('background')
      })
    },
  )

  testMany(
    'Throws error when `schedule` helper is used but cron expression not found',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      try {
        await zipFixture(join('in-source-config', 'functions_missing_cron_expression'), {
          opts: options,
        })
      } catch (error) {
        expect(error.message.startsWith('Unable to find cron expression for scheduled function.')).toBe(true)
        expect(error.customErrorInfo.type).toBe('functionsBundling')
        expect(error.customErrorInfo.location.bundler).toBe(undefined)
        expect(error.customErrorInfo.location.functionName).toBeTypeOf('string')
        expect(error.customErrorInfo.location.runtime).toBe('js')
      }
    },
  )

  testMany(
    'Throws error when `schedule` helper is imported but not used',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const FUNCTIONS_COUNT = 2
      try {
        await zipFixture(join('in-source-config', 'functions_missing_schedule_usage'), {
          opts: options,
          length: FUNCTIONS_COUNT,
        })
      } catch (error) {
        expect(error.message).toMatch(/^The `schedule` helper was imported but we couldn't find any usages./)
        expect(error.customErrorInfo.type).toBe('functionsBundling')
        expect(error.customErrorInfo.location.bundler).toBe(undefined)
        expect(error.customErrorInfo.location.functionName).toBeTypeOf('string')
        expect(error.customErrorInfo.location.runtime).toBe('js')
      }
    },
  )

  testMany(
    'Loads function configuration properties from a JSON file if the function is inside one of `configFileDirectories`',
    [...allBundleConfigs],
    async (options) => {
      const fixtureName = 'config-files-select-directories'
      const pathInternal = join(fixtureName, '.netlify', 'functions-internal')
      const pathNotInternal = join(fixtureName, '.netlify', 'functions-internal-not')
      const pathUser = join(fixtureName, 'netlify', 'functions')
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        configFileDirectories: [join(FIXTURES_DIR, pathInternal)],
      })
      const { files } = await zipFixture([pathInternal, pathNotInternal, pathUser], {
        length: 4,
        opts,
      })

      const unzippedFunctions = await unzipFiles(files)

      const func1Entry = unzippedFunctions.find(({ name }) => name === 'internal-function')!
      const func2Entry = unzippedFunctions.find(({ name }) => name === 'root-function')!
      const func3Entry = unzippedFunctions.find(({ name }) => name === 'user-function')!
      const func4Entry = unzippedFunctions.find(({ name }) => name === 'not-internal')!

      expect(func1Entry).toBeDefined()
      expect(func2Entry).toBeDefined()
      expect(func3Entry).toBeDefined()
      expect(func4Entry).toBeDefined()

      expect(func1Entry.displayName).toBe('Internal Function')
      expect(func1Entry.generator).toBe('@netlify/mock-plugin@1.0.0')
      expect(func1Entry.config.includedFiles?.includes('blog/*.md')).toBeTruthy()
      expect(func2Entry.config.includedFiles?.includes('blog/*.md')).toBeTruthy()
      expect(func2Entry.generator).toBeUndefined()
      expect(func3Entry.config.includedFiles?.includes('blog/*.md')).toBeFalsy()
      expect(func4Entry.config.includedFiles?.includes('blog/*.md')).toBeFalsy()

      const functionPaths = [
        join(func1Entry.unzipPath, 'internal-function.js'),
        join(func2Entry.unzipPath, 'root-function.js'),
        join(func3Entry.unzipPath, 'user-function.js'),
        join(func4Entry.unzipPath, 'not-internal.js'),
      ]
      const func1 = await importFunctionFile(functionPaths[0])
      const func2 = await importFunctionFile(functionPaths[1])
      const func3 = await importFunctionFile(functionPaths[2])
      const func4 = await importFunctionFile(functionPaths[3])

      expect(func1.handler()).toBe(true)
      expect(func2.handler()).toBe(true)
      expect(func3.handler()).toBe(true)
      expect(func4.handler()).toBe(true)

      await expect(`${func1Entry.unzipPath}/blog/one.md`).toPathExist()
      await expect(`${func2Entry.unzipPath}/blog/one.md`).toPathExist()
      await expect(`${func3Entry.unzipPath}/blog/one.md`).not.toPathExist()
      await expect(`${func4Entry.unzipPath}/blog/one.md`).not.toPathExist()
    },
  )

  testMany(
    'Loads function configuration properties from a JSON file if the function is inside one of `configFileDirectories` and writes to manifest file',
    [...allBundleConfigs],
    async (options) => {
      const { path: tmpManifestDir } = await getTmpDir({ prefix: 'zip-it-test' })
      const manifestPath = join(tmpManifestDir, 'manifest.json')
      const fixtureName = 'config-files-select-directories'
      const pathInternal = join(fixtureName, '.netlify', 'functions-internal')
      const pathNotInternal = join(fixtureName, '.netlify', 'functions-internal-not')
      const pathUser = join(fixtureName, 'netlify', 'functions')
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        manifest: manifestPath,
        configFileDirectories: [join(FIXTURES_DIR, pathInternal)],
      })
      await zipFixture([pathInternal, pathNotInternal, pathUser], {
        length: 4,
        opts,
      })

      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
      const func1Entry = manifest.functions.find(({ name }) => name === 'internal-function')

      expect(func1Entry?.displayName).toBe('Internal Function')
      expect(func1Entry?.generator).toBe('@netlify/mock-plugin@1.0.0')
    },
  )

  testMany(
    'Keeps config for functions passed to ZISI, but overwrites with config from JSON config',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const fixtureName = 'config-files-select-directories'
      const pathInternal = join(fixtureName, '.netlify', 'functions-internal')
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        configFileDirectories: [join(FIXTURES_DIR, pathInternal)],
        config: {
          'internal-function': {
            schedule: '@hourly',
          },
          'root-function': {
            schedule: '@hourly',
          },
        },
      })
      const { files } = await zipFixture([pathInternal], {
        length: 2,
        opts,
      })

      const func1Entry = files.find(({ name }) => name === 'internal-function')
      const func2Entry = files.find(({ name }) => name === 'root-function')

      expect(func1Entry?.config.schedule).toEqual('@hourly')
      expect(func2Entry?.config.schedule).toEqual('@daily')
    },
  )

  testMany(
    'Ignores function configuration files with a missing or invalid `version` property',
    [...allBundleConfigs],
    async (options) => {
      const fixtureName = 'config-files-invalid-version'
      const fixtureDir = join(FIXTURES_DIR, fixtureName)
      const opts = merge(options, {
        basePath: fixtureDir,
        configFileDirectories: [fixtureDir],
      })
      const { files } = await zipFixture(fixtureName, {
        length: 2,
        opts,
      })

      const unzippedFunctions = await unzipFiles(files)

      const functionPaths = [
        join(unzippedFunctions[0].unzipPath, 'my-function-2.js'),
        join(unzippedFunctions[1].unzipPath, 'my-function-1.js'),
      ]
      const func1 = await importFunctionFile(functionPaths[0])
      const func2 = await importFunctionFile(functionPaths[1])

      expect(func1.handler()).toBe(true)
      expect(func2.handler()).toBe(true)
      expect(files[0].config.includedFiles).toBe(undefined)
      expect(files[1].config.includedFiles).toBe(undefined)
      await expect(`${unzippedFunctions[0].unzipPath}/blog/one.md`).not.toPathExist()
    },
  )

  testMany('Ignores function configuration files with malformed JSON', [...allBundleConfigs], async (options) => {
    const fixtureName = 'config-files-malformed-json'
    const fixtureDir = join(FIXTURES_DIR, fixtureName)
    const opts = merge(options, {
      basePath: fixtureDir,
      configFileDirectories: [fixtureDir],
    })
    const { files } = await zipFixture(fixtureName, {
      length: 2,
      opts,
    })

    const unzippedFunctions = await unzipFiles(files)

    const functionPaths = [
      join(unzippedFunctions[0].unzipPath, 'my-function-2.js'),
      join(unzippedFunctions[1].unzipPath, 'my-function-1.js'),
    ]
    const func1 = await importFunctionFile(functionPaths[0])
    const func2 = await importFunctionFile(functionPaths[1])

    expect(func1.handler()).toBe(true)
    expect(func2.handler()).toBe(true)
    expect(files[0].config.includedFiles).toBe(undefined)
    expect(files[1].config.includedFiles).toBe(undefined)
    await expect(`${unzippedFunctions[0].unzipPath}/blog/one.md`).not.toPathExist()
  })

  testMany('None bundler uses files without touching or reading them', ['bundler_none'], async (opts) => {
    const { files } = await zipFixture('node-syntax-error', { opts })

    const unzippedFunctions = await unzipFiles(files)

    const originalFile = await readFile(join(FIXTURES_DIR, 'node-syntax-error/function.js'), 'utf8')
    const bundledFile = await readFile(join(unzippedFunctions[0].unzipPath, 'function.js'), 'utf8')

    expect(originalFile).toBe(bundledFile)
  })

  testMany('None bundler throws when using ESM on node < 14', ['bundler_none'], async (options) => {
    await expect(
      zipFixture('node-esm', {
        length: 2,
        opts: {
          ...options,
          config: {
            '*': {
              ...options.config['*'],
              nodeVersion: '12.x',
            },
          },
        },
      }),
    ).rejects.toThrowErrorMatchingSnapshot()
  })

  testMany('None bundler emits esm with default nodeVersion', ['bundler_none'], async (options) => {
    const { files } = await zipFixture('node-esm', {
      length: 2,
      opts: options,
    })

    const unzippedFunctions = await unzipFiles(files)

    const originalFile = await readFile(join(FIXTURES_DIR, 'node-esm/func1.js'), 'utf8')
    const bundledFile = await readFile(join(unzippedFunctions[0].unzipPath, 'func1.js'), 'utf8')

    expect(originalFile).toBe(bundledFile)
  })

  testMany(
    'Outputs `.mjs` files as ESM if the `zisi_pure_esm_mjs` feature flag is on',
    [...allBundleConfigs],
    async (options) => {
      const length = 3
      const fixtureName = 'node-mjs-extension'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        featureFlags: { zisi_pure_esm_mjs: true },
      })
      const { files } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      const unzippedFunctions = await unzipFiles(files)

      for (let index = 1; index <= length; index++) {
        const funcDir = unzippedFunctions[index - 1].unzipPath

        const funcFile = join(funcDir, `func${index}.mjs`)
        const func = await importFunctionFile(funcFile)

        expect(func.handler()).toBe(true)
        expect(await detectEsModule({ mainFile: funcFile })).toBe(true)
      }
    },
  )

  testMany(
    'Outputs `.mjs` files as ESM if the `nodeModuleFormat` configuration property is set to `esm`',
    [...allBundleConfigs],
    async (options) => {
      const length = 3
      const fixtureName = 'node-mjs-extension'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            nodeModuleFormat: 'esm',
          },
        },
      })
      const { files } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      const unzippedFunctions = await unzipFiles(files)

      for (let index = 1; index <= length; index++) {
        const funcDir = unzippedFunctions[index - 1].unzipPath

        const funcFile = join(funcDir, `func${index}.mjs`)
        const func = await importFunctionFile(funcFile)

        expect(func.handler()).toBe(true)
        expect(await detectEsModule({ mainFile: funcFile })).toBe(true)
      }
    },
  )

  test('Provides require to esbuild if output format is ESM', async () => {
    const fixtureName = 'node-require-in-esm'
    const opts = {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: {
        '*': {
          nodeBundler: NODE_BUNDLER.ESBUILD,
          nodeModuleFormat: MODULE_FORMAT.ESM,
        },
      },
    }
    const { files } = await zipFixture([join(fixtureName, 'functions')], {
      opts,
    })

    const unzippedFunctions = await unzipFiles(files)

    const funcFile = join(unzippedFunctions[0].unzipPath, `func1.mjs`)

    // We have to use execa because when we simply import the file here vitest does provide a `require` function
    // and therefore we do not trigger the problem
    const result = await execaNode(funcFile, [], { extendEnv: false, reject: false })

    expect(result.stderr).not.toContain('Dynamic require of "path" is not supported')
    expect(result).not.toBeInstanceOf(Error)
  })

  testMany(
    'Emits entry file with .cjs extension when `zisi_output_cjs_extension` flag is on',
    ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
    async (options) => {
      const fixtureName = 'node-esm'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        featureFlags: { zisi_output_cjs_extension: true },
      })
      const { files } = await zipFixture(fixtureName, {
        length: 2,
        opts,
      })

      const unzippedFunctions = await unzipFiles(files)

      const bundledFile2 = await importFunctionFile(join(unzippedFunctions[1].unzipPath, 'func2.cjs'))
      expect(bundledFile2.handler()).toBe(true)

      if (getBundlerNameFromOptions(options) === 'esbuild') {
        // nft does not create an entry here because the main file is already an entrypoint
        const bundledFile1 = await importFunctionFile(join(unzippedFunctions[0].unzipPath, 'func1.cjs'))
        expect(bundledFile1.handler()).toBe(true)
      }
    },
  )

  testMany('Keeps .cjs extension', ['bundler_default', 'bundler_nft'], async (options) => {
    const fixtureName = 'node-cjs-extension'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    const { files } = await zipFixture(fixtureName, {
      length: 3,
      opts,
    })

    const unzippedFunctions = await unzipFiles(files)

    const bundledFile1 = await importFunctionFile(join(unzippedFunctions[0].unzipPath, 'func1.cjs'))
    const bundledFile2 = await importFunctionFile(join(unzippedFunctions[1].unzipPath, 'func2.cjs'))
    const bundledFile3 = await importFunctionFile(join(unzippedFunctions[2].unzipPath, 'index.cjs'))

    expect(bundledFile1.handler()).toBe(true)
    expect(bundledFile2.handler()).toBe(true)
    expect(bundledFile3.handler()).toBe(true)
  })

  testMany(
    'Does not create .cjs entry file if entry with .js extension is already present',
    ['bundler_default', 'bundler_nft'],
    async (options) => {
      const fixtureName = 'node-js-extension'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        featureFlags: { zisi_output_cjs_extension: true },
      })
      const { files } = await zipFixture(fixtureName, {
        length: 3,
        opts,
      })

      const unzippedFunctions = await unzipFiles(files)

      const bundledFile1 = await importFunctionFile(join(unzippedFunctions[0].unzipPath, 'func1.js'))
      const bundledFile2 = await importFunctionFile(join(unzippedFunctions[1].unzipPath, 'func2.js'))

      expect(bundledFile1.handler()).toBe(true)
      expect(bundledFile2.handler()).toBe(true)

      expect(`${unzippedFunctions[0].unzipPath}/func1.cjs`).not.toPathExist()
      expect(`${unzippedFunctions[0].unzipPath}/func1.mjs`).not.toPathExist()
      expect(`${unzippedFunctions[1].unzipPath}/func2.cjs`).not.toPathExist()
      expect(`${unzippedFunctions[1].unzipPath}/func2.mjs`).not.toPathExist()
    },
  )

  testMany('Does throw on a function which is named like the entry file', [...allBundleConfigs], async (options) => {
    const fixtureName = 'entry-file-func-name'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    await expect(zipFixture(fixtureName, { opts })).rejects.toThrowError(
      /is a reserved word and cannot be used as a function name\.$/,
    )
  })

  // esbuild does bundle everything into one file, so it does not have any other files in the bundle
  testMany(
    'Does throw on a function which has files named like the entry file',
    ['bundler_default', 'bundler_nft'],
    async (options) => {
      const fixtureName = 'entry-file-file-name'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
      })
      await expect(zipFixture(fixtureName, { opts })).rejects.toThrowError(
        /is a reserved word and cannot be used as a file or directory name\.$/,
      )
    },
  )

  testMany('All ESM bundlers can handle import loops', ['bundler_esbuild', 'bundler_nft'], async (options) => {
    const fixtureName = 'node-esm-import-loop'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: {
        '*': {
          nodeVersion: 'nodejs16.x',
        },
      },
    })
    const { files, tmpDir } = await zipFixture(`${fixtureName}/functions`, {
      length: 1,
      opts,
    })

    await unzipFiles(files)

    const func = await importFunctionFile(join(tmpDir, 'func1', 'func1.js'))

    expect(func.handler()).toBe(true)
  })

  testMany('Outputs correct entryFilename', ['bundler_esbuild', 'bundler_nft', 'bundler_default'], async (options) => {
    const { files } = await zipFixture('node-mts-extension', {
      length: 3,
      opts: options,
    })

    const unzippedFunctions = await unzipFiles(files)

    for (const { unzipPath, entryFilename } of unzippedFunctions) {
      const { handler } = await importFunctionFile(`${unzipPath}/${entryFilename}`)
      expect(handler()).toBe(true)
    }
  })

  testMany('esbuild hides unactionable import.meta warning', ['bundler_esbuild'], async (options) => {
    const {
      files: [{ bundlerWarnings }],
    } = await zipFixture('import-meta-warning', {
      length: 1,
      opts: options,
    })
    expect(bundlerWarnings).toHaveLength(1)
    expect((bundlerWarnings?.[0] as any).text).toEqual(
      `"import.meta" is not available and will be empty, use __dirname instead`,
    )
  })

  testMany('only includes files once in a zip', [...allBundleConfigs], async (options) => {
    const { files, tmpDir } = await zipFixture('local-require', {
      length: 1,
      opts: merge(options, {
        basePath: join(FIXTURES_DIR, 'local-require'),
        config: {
          '*': {
            includedFiles: ['function/file.js'],
            ...options.config['*'],
          },
        },
      }),
    })

    const unzipPath = join(tmpDir, 'unzipped')

    await decompress(files[0].path, unzipPath)

    const fileNames: string[] = await glob('**', { dot: true, cwd: unzipPath })
    const duplicates = fileNames.filter((item, index) => fileNames.indexOf(item) !== index)
    expect(duplicates).toHaveLength(0)
  })
})

test('Adds a `priority` field to the generated manifest file', async () => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const fixtureName = 'multiple-src-directories'
  const manifestPath = join(tmpDir, 'manifest.json')
  const paths = {
    generated: `${fixtureName}/.netlify/internal-functions`,
    user: `${fixtureName}/netlify/functions`,
  }

  await zipNode([paths.generated, paths.user], {
    length: 3,
    opts: {
      internalSrcFolder: join(FIXTURES_DIR, paths.generated),
      manifest: manifestPath,
    },
  })

  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

  expect(manifest.version).toBe(1)
  expect(manifest.system.arch).toBe(arch)
  expect(manifest.system.platform).toBe(platform)
  expect(manifest.timestamp).toBeTypeOf('number')

  const userFunction1 = manifest.functions.find((fn) => fn.name === 'function_user')
  expect(userFunction1.priority).toBe(10)

  const userFunction2 = manifest.functions.find((fn) => fn.name === 'function')
  expect(userFunction2.priority).toBe(10)

  const generatedFunction1 = manifest.functions.find((fn) => fn.name === 'function_internal')
  expect(generatedFunction1.priority).toBe(0)
})

test('Adds a `ratelimit` field to the generated manifest file', async () => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const fixtureName = 'ratelimit'
  const manifestPath = join(tmpDir, 'manifest.json')
  const path = `${fixtureName}/netlify/functions`

  await zipFixture(path, {
    length: 2,
    opts: { manifest: manifestPath },
  })

  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))

  expect(manifest.version).toBe(1)
  expect(manifest.system.arch).toBe(arch)
  expect(manifest.system.platform).toBe(platform)
  expect(manifest.timestamp).toBeTypeOf('number')

  const ratelimitFunction = manifest.functions.find((fn) => fn.name === 'ratelimit')
  const { type: ratelimitType, config: ratelimitConfig } = ratelimitFunction.trafficRules.action
  expect(ratelimitType).toBe('rate_limit')
  expect(ratelimitConfig.rateLimitConfig.windowLimit).toBe(60)
  expect(ratelimitConfig.rateLimitConfig.windowSize).toBe(50)
  expect(ratelimitConfig.rateLimitConfig.algorithm).toBe('sliding_window')
  expect(ratelimitConfig.aggregate.keys).toStrictEqual([{ type: 'ip' }, { type: 'domain' }])

  const rewriteFunction = manifest.functions.find((fn) => fn.name === 'rewrite')
  const { type: rewriteType, config: rewriteConfig } = rewriteFunction.trafficRules.action
  expect(rewriteType).toBe('rewrite')
  expect(rewriteConfig.to).toBe('/rewritten')
  expect(rewriteConfig.rateLimitConfig.windowLimit).toBe(200)
  expect(rewriteConfig.rateLimitConfig.windowSize).toBe(20)
  expect(rewriteConfig.rateLimitConfig.algorithm).toBe('sliding_window')
  expect(rewriteConfig.aggregate.keys).toStrictEqual([{ type: 'ip' }, { type: 'domain' }])
})
