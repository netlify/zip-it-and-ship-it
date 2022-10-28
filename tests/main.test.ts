import { mkdir, readFile, chmod, symlink, unlink, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import { arch, env, platform, version as nodeVersion } from 'process'

import cpy from 'cpy'
import merge from 'deepmerge'
import { deleteAsync } from 'del'
import execa from 'execa'
import { pathExists } from 'path-exists'
import semver from 'semver'
import { dir as getTmpDir, tmpName } from 'tmp-promise'
import unixify from 'unixify'
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'

import type { Config } from '../src/config.js'
import { NodeBundlerType } from '../src/main.js'
import { ESBUILD_LOG_LIMIT } from '../src/runtimes/node/bundlers/esbuild/bundler.js'
import { detectEsModule } from '../src/runtimes/node/utils/detect_es_module.js'
import { shellUtils } from '../src/utils/shell.js'

import {
  getRequires,
  zipNode,
  zipFixture,
  unzipFiles,
  zipCheckFunctions,
  FIXTURES_DIR,
  BINARY_PATH,
  importFunctionFile,
} from './helpers/main.js'
import { computeSha1 } from './helpers/sha.js'
import { allBundleConfigs, testMany } from './helpers/test_many.js'

// eslint-disable-next-line import/no-unassigned-import
import 'source-map-support/register'

vi.mock('../src/utils/shell.js', () => ({ shellUtils: { runCommand: vi.fn() } }))

const EXECUTABLE_PERMISSION = 0o755

const getZipChecksum = async function (config: Config) {
  const {
    files: [{ path }],
  } = await zipFixture('many-dependencies', { opts: { config } })
  const sha1sum = computeSha1(path)

  return sha1sum
}

describe('zip-it-and-ship-it', () => {
  afterAll(async () => {
    if (env.ZISI_KEEP_TEMP_DIRS === undefined) {
      await deleteAsync(`${tmpdir()}/zip-it-test-bundler-*`, { force: true })
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  testMany('Zips Node.js function files', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const fixtureName = 'simple'
    const { files } = await zipNode(fixtureName, { opts: options })

    expect(files).toHaveLength(1)
    expect(files[0].runtime).toBe('js')
    expect(files[0].mainFile).toBe(join(FIXTURES_DIR, fixtureName, 'function.js'))
  })

  testMany(
    'Handles Node module with native bindings (buildtime marker module)',
    [...allBundleConfigs],
    async (options) => {
      const bundler = options.getCurrentBundlerName()
      const fixtureDir = 'node-module-native-buildtime'
      const { files, tmpDir } = await zipNode(fixtureDir, {
        opts: options,
      })
      const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })
      const normalizedRequires = new Set(requires.map((path) => unixify(path)))

      expect(files).toHaveLength(1)
      expect(files[0].runtime).toBe('js')

      const moduleWithNodeFile = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/module-with-node-file`)
      await expect(`${tmpDir}/node_modules/module-with-node-file/native.node`).toPathExist()
      await expect(`${tmpDir}/node_modules/module-with-node-file/side-file.js`).toPathExist()
      expect(normalizedRequires.has('module-with-node-file')).toBe(true)

      const moduleWithNodeGypPath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/module-with-node-gyp`)
      await expect(`${tmpDir}/node_modules/module-with-node-gyp/native.node`).toPathExist()
      await expect(`${tmpDir}/node_modules/module-with-node-gyp/side-file.js`).toPathExist()
      expect(normalizedRequires.has('module-with-node-gyp')).toBe(true)

      const moduleWithPrebuildPath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/module-with-prebuild`)
      await expect(`${tmpDir}/node_modules/module-with-prebuild/native.node`).toPathExist()
      await expect(`${tmpDir}/node_modules/module-with-prebuild/side-file.js`).toPathExist()
      expect(normalizedRequires.has('module-with-prebuild')).toBe(true)

      // We can only detect native modules when using esbuild.
      if (bundler === NodeBundlerType.ESBUILD || bundler === NodeBundlerType.ESBUILD_ZISI) {
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
      const bundler = options.getCurrentBundlerName()
      const fixtureDir = 'node-module-native-runtime'
      const { files, tmpDir } = await zipNode(fixtureDir, {
        opts: options,
      })
      const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })
      const normalizedRequires = new Set(requires.map((path) => unixify(path)))
      const modulePath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/test`)

      expect(files).toHaveLength(1)
      expect(files[0].runtime).toBe('js')
      await expect(`${tmpDir}/node_modules/test/native.node`).toPathExist()
      await expect(`${tmpDir}/node_modules/test/side-file.js`).toPathExist()
      expect(normalizedRequires.has('test')).toBe(true)

      // We can only detect native modules when using esbuild.
      if (bundler === NodeBundlerType.ESBUILD || bundler === NodeBundlerType.ESBUILD_ZISI) {
        expect(files[0].nativeNodeModules).toEqual({ test: { [modulePath]: '1.0.0' } })
      }
    },
  )

  testMany('Can require node modules', [...allBundleConfigs], async (options) => {
    await zipNode('local-node-module', { opts: options })
  })

  testMany('Can require deep paths in node modules', [...allBundleConfigs], async (options) => {
    const { tmpDir } = await zipNode('local-node-module-deep-require', {
      opts: options,
    })

    const func = await importFunctionFile(`${tmpDir}/function.js`)

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

  testMany('Ignore some excluded node modules', [...allBundleConfigs], async (options) => {
    const fixtureName = 'node-module-excluded'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    const { tmpDir } = await zipNode(fixtureName, { opts })

    await expect(`${tmpDir}/node_modules/aws-sdk`).not.toPathExist()

    try {
      const func = await importFunctionFile(`${tmpDir}/function.js`)

      func()

      expect.fail('Running the function should fail due to the missing module')
    } catch (error) {
      expect(error.code).toBe('MODULE_NOT_FOUND')
    }
  })

  testMany('Ignore TypeScript types', [...allBundleConfigs], async (options) => {
    const { tmpDir } = await zipNode('node-module-typescript-types', {
      opts: options,
    })
    await expect(`${tmpDir}/node_modules/@types/node`).not.toPathExist()
  })

  testMany('Throws on runtime errors', [...allBundleConfigs], async (options) => {
    await expect(() => zipNode('node-module-error', { opts: options })).rejects.toThrow()
  })

  testMany('Throws on missing dependencies', [...allBundleConfigs], async (options) => {
    await expect(() => zipNode('node-module-missing', { opts: options })).rejects.toThrow()
  })

  testMany('Throws on missing dependencies with no optionalDependencies', [...allBundleConfigs], async (options) => {
    await expect(() => zipNode('node-module-missing-package', { opts: options })).rejects.toThrow()
  })

  testMany('Throws on missing conditional dependencies', [...allBundleConfigs], async (options) => {
    await expect(() => zipNode('node-module-missing-conditional', { opts: options })).rejects.toThrow()
  })

  testMany("Throws on missing dependencies' dependencies", [...allBundleConfigs], async (options) => {
    await expect(() => zipNode('node-module-missing-deep', { opts: options })).rejects.toThrow()
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
      await expect(() => zipNode('node-module-peer-optional-none', { opts: options })).rejects.toThrow()
    },
  )

  testMany('Throws on missing non-optional peer dependencies', [...allBundleConfigs], async (options) => {
    await expect(() => zipNode('node-module-peer-not-optional', { opts: options })).rejects.toThrow()
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
      await expect(() => zipNode('invalid-package-json', { opts: options })).rejects.toThrow(
        /(invalid JSON|package.json:1:1: error: Expected string but found "{")/,
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
    'Can bundle ESM functions and transpile them to CJS when the Node version is <14',
    ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
    async (options) => {
      const length = 4
      const fixtureName = 'local-require-esm'
      const opts = merge(options, {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            nodeVersion: 'nodejs12.x',
          },
        },
        featureFlags: { zisi_pure_esm: false },
      })
      const { files, tmpDir } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      await unzipFiles(files, (path) => `${path}/../${basename(path)}_out`)

      const functionPaths = [
        join(tmpDir, 'function.zip_out', 'function.js'),
        join(tmpDir, 'function_cjs.zip_out', 'function_cjs.js'),
        join(tmpDir, 'function_export_only.zip_out', 'function_export_only.js'),
        join(tmpDir, 'function_import_only.zip_out', 'function_import_only.js'),
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
    'Can bundle ESM functions and transpile them to CJS when the Node version is <14 and `archiveType` is `none`',
    ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
    async (options) => {
      const length = 4
      const fixtureName = 'local-require-esm'
      const opts = merge(options, {
        archiveFormat: 'none' as const,
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
      const { files, tmpDir } = await zipFixture(fixtureName, {
        opts,
      })

      await unzipFiles(files)

      const func = await importFunctionFile(join(tmpDir, 'function.js'))

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
      const { files, tmpDir } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      await unzipFiles(files, (path) => `${path}/../${basename(path)}_out`)

      const functionPaths = [join(tmpDir, 'func1.zip_out', 'func1.js'), join(tmpDir, 'func2.zip_out', 'func2.js')]
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
      const { files, tmpDir } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      await unzipFiles(files, (path) => `${path}/../${basename(path)}_out`)

      const functionPaths = [join(tmpDir, 'func1.zip_out', 'func1.js'), join(tmpDir, 'func2.zip_out', 'func2.js')]
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
        await unlink(symlinkFile)
      }
    })
  }

  testMany('Can target a directory with a main file with the same name', [...allBundleConfigs], async (options) => {
    const fixtureName = 'directory-handler'
    const { files } = await zipNode(fixtureName, { opts: options })

    expect(files[0].mainFile).toBe(join(FIXTURES_DIR, fixtureName, 'function', 'function.js'))
  })

  testMany('Can target a directory with an index.js file', [...allBundleConfigs], async (options) => {
    const fixtureName = 'index-handler'
    const { files, tmpDir } = await zipFixture(fixtureName, {
      opts: options,
    })
    await unzipFiles(files)
    const returnValue = await importFunctionFile(`${tmpDir}/function.js`)
    expect(returnValue).toBe(true)
    expect(files[0].mainFile).toBe(join(FIXTURES_DIR, fixtureName, 'function', 'index.js'))
  })

  testMany('Keeps non-required files inside the target directory', [...allBundleConfigs], async (options) => {
    const { tmpDir } = await zipNode('keep-dir-files', { opts: options })
    await expect(`${tmpDir}/function.js`).toPathExist()
  })

  testMany('Ignores non-required node_modules inside the target directory', [...allBundleConfigs], async (options) => {
    const { tmpDir } = await zipNode('ignore-dir-node-modules', {
      opts: options,
    })
    await expect(`${tmpDir}/node_modules`).not.toPathExist()
  })

  testMany(
    'Ignores deep non-required node_modules inside the target directory',
    [...allBundleConfigs],
    async (options) => {
      const { tmpDir } = await zipNode('ignore-deep-dir-node-modules', {
        opts: options,
      })
      await expect(`${tmpDir}/deep/node_modules`).not.toPathExist()
    },
  )

  testMany('Works with many dependencies', [...allBundleConfigs], async (options) => {
    const fixtureTmpDir = await tmpName({ prefix: 'zip-it-test' })
    const opts = merge(options, {
      basePath: fixtureTmpDir,
    })

    const basePath = `${fixtureTmpDir}/many-dependencies`
    await cpy('many-dependencies/**', basePath, { cwd: FIXTURES_DIR })
    await execa('npm', ['install', '--no-package-lock'], { cwd: basePath })

    await zipNode('many-dependencies', { opts, fixtureDir: fixtureTmpDir })
  })

  testMany('Works with many function files', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const names = new Set(['one', 'two', 'three', 'four', 'five', 'six'])
    const { files } = await zipNode('many-functions', {
      opts: options,
      length: TEST_FUNCTIONS_LENGTH,
    })

    files.forEach(({ name }) => {
      expect(names.has(name)).toBe(true)
    })
  })

  const TEST_FUNCTIONS_LENGTH = 6

  testMany('Produces deterministic checksums', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const [checksumOne, checksumTwo] = await Promise.all([
      getZipChecksum(options.config),
      getZipChecksum(options.config),
    ])
    expect(checksumOne).toBe(checksumTwo)
  })

  testMany('Throws when the source folder does not exist', [...allBundleConfigs, 'bundler_none'], async (options) => {
    await expect(() => zipNode('does-not-exist', { opts: options })).rejects.toThrow(/Functions folders do not exist/)
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
    const { tmpDir } = await zipNode('useless', { opts: options })
    await expect(`${tmpDir}/Desktop.ini`).not.toPathExist()
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
    await zipNode('no-package-json', { opts, length: 1, fixtureDir })
  })

  testMany('Copies already zipped files', [...allBundleConfigs, 'bundler_none'], async () => {
    const tmpDir = await tmpName({ prefix: 'zip-it-test' })
    const { files } = await zipCheckFunctions('keep-zip', { tmpDir })

    expect(files).toHaveLength(1)
    expect(files[0].runtime).toBe('js')

    const fileContents = await readFile(files[0].path, 'utf8')
    expect(fileContents.trim()).toBe('test')
  })

  testMany('Ignore unsupported programming languages', [...allBundleConfigs, 'bundler_none'], async (options) => {
    await zipFixture('unsupported', { length: 0, opts: options })
  })

  testMany('Can reduce parallelism', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const opts = merge(options, { parallelLimit: 1 })

    await zipNode('simple', { length: 1, opts })
  })

  testMany('Zips node modules', ['bundler_default', 'bundler_nft'], async (options) => {
    await zipNode('node-module', { opts: options })
  })

  testMany('Include most files from node modules', ['bundler_default'], async (options) => {
    const fixtureName = 'node-module-included'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    const { tmpDir } = await zipNode('node-module-included', { opts })

    await expect(`${tmpDir}/node_modules/test/test.map`).not.toPathExist()
    await expect(`${tmpDir}/node_modules/test/test.html`).toPathExist()
  })

  testMany('Throws on missing critters dependency for Next.js 9', ['bundler_default'], async (options) => {
    await expect(() => zipNode('node-module-next9-critters', { opts: options })).rejects.toThrow()
  })

  testMany(
    'Includes specific Next.js dependencies when using next-on-netlify',
    ['bundler_default'],
    async (options) => {
      const { tmpDir } = await zipNode('node-module-next-on-netlify', {
        opts: options,
      })

      await expect(`${tmpDir}/node_modules/next/dist/next-server/lib/constants.js`).toPathExist()
      await expect(`${tmpDir}/node_modules/next/dist/compiled/semver.js`).toPathExist()
      await expect(`${tmpDir}/node_modules/next/dist/other.js`).not.toPathExist()
      await expect(`${tmpDir}/node_modules/next/index.js`).not.toPathExist()
    },
  )

  testMany('Includes all Next.js dependencies when not using next-on-netlify', ['bundler_default'], async (options) => {
    const { tmpDir } = await zipNode('node-module-next', { opts: options })

    await expect(`${tmpDir}/node_modules/next/dist/next-server/lib/constants.js`).toPathExist()
    await expect(`${tmpDir}/node_modules/next/dist/compiled/semver.js`).toPathExist()
    await expect(`${tmpDir}/node_modules/next/dist/other.js`).toPathExist()
    await expect(`${tmpDir}/node_modules/next/index.js`).toPathExist()
  })

  testMany('Inlines node modules in the bundle', ['bundler_esbuild'], async (options) => {
    const { tmpDir } = await zipNode('node-module-included-try-catch', {
      opts: options,
    })
    const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

    expect(requires.includes('test')).toBe(false)
    await expect(`${tmpDir}/node_modules/test`).not.toPathExist()
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
      const { tmpDir } = await zipNode('node-module-included-try-catch', {
        opts,
      })
      const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

      expect(requires.includes('test')).toBe(true)
      await expect(`${tmpDir}/node_modules/test`).toPathExist()
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
      const { tmpDir } = await zipNode('node-module-included-try-catch', {
        opts,
      })
      const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

      expect(requires.includes('test')).toBe(true)
      await expect(`${tmpDir}/node_modules/test`).not.toPathExist()
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
      const { tmpDir } = await zipNode('node-module-included', {
        opts,
      })

      expect(`${tmpDir}/node_modules/test/test.map`).not.toPathExist()
      expect(`${tmpDir}/node_modules/test/test.html`).toPathExist()
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
      const { tmpDir } = await zipNode('node-module-included-try-catch', {
        opts,
      })

      await expect(`${tmpDir}/node_modules/i-do-not-exist`).not.toPathExist()
    },
  )

  testMany(
    'Exposes the main export of `node-fetch` when imported using `require()`',
    [...allBundleConfigs],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-fetch', { opts: options })
      await unzipFiles(files)
      const returnValue = await importFunctionFile(`${tmpDir}/function.js`)
      expect(returnValue).toBeTypeOf('function')
    },
  )

  testMany(
    '{name}/{name}.js takes precedence over {name}.js and {name}/index.js',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('conflicting-names-1', {
        opts: options,
      })
      await unzipFiles(files)
      const returnValue = await importFunctionFile(`${tmpDir}/function.js`)
      expect(returnValue).toBe('function-js-file-in-directory')
    },
  )

  testMany(
    '{name}/index.js takes precedence over {name}.js',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('conflicting-names-2', {
        opts: options,
      })
      await unzipFiles(files)
      const returnValue = await importFunctionFile(`${tmpDir}/function.js`)
      expect(returnValue).toBe('index-js-file-in-directory')
    },
  )

  testMany(
    '{name}/index.js takes precedence over {name}/index.ts',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('conflicting-names-3', {
        opts: options,
      })
      await unzipFiles(files)
      const { type } = await importFunctionFile(`${tmpDir}/function.js`)
      expect(type).toBe('index-js-file-in-directory')
    },
  )

  testMany('{name}.js takes precedence over {name}.ts', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const { files, tmpDir } = await zipFixture('conflicting-names-4', {
      opts: options,
    })
    await unzipFiles(files)
    const { type } = await importFunctionFile(`${tmpDir}/function.js`)
    expect(type).toBe('function-js-file')
  })

  testMany('{name}.js takes precedence over {name}.zip', [...allBundleConfigs, 'bundler_none'], async (options) => {
    const { files, tmpDir } = await zipFixture('conflicting-names-5', {
      opts: options,
    })
    await unzipFiles(files)
    const { type } = await importFunctionFile(`${tmpDir}/function.js`)
    expect(type).toBe('function-js-file')
  })

  testMany(
    'Handles a TypeScript function ({name}.ts)',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-typescript', {
        opts: options,
      })
      await unzipFiles(files)
      const { type } = await importFunctionFile(`${tmpDir}/function.js`)
      expect(type).toBeTypeOf('string')
    },
  )

  testMany(
    'Handles a TypeScript function ({name}/{name}.ts)',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-typescript-directory-1', {
        opts: options,
      })
      await unzipFiles(files)
      const { type } = await importFunctionFile(`${tmpDir}/function.js`)
      expect(type).toBeTypeOf('string')
    },
  )

  testMany(
    'Handles a TypeScript function ({name}/index.ts)',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-typescript-directory-2', {
        opts: options,
      })
      await unzipFiles(files)
      const { type } = await importFunctionFile(`${tmpDir}/function.js`)
      expect(type).toBeTypeOf('string')
    },
  )

  testMany(
    'Handles a TypeScript function with imports',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-typescript-with-imports', {
        opts: options,
      })
      await unzipFiles(files)
      const { type } = await importFunctionFile(`${tmpDir}/function.js`)
      expect(type).toBeTypeOf('string')
    },
  )

  testMany(
    'Handles a JavaScript function ({name}.mjs, {name}/{name}.mjs, {name}/index.mjs)',
    ['bundler_esbuild', 'bundler_default'],
    async (options) => {
      const expectedLength = 3
      const { files, tmpDir } = await zipFixture('node-mjs-extension', {
        length: expectedLength,
        opts: options,
      })

      await unzipFiles(files)

      expect(files).toHaveLength(expectedLength)

      for (let index = 0; index < expectedLength; index++) {
        const funcFile = `${tmpDir}/func${index + 1}.js`
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
      const { files, tmpDir } = await zipFixture('node-mts-extension', {
        length: 3,
        opts: options,
      })

      await unzipFiles(files)

      expect(files).toHaveLength(3)
      files.forEach((file) => {
        expect(file.bundler).toBe('esbuild')
      })

      const { handler: handler1 } = await importFunctionFile(`${tmpDir}/func1.js`)
      expect(handler1()).toBe(true)
      const { handler: handler2 } = await importFunctionFile(`${tmpDir}/func2.js`)
      expect(handler2()).toBe(true)
      const { handler: handler3 } = await importFunctionFile(`${tmpDir}/func3.js`)
      expect(handler3()).toBe(true)
    },
  )

  testMany(
    'Handles a JavaScript function ({name}.cts, {name}/{name}.cts, {name}/index.cts)',
    ['bundler_esbuild', 'bundler_default'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-cts-extension', {
        length: 3,
        opts: options,
      })

      await unzipFiles(files)

      expect(files).toHaveLength(3)
      files.forEach((file) => {
        expect(file.bundler).toBe('esbuild')
      })

      const { handler: handler1 } = await importFunctionFile(`${tmpDir}/func1.js`)
      expect(handler1()).toBe(true)
      const { handler: handler2 } = await importFunctionFile(`${tmpDir}/func2.js`)
      expect(handler2()).toBe(true)
      const { handler: handler3 } = await importFunctionFile(`${tmpDir}/func3.js`)
      expect(handler3()).toBe(true)
    },
  )

  testMany(
    'Handles a JavaScript function ({name}.cjs, {name}/{name}.cjs, {name}/index.cjs)',
    ['bundler_esbuild', 'bundler_default'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-cjs-extension', {
        length: 3,
        opts: options,
      })

      await unzipFiles(files)

      expect(files).toHaveLength(3)
      files.forEach((file) => {
        expect(file.bundler).toBe(options.getCurrentBundlerName() ?? 'zisi')
      })

      const { handler: handler1 } = await importFunctionFile(`${tmpDir}/func1.js`)
      expect(handler1()).toBe(true)
      const { handler: handler2 } = await importFunctionFile(`${tmpDir}/func2.js`)
      expect(handler2()).toBe(true)
      const { handler: handler3 } = await importFunctionFile(`${tmpDir}/func3.js`)
      expect(handler3()).toBe(true)
    },
  )

  testMany(
    'Loads a tsconfig.json placed in the same directory as the function',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-typescript-tsconfig-sibling', {
        opts: options,
      })
      await unzipFiles(files)
      const { value } = await importFunctionFile(`${tmpDir}/function.js`)
      expect(value).toBe(true)
    },
  )

  testMany(
    'Loads a tsconfig.json placed in a parent directory',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-typescript-tsconfig-parent/functions', {
        opts: options,
      })
      await unzipFiles(files)
      const { value } = await importFunctionFile(`${tmpDir}/function.js`)
      expect(value).toBe(true)
    },
  )

  testMany(
    'Respects the target defined in the config over a `target` property defined in tsconfig',
    ['bundler_esbuild', 'bundler_default', 'todo:bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('node-typescript-tsconfig-target/functions', {
        opts: options,
      })
      await unzipFiles(files)

      const result = await importFunctionFile(`${tmpDir}/function.js`)

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
      const { files, tmpDir } = await zipNode('config-apply-1', { length: 3, opts })
      const requires = await Promise.all([
        getRequires({ filePath: resolve(tmpDir, 'another_function.js') }),
        getRequires({ filePath: resolve(tmpDir, 'function_two.js') }),
        getRequires({ filePath: resolve(tmpDir, 'function_one.js') }),
      ])

      expect(requires[0]).toEqual(['test-1'])
      expect(requires[1]).toEqual(['test-1', 'test-2'])
      expect(requires[2]).toEqual(['test-1', 'test-2', 'test-3'])

      const matches = ['another_function.zip', 'function_two.zip', 'function_one.zip'].map((zipName) =>
        files.find(({ path }) => path.endsWith(zipName)),
      )

      expect(matches[0]?.config).toEqual({ externalNodeModules: ['test-1'], nodeBundler: 'esbuild' })
      expect(matches[1]?.config).toEqual({ externalNodeModules: ['test-1', 'test-2'], nodeBundler: 'esbuild' })
      expect(matches[2]?.config).toEqual({
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
      const { files, tmpDir } = await zipNode('config-apply-1', { length: 3, opts })
      const requires = await Promise.all([
        getRequires({ filePath: resolve(tmpDir, 'another_function.js') }),
        getRequires({ filePath: resolve(tmpDir, 'function_two.js') }),
        getRequires({ filePath: resolve(tmpDir, 'function_one.js') }),
      ])

      expect(requires[0]).toEqual(externalNodeModules)
      expect(requires[1]).toEqual(externalNodeModules)
      expect(requires[2]).toEqual(externalNodeModules)

      const matches = ['another_function.zip', 'function_two.zip', 'function_one.zip'].map((zipName) =>
        files.find(({ path }) => path.endsWith(zipName)),
      )

      expect(matches[0]?.config).toEqual({ externalNodeModules, nodeBundler: 'esbuild' })
      expect(matches[1]?.config).toEqual({ externalNodeModules, nodeBundler: 'esbuild' })
      expect(matches[2]?.config).toEqual({ externalNodeModules, nodeBundler: 'esbuild' })
    },
  )

  testMany('Generates a directory if `archiveFormat` is set to `none`', [...allBundleConfigs], async (options) => {
    const opts = merge(options, {
      archiveFormat: 'none' as const,
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
        config: {
          '*': {
            includedFiles: ['content/*', '!content/post3.md', 'something.md'],
            includedFilesBasePath: join(FIXTURES_DIR, fixtureName),
          },
        },
      })
      const { tmpDir } = await zipNode(`${fixtureName}/netlify/functions`, {
        opts,
      })

      const func = await importFunctionFile(`${tmpDir}/func1.js`)

      const { body: body1 } = await func.handler({ queryStringParameters: { name: 'post1' } })
      const { body: body2 } = await func.handler({ queryStringParameters: { name: 'post2' } })
      const { body: body3 } = await func.handler({ queryStringParameters: { name: 'post3' } })

      expect(body1.includes('Hello from the other side')).toBe(true)
      expect(body2.includes("I must've called a thousand times")).toBe(true)
      expect(body3.includes('Uh-oh')).toBe(true)

      await expect(`${tmpDir}/content/post1.md`).toPathExist()
      await expect(`${tmpDir}/content/post2.md`).toPathExist()
      await expect(`${tmpDir}/content/post3.md`).not.toPathExist()
      await expect(`${tmpDir}/something.md`).toPathExist()
    },
  )

  test('Generates a bundle for the Node runtime version specified in the `nodeVersion` config property', async () => {
    // Using the optional catch binding feature to assert that the bundle is
    // respecting the Node version supplied.
    // - in Node <10 we should see `try {} catch (e) {}`
    // - in Node >= 10 we should see `try {} catch {}`
    const { files: node8Files } = await zipNode('node-module-optional-catch-binding', {
      opts: { archiveFormat: 'none', config: { '*': { nodeBundler: NodeBundlerType.ESBUILD, nodeVersion: '8.x' } } },
    })

    const node8Function = await readFile(`${node8Files[0].path}/src/function.js`, 'utf8')

    expect(node8Function).toMatch(/catch \(\w+\) {/)

    const { files: node12Files } = await zipNode('node-module-optional-catch-binding', {
      opts: { archiveFormat: 'none', config: { '*': { nodeBundler: NodeBundlerType.ESBUILD, nodeVersion: '12.x' } } },
    })

    const node12Function = await readFile(`${node12Files[0].path}/src/function.js`, 'utf8')

    expect(node12Function).toMatch(/catch {/)
  })

  testMany('Returns an `inputs` property with all the imported paths', [...allBundleConfigs], async (options) => {
    const fixtureName = 'node-module-and-local-imports'
    const { files, tmpDir } = await zipNode(fixtureName, {
      opts: options,
    })

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

    const functionEntry = await importFunctionFile(`${tmpDir}/function.js`)

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
      const { tmpDir } = await zipNode(`${fixtureName}/netlify/functions1`, {
        opts,
      })

      const function1Entry = await importFunctionFile(`${tmpDir}/func1.js`)

      // The function should not be on a `src/` namespace.
      expect(unixify(function1Entry[0]).includes('/src/')).toBe(false)
      await expect(`${tmpDir}/src/func1.js`).not.toPathExist()
      await expect(`${tmpDir}/content/post1.md`).toPathExist()
      await expect(`${tmpDir}/content/post2.md`).toPathExist()
      await expect(`${tmpDir}/content/post3.md`).toPathExist()
      await expect(`${tmpDir}/src/content/post1.md`).not.toPathExist()
      await expect(`${tmpDir}/src/content/post2.md`).not.toPathExist()
      await expect(`${tmpDir}/src/content/post3.md`).not.toPathExist()
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
      const { tmpDir } = await zipNode(`${fixtureName}/netlify/functions2`, {
        opts,
      })

      const function2Entry = await importFunctionFile(`${tmpDir}/func2.js`)

      // The function should be on a `src/` namespace because there's a conflict
      // with the /func2.js path present in `includedFiles`.
      expect(unixify(function2Entry[0]).includes('/src/')).toBe(true)
      await expect(`${tmpDir}/src/func2.js`).toPathExist()
      await expect(`${tmpDir}/content/post1.md`).not.toPathExist()
      await expect(`${tmpDir}/content/post2.md`).not.toPathExist()
      await expect(`${tmpDir}/content/post3.md`).not.toPathExist()
      await expect(`${tmpDir}/src/content/post1.md`).toPathExist()
      await expect(`${tmpDir}/src/content/post2.md`).toPathExist()
      await expect(`${tmpDir}/src/content/post3.md`).toPathExist()
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
      const { files, tmpDir } = await zipNode([pathInternal, pathUser], {
        length: 3,
        opts,
      })

      const functionCommon = await importFunctionFile(`${tmpDir}/function.js`)
      const functionInternal = await importFunctionFile(`${tmpDir}/function_internal.js`)
      const functionUser = await importFunctionFile(`${tmpDir}/function_user.js`)

      // Functions from rightmost directories in the array take precedence.
      expect(functionCommon).toBe('user')
      expect(functionInternal).toBe('internal')
      expect(functionUser).toBe('user')

      const functionCommonEntry = files.find(({ name }) => name === 'function')!
      const functionInternalEntry = files.find(({ name }) => name === 'function_internal')!
      const functionUserEntry = files.find(({ name }) => name === 'function_user')!

      expect(functionCommonEntry).not.toBeUndefined()
      expect(functionInternalEntry).not.toBeUndefined()
      expect(functionUserEntry).not.toBeUndefined()

      expect(dirname(functionCommonEntry.mainFile)).toBe(resolve(join(FIXTURES_DIR, pathUser)))
      expect(dirname(functionInternalEntry.mainFile)).toBe(resolve(join(FIXTURES_DIR, pathInternal)))
      expect(dirname(functionUserEntry.mainFile)).toBe(resolve(join(FIXTURES_DIR, pathUser)))
    },
  )

  test('Throws an error if the `archiveFormat` property contains an invalid value`', async () => {
    await expect(() =>
      zipNode('node-module-included', {
        // @ts-expect-error test
        opts: { archiveFormat: 'gzip' },
      }),
    ).rejects.toThrow('Invalid archive format: gzip')
  })

  testMany(
    'Adds `type: "functionsBundling"` to user errors when parsing with esbuild',
    ['bundler_esbuild'],
    async (options) => {
      const bundler = options.getCurrentBundlerName()

      try {
        await zipNode('node-syntax-error', {
          opts: options,
        })

        expect.fail('Bundling should have thrown')
      } catch (error) {
        const { customErrorInfo } = error

        expect(customErrorInfo.type).toBe('functionsBundling')
        expect(customErrorInfo.location.bundler).toBe(bundler === 'esbuild' ? 'esbuild' : 'zisi')
        expect(customErrorInfo.location.functionName).toBe('function')
        expect(customErrorInfo.location.runtime).toBe('js')
      }
    },
  )

  test('Adds `type: "functionsBundling"` to user errors when transpiling esm in nft bundler', async () => {
    try {
      await zipNode('node-esm-top-level-await-error', {
        opts: { config: { '*': { nodeBundler: NodeBundlerType.NFT } } },
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

  test('Returns a list of all modules with dynamic imports in a `nodeModulesWithDynamicImports` property', async () => {
    const fixtureName = 'node-module-dynamic-import'
    const { files } = await zipNode(fixtureName, {
      opts: { basePath: join(FIXTURES_DIR, fixtureName), config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } } },
    })

    expect(files[0].nodeModulesWithDynamicImports).toHaveLength(2)
    expect(files[0].nodeModulesWithDynamicImports).toContain('test-two')
    expect(files[0].nodeModulesWithDynamicImports).toContain('test-three')
  })

  test('Returns an empty list of modules with dynamic imports if the modules are missing a `package.json`', async () => {
    const { files } = await zipNode('node-module-dynamic-import-invalid', {
      opts: { config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } } },
    })

    expect(files[0].nodeModulesWithDynamicImports).toHaveLength(0)
  })

  test('Leaves dynamic imports untouched when the `processDynamicNodeImports` configuration property is `false`', async () => {
    const fixtureName = 'node-module-dynamic-import-template-literal'
    const { tmpDir } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NodeBundlerType.ESBUILD, processDynamicNodeImports: false } },
      },
    })
    const functionSource = await readFile(`${tmpDir}/function.js`, 'utf8')

    /* eslint-disable no-template-curly-in-string */
    expect(functionSource).toMatch('const require1 = require(`./files/${number}.js`);')
    expect(functionSource).toMatch('const require2 = require(`./files/${number}`);')
    expect(functionSource).toMatch('const require3 = require(`./files/${parent.child}`);')
    expect(functionSource).toMatch('const require4 = require(`./files/${arr[0]}`);')
    expect(functionSource).toMatch('const require5 = require(`./files/${number.length > 0 ? number : "uh-oh"}`);')
    /* eslint-enable no-template-curly-in-string */
  })

  test('Adds a runtime shim and includes the files needed for dynamic imports using a template literal', async () => {
    const fixtureName = 'node-module-dynamic-import-template-literal'
    const { files, tmpDir } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${tmpDir}/function.js`)
    const values = func('one')
    const expectedLength = 5

    // eslint-disable-next-line unicorn/new-for-builtins
    expect(values).toEqual(Array(expectedLength).fill(true))
    expect(() => func('two')).toThrow()
    expect(files[0].nodeModulesWithDynamicImports).toHaveLength(0)
  })

  test('Leaves dynamic imports untouched when the files required to resolve the expression cannot be packaged at build time', async () => {
    const fixtureName = 'node-module-dynamic-import-unresolvable'
    const { tmpDir } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } },
      },
    })
    const functionSource = await readFile(`${tmpDir}/function.js`, 'utf8')

    expect(functionSource).toMatch('const require1 = require(number)')
    // eslint-disable-next-line no-template-curly-in-string
    expect(functionSource).toMatch('const require2 = require(`${number}.json`);')
    expect(functionSource).toMatch('const require3 = require(foo(number));')
  })

  test('Adds a runtime shim and includes the files needed for dynamic imports using an expression built with the `+` operator', async () => {
    const fixtureName = 'node-module-dynamic-import-2'
    const { tmpDir } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${tmpDir}/function.js`)

    expect(func('en')[0]).toEqual(['yes', 'no'])
    expect(func('en')[1]).toEqual(['yes', 'no'])
    expect(func('pt')[0]).toEqual(['sim', 'não'])
    expect(func('pt')[1]).toEqual(['sim', 'não'])
    expect(() => func('fr')).toThrow()
  })

  test('The dynamic import runtime shim handles files in nested directories', async () => {
    const fixtureName = 'node-module-dynamic-import-4'
    const { tmpDir } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${tmpDir}/function.js`)

    expect(func('en')[0]).toEqual(['yes', 'no'])
    expect(func('en')[1]).toEqual(['yes', 'no'])
    expect(func('pt')[0]).toEqual(['sim', 'não'])
    expect(func('pt')[1]).toEqual(['sim', 'não'])
    expect(func('nested/es')[0]).toEqual(['sí', 'no'])
    expect(func('nested/es')[1]).toEqual(['sí', 'no'])
    expect(() => func('fr')).toThrow()
  })

  test('The dynamic import runtime shim handles files in nested directories when using `archiveFormat: "none"`', async () => {
    const fixtureName = 'node-module-dynamic-import-4'
    const { tmpDir } = await zipNode(fixtureName, {
      opts: {
        archiveFormat: 'none',
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${tmpDir}/function/function.js`)

    expect(func('en')[0]).toEqual(['yes', 'no'])
    expect(func('en')[1]).toEqual(['yes', 'no'])
    expect(func('pt')[0]).toEqual(['sim', 'não'])
    expect(func('pt')[1]).toEqual(['sim', 'não'])
    expect(func('nested/es')[0]).toEqual(['sí', 'no'])
    expect(func('nested/es')[1]).toEqual(['sí', 'no'])
    expect(() => func('fr')).toThrow()
  })

  test('Negated files in `included_files` are excluded from the bundle even if they match a dynamic import expression', async () => {
    const fixtureName = 'node-module-dynamic-import-2'
    const { tmpDir } = await zipNode(fixtureName, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { includedFiles: ['!lang/en.*'], nodeBundler: NodeBundlerType.ESBUILD } },
      },
    })

    const func = await importFunctionFile(`${tmpDir}/function.js`)

    expect(func('pt')[0]).toEqual(['sim', 'não'])
    expect(func('pt')[1]).toEqual(['sim', 'não'])
    expect(() => func('en')).toThrow()
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
      const { tmpDir } = await zipNode(fixtureName, { opts })

      await expect(`${tmpDir}/function.js`).toPathExist()
      await expect(`${tmpDir}/node_modules/test/index.js`).not.toPathExist()
    },
  )

  test('Creates dynamic import shims for functions with the same name and same shim contents with no naming conflicts', async () => {
    const FUNCTION_COUNT = 30
    const fixtureName = 'node-module-dynamic-import-3'

    const { tmpDir } = await zipNode(fixtureName, {
      length: FUNCTION_COUNT,
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } },
      },
    })

    for (let ind = 1; ind <= FUNCTION_COUNT; ind++) {
      const func = await importFunctionFile(`${tmpDir}/function${ind}.js`)

      expect(func('en')[0]).toEqual(['yes', 'no'])
      expect(func('en')[1]).toEqual(['yes', 'no'])
      expect(func('pt')[0]).toEqual(['sim', 'não'])
      expect(func('pt')[1]).toEqual(['sim', 'não'])
      expect(() => func('fr')).toThrow()
    }
  })

  test('Uses the default Node bundler if no configuration object is supplied', async () => {
    const { files, tmpDir } = await zipNode('local-node-module')
    const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

    expect(requires).toEqual(['test'])
    expect(files[0].bundler).toBe('zisi')
    expect(files[0].config).toEqual({})
  })

  test('Zips Rust function files', async () => {
    const { files, tmpDir } = await zipFixture('rust-simple', { length: 1 })

    expect(files.every(({ runtime }) => runtime === 'rs')).toBe(true)

    await unzipFiles(files)

    const unzippedFile = `${tmpDir}/bootstrap`
    await expect(unzippedFile).toPathExist()

    // The library we use for unzipping does not keep executable permissions.
    // https://github.com/cthackers/adm-zip/issues/86
    // However `chmod()` is not cross-platform
    if (platform === 'linux') {
      await chmod(unzippedFile, EXECUTABLE_PERMISSION)

      const { stdout } = await execa(unzippedFile)
      expect(stdout).toBe('Hello, world!')
    }

    const tcFile = `${tmpDir}/netlify-toolchain`
    await expect(tcFile).toPathExist()
    const tc = await readFile(tcFile, 'utf8')
    expect(tc.trim()).toBe('{"runtime":"rs"}')
  })

  test('Does not zip Go function binaries by default', async () => {
    const { files } = await zipFixture('go-simple', { length: 1 })

    expect(files).toHaveLength(1)
    expect(files[0].runtime).toBe('go')
    expect(files[0].path).not.toMatch(/\.zip$/)
    await expect(files[0].path).toPathExist()
  })

  test('Zips Go function binaries if the `zipGo` config property is set', async () => {
    const fixtureName = 'go-simple'
    const { files, tmpDir } = await zipFixture(fixtureName, {
      length: 1,
      opts: {
        config: {
          '*': {
            zipGo: true,
          },
        },
      },
    })
    const binaryPath = join(FIXTURES_DIR, fixtureName, 'test')
    const binarySha = await computeSha1(binaryPath)
    const [func] = files

    expect(func.runtime).toBe('go')
    expect(func.path.endsWith('.zip')).toBe(true)

    await unzipFiles([func])

    const unzippedBinaryPath = join(tmpDir, 'test')
    const unzippedBinarySha = await computeSha1(unzippedBinaryPath)

    expect(binarySha).toBe(unzippedBinarySha)
  })

  test('Zips Go functions built from source if the `zipGo` config property is set', async () => {
    const mockSource = Math.random().toString()
    vi.mocked(shellUtils.runCommand).mockImplementationOnce(async (...args) => {
      await writeFile(args[1][2], mockSource)

      return {} as any
    })

    const fixtureName = 'go-source'
    const { files, tmpDir } = await zipFixture(fixtureName, {
      opts: {
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

    await unzipFiles([func], (path) => `${path}/../out`)

    const unzippedBinaryPath = join(tmpDir, 'out', 'go-func-1')
    const unzippedBinaryContents = await readFile(unzippedBinaryPath, 'utf8')

    expect(mockSource).toBe(unzippedBinaryContents)
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
        runtime: 'go',
      },
      {
        config: expect.anything(),
        mainFile: join(FIXTURES_DIR, fixtureName, 'go-func-2', 'go-func-2.go'),
        name: 'go-func-2',
        path: expect.anything(),
        runtime: 'go',
      },
    ])

    expect(shellUtils.runCommand).toHaveBeenCalledTimes(2)

    expect(shellUtils.runCommand).toHaveBeenNthCalledWith(
      1,
      'go',
      ['build', '-o', expect.stringMatching(/(\/|\\)go-func-1$/), '-ldflags', '-s -w'],
      expect.objectContaining({
        env: expect.objectContaining({ CGO_ENABLED: '0', GOOS: 'linux' }),
      }),
    )

    expect(shellUtils.runCommand).toHaveBeenNthCalledWith(
      2,
      'go',
      ['build', '-o', expect.stringMatching(/(\/|\\)go-func-2$/), '-ldflags', '-s -w'],
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
    const { files } = await zipFixture('rust-source-multiple', { length: 0 })

    expect(files).toHaveLength(0)
    expect(shellUtils.runCommand).not.toHaveBeenCalled()
  })

  test('Builds Rust functions from source if the `buildRustSource` feature flag is enabled', async () => {
    const targetDirectory = await tmpName({ prefix: `zip-it-test-rust-function-[name]` })
    const tmpDirectory = await tmpName({ prefix: `zip-it-test-` })

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

    expect(files).toHaveLength(2)

    expect(files).toEqual([
      {
        config: expect.anything(),
        mainFile: join(FIXTURES_DIR, fixtureName, 'rust-func-1', 'src', 'main.rs'),
        name: 'rust-func-1',
        path: expect.anything(),
        runtime: 'rs',
        size: 278,
      },
      {
        config: expect.anything(),
        mainFile: join(FIXTURES_DIR, fixtureName, 'rust-func-2', 'src', 'main.rs'),
        name: 'rust-func-2',
        path: expect.anything(),
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
    const { tmpDir } = await zipNode('node-module-and-local-imports', {
      opts: { config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } } },
    })

    await expect(`${tmpDir}/function.js.map`).not.toPathExist()

    const functionSource = await readFile(`${tmpDir}/function.js`, 'utf8')

    expect(functionSource).not.toMatch('sourceMappingURL')
  })

  test.skipIf(platform === 'win32')('Generates a sourcemap if `nodeSourcemap` is set', async () => {
    const { tmpDir } = await zipNode('node-module-and-local-imports', {
      opts: { config: { '*': { nodeBundler: NodeBundlerType.ESBUILD, nodeSourcemap: true } } },
    })
    const sourcemap = await readFile(`${tmpDir}/function.js.map`, 'utf8')
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
      const { tmpDir } = await zipNode(fixtureName, {
        opts,
      })

      const isEven = await importFunctionFile(`${tmpDir}/function.js`)
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
        archiveFormat: 'none',
        basePath,
        config: { '*': { nodeBundler: NodeBundlerType.NFT, nodeSourcemap: true } },
      },
    })
    const func = await importFunctionFile(join(files[0].path, 'function.js'))

    try {
      func.handler()

      expect.fail()
    } catch (error) {
      const filePath = join(files[0].path, 'src', 'tests', 'fixtures', fixtureName, 'function.js')

      // Asserts that the line/column of the error match the position of the
      // original source file, not the transpiled one.
      expect(error.stack).toMatch(`${filePath}:2:9`)
    }
  })

  testMany(
    'Finds in-source config declarations using the `schedule` helper',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const FUNCTIONS_COUNT = 13
      const { files } = await zipFixture(join('in-source-config', 'functions'), {
        opts: options,
        length: FUNCTIONS_COUNT,
      })

      expect(files).toHaveLength(FUNCTIONS_COUNT)

      files.forEach((result) => {
        expect(result.schedule).toBe('@daily')
      })
    },
  )

  testMany(
    'Throws error when `schedule` helper is used but cron expression not found',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const FUNCTIONS_COUNT = 1
      try {
        await zipFixture(join('in-source-config', 'functions_missing_cron_expression'), {
          opts: options,
          length: FUNCTIONS_COUNT,
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
        expect(error.message.startsWith("The `schedule` helper was imported but we couldn't find any usages.")).toBe(
          true,
        )
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
        featureFlags: { project_deploy_configuration_api_use_per_function_configuration_files: true },
      })
      const { files, tmpDir } = await zipFixture([pathInternal, pathNotInternal, pathUser], {
        length: 4,
        opts,
      })

      const func1Entry = files.find(({ name }) => name === 'internal-function')
      const func2Entry = files.find(({ name }) => name === 'root-function')
      const func3Entry = files.find(({ name }) => name === 'user-function')
      const func4Entry = files.find(({ name }) => name === 'not-internal')

      expect(func1Entry?.config.includedFiles).toEqual(['blog/*.md'])
      expect(func2Entry?.config.includedFiles).toEqual(['blog/*.md'])
      expect(func3Entry?.config.includedFiles).toBe(undefined)
      expect(func4Entry?.config.includedFiles).toBe(undefined)

      await unzipFiles(files, (path) => `${path}/../${basename(path)}_out`)

      const functionPaths = [
        join(tmpDir, 'internal-function.zip_out', 'internal-function.js'),
        join(tmpDir, 'root-function.zip_out', 'root-function.js'),
        join(tmpDir, 'user-function.zip_out', 'user-function.js'),
        join(tmpDir, 'not-internal.zip_out', 'not-internal.js'),
      ]
      const func1 = await importFunctionFile(functionPaths[0])
      const func2 = await importFunctionFile(functionPaths[1])
      const func3 = await importFunctionFile(functionPaths[2])
      const func4 = await importFunctionFile(functionPaths[3])

      expect(func1.handler()).toBe(true)
      expect(func2.handler()).toBe(true)
      expect(func3.handler()).toBe(true)
      expect(func4.handler()).toBe(true)

      await expect(`${tmpDir}/internal-function.zip_out/blog/one.md`).toPathExist()
      await expect(`${tmpDir}/root-function.zip_out/blog/one.md`).toPathExist()
      await expect(`${tmpDir}/user-function.zip_out/blog/one.md`).not.toPathExist()
      await expect(`${tmpDir}/not-internal.zip_out/blog/one.md`).not.toPathExist()
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
        featureFlags: { project_deploy_configuration_api_use_per_function_configuration_files: true },
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
        featureFlags: { zisi_detect_esm: true },
      })
      const { files, tmpDir } = await zipFixture(fixtureName, {
        length: 2,
        opts,
      })

      await unzipFiles(files, (path) => `${path}/../${basename(path)}_out`)

      const functionPaths = [
        join(tmpDir, 'my-function-1.zip_out', 'my-function-1.js'),
        join(tmpDir, 'my-function-2.zip_out', 'my-function-2.js'),
      ]
      const func1 = await importFunctionFile(functionPaths[0])
      const func2 = await importFunctionFile(functionPaths[1])

      expect(func1.handler()).toBe(true)
      expect(func2.handler()).toBe(true)
      expect(files[0].config.includedFiles).toBe(undefined)
      expect(files[1].config.includedFiles).toBe(undefined)
      await expect(`${tmpDir}/my-function-1.zip_out/blog/one.md`).not.toPathExist()
    },
  )

  testMany('Ignores function configuration files with malformed JSON', [...allBundleConfigs], async (options) => {
    const fixtureName = 'config-files-malformed-json'
    const fixtureDir = join(FIXTURES_DIR, fixtureName)
    const opts = merge(options, {
      basePath: fixtureDir,
      configFileDirectories: [fixtureDir],
      featureFlags: { zisi_detect_esm: true },
    })
    const { files, tmpDir } = await zipFixture(fixtureName, {
      length: 2,
      opts,
    })

    await unzipFiles(files, (path) => `${path}/../${basename(path)}_out`)

    const functionPaths = [
      join(tmpDir, 'my-function-1.zip_out', 'my-function-1.js'),
      join(tmpDir, 'my-function-2.zip_out', 'my-function-2.js'),
    ]
    const func1 = await importFunctionFile(functionPaths[0])
    const func2 = await importFunctionFile(functionPaths[1])

    expect(func1.handler()).toBe(true)
    expect(func2.handler()).toBe(true)
    expect(files[0].config.includedFiles).toBe(undefined)
    expect(files[1].config.includedFiles).toBe(undefined)
    await expect(`${tmpDir}/my-function-1.zip_out/blog/one.md`).not.toPathExist()
  })

  testMany('None bundler uses files without touching or reading them', ['bundler_none'], async (options) => {
    const { tmpDir, files } = await zipFixture('node-syntax-error', {
      length: 1,
      opts: options,
    })

    await unzipFiles(files)

    const originalFile = await readFile(join(FIXTURES_DIR, 'node-syntax-error/function.js'), 'utf8')
    const bundledFile = await readFile(join(tmpDir, 'function.js'), 'utf8')

    expect(originalFile).toBe(bundledFile)
  })

  testMany('None bundler throws when using ESM on node < 14', ['bundler_none'], async (options) => {
    await expect(() =>
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
    const { files, tmpDir } = await zipFixture('node-esm', {
      length: 2,
      opts: options,
    })

    await unzipFiles(files)

    const originalFile = await readFile(join(FIXTURES_DIR, 'node-esm/func1.js'), 'utf8')
    const bundledFile = await readFile(join(tmpDir, 'func1.js'), 'utf8')

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
      const { files, tmpDir } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      await unzipFiles(files, (path) => `${path}/../${basename(path)}_out`)

      for (let index = 1; index <= length; index++) {
        const funcDir = join(tmpDir, `func${index}.zip_out`)

        // Writing a basic package.json with `type: "module"` just so that we can
        // import the functions from the test.
        await writeFile(join(funcDir, 'package.json'), JSON.stringify({ type: 'module' }))

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
      const { files, tmpDir } = await zipFixture(fixtureName, {
        length,
        opts,
      })

      await unzipFiles(files, (path) => `${path}/../${basename(path)}_out`)

      for (let index = 1; index <= length; index++) {
        const funcDir = join(tmpDir, `func${index}.zip_out`)

        // Writing a basic package.json with `type: "module"` just so that we can
        // import the functions from the test.
        await writeFile(join(funcDir, 'package.json'), JSON.stringify({ type: 'module' }))

        const funcFile = join(funcDir, `func${index}.mjs`)
        const func = await importFunctionFile(funcFile)

        expect(func.handler()).toBe(true)
        expect(await detectEsModule({ mainFile: funcFile })).toBe(true)
      }
    },
  )
})
