const { readFile, chmod, symlink, unlink, rename, stat, writeFile } = require('fs')
const { tmpdir } = require('os')
const { basename, dirname, isAbsolute, join, normalize, resolve, sep } = require('path')
const { arch, env, platform, version: nodeVersion } = require('process')
const { promisify } = require('util')

const test = require('ava')
const cpy = require('cpy')
const merge = require('deepmerge')
const del = require('del')
const execa = require('execa')
const makeDir = require('make-dir')
const pEvery = require('p-every')
const pathExists = require('path-exists')
const semver = require('semver')
const sinon = require('sinon')
const sortOn = require('sort-on')
const { dir: getTmpDir, tmpName } = require('tmp-promise')
const unixify = require('unixify')

require('source-map-support').install()

// We must require this file first because we need to stub it before the main
// functions are required.
// eslint-disable-next-line import/order
const shellUtils = require('../dist/utils/shell')

const shellUtilsStub = sinon.stub(shellUtils, 'runCommand')

// eslint-disable-next-line import/order
const { zipFunction, listFunctions, listFunctionsFiles, listFunction } = require('..')

const { ESBUILD_LOG_LIMIT } = require('../dist/runtimes/node/bundlers/esbuild/bundler')

const { getRequires, zipNode, zipFixture, unzipFiles, zipCheckFunctions, FIXTURES_DIR } = require('./helpers/main')
const { computeSha1 } = require('./helpers/sha')
const { makeTestMany } = require('./helpers/test_many')

const pReadFile = promisify(readFile)
const pChmod = promisify(chmod)
const pSymlink = promisify(symlink)
const pUnlink = promisify(unlink)
const pRename = promisify(rename)
const pStat = promisify(stat)
const pWriteFile = promisify(writeFile)

const EXECUTABLE_PERMISSION = 0o755

const normalizeFiles = function (fixtureDir, { name, mainFile, runtime, extension, srcFile, schedule }) {
  const mainFileA = normalize(`${fixtureDir}/${mainFile}`)
  const srcFileA = srcFile === undefined ? {} : { srcFile: normalize(`${fixtureDir}/${srcFile}`) }
  return { name, mainFile: mainFileA, runtime, extension, schedule, ...srcFileA }
}

const getZipChecksum = async function (t, bundler) {
  const {
    files: [{ path }],
  } = await zipFixture(t, 'many-dependencies', { opts: { config: { '*': { nodeBundler: bundler } } } })
  const sha1sum = computeSha1(path)
  return sha1sum
}

test.after.always(async () => {
  if (env.ZISI_KEEP_TEMP_DIRS === undefined) {
    await del(`${tmpdir()}/zip-it-test-bundler-*`, { force: true })
  }
})

test.afterEach(() => {
  shellUtilsStub.resetHistory()
})

// Convenience method for running a test for multiple variations.
const testMany = makeTestMany(test, {
  bundler_default: {
    config: { '*': { nodeBundler: undefined } },
  },
  bundler_default_nft: {
    config: { '*': { nodeBundler: undefined } },
    featureFlags: { traceWithNft: true },
  },
  bundler_esbuild: {
    config: { '*': { nodeBundler: 'esbuild' } },
  },
  bundler_esbuild_zisi: {
    config: { '*': { nodeBundler: 'esbuild_zisi' } },
  },
  bundler_nft: {
    config: { '*': { nodeBundler: 'nft' } },
  },
})

const getNodeBundlerString = (variation) => {
  switch (variation) {
    case 'bundler_esbuild':
    case 'bundler_esbuild_zisi':
      return 'esbuild'

    case 'bundler_nft':
    case 'bundler_default_nft':
      return 'nft'

    default:
      return 'zisi'
  }
}

testMany(
  'Zips Node.js function files',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'simple'
    const { files } = await zipNode(t, fixtureName, { opts: options })

    t.is(files.length, 1)
    t.is(files[0].runtime, 'js')
    t.is(files[0].mainFile, join(FIXTURES_DIR, fixtureName, 'function.js'))
  },
)

testMany(
  'Handles Node module with native bindings (buildtime marker module)',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const bundler = options.config['*'].nodeBundler
    const fixtureDir = 'node-module-native-buildtime'
    const { files, tmpDir } = await zipNode(t, fixtureDir, {
      opts: options,
    })
    const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })
    const normalizedRequires = new Set(requires.map(unixify))

    t.is(files.length, 1)
    t.is(files[0].runtime, 'js')

    const moduleWithNodeFile = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/module-with-node-file`)
    t.true(await pathExists(`${tmpDir}/node_modules/module-with-node-file/native.node`))
    t.true(await pathExists(`${tmpDir}/node_modules/module-with-node-file/side-file.js`))
    t.true(normalizedRequires.has('module-with-node-file'))

    const moduleWithNodeGypPath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/module-with-node-gyp`)
    t.true(await pathExists(`${tmpDir}/node_modules/module-with-node-gyp/native.node`))
    t.true(await pathExists(`${tmpDir}/node_modules/module-with-node-gyp/side-file.js`))
    t.true(normalizedRequires.has('module-with-node-gyp'))

    const moduleWithPrebuildPath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/module-with-prebuild`)
    t.true(await pathExists(`${tmpDir}/node_modules/module-with-prebuild/native.node`))
    t.true(await pathExists(`${tmpDir}/node_modules/module-with-prebuild/side-file.js`))
    t.true(normalizedRequires.has('module-with-prebuild'))

    // We can only detect native modules when using esbuild.
    if (bundler === 'esbuild' || bundler === 'esbuild_zisi') {
      t.deepEqual(files[0].nativeNodeModules, {
        'module-with-node-file': { [moduleWithNodeFile]: '3.0.0' },
        'module-with-node-gyp': { [moduleWithNodeGypPath]: '1.0.0' },
        'module-with-prebuild': { [moduleWithPrebuildPath]: '2.0.0' },
      })
    }
  },
)

testMany(
  'Handles Node module with native bindings (runtime marker module)',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const bundler = options.config['*'].nodeBundler
    const fixtureDir = 'node-module-native-runtime'
    const { files, tmpDir } = await zipNode(t, fixtureDir, {
      opts: options,
    })
    const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })
    const normalizedRequires = new Set(requires.map(unixify))
    const modulePath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/test`)

    t.is(files.length, 1)
    t.is(files[0].runtime, 'js')
    t.true(await pathExists(`${tmpDir}/node_modules/test/native.node`))
    t.true(await pathExists(`${tmpDir}/node_modules/test/side-file.js`))
    t.true(normalizedRequires.has('test'))

    // We can only detect native modules when using esbuild.
    if (bundler === 'esbuild' || bundler === 'esbuild_zisi') {
      t.deepEqual(files[0].nativeNodeModules, { test: { [modulePath]: '1.0.0' } })
    }
  },
)

testMany(
  'Can require node modules',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'local-node-module', { opts: options })
  },
)

testMany(
  'Can require deep paths in node modules',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { tmpDir } = await zipNode(t, 'local-node-module-deep-require', {
      opts: options,
    })

    const func = require(`${tmpDir}/function.js`)

    t.deepEqual(func, { mock: { stack: 'jam' }, stack: 'jam' })
  },
)

testMany(
  'Can require Node modules with destructuring expressions',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, `local-node-module-destructure-require`, {
      opts: options,
    })
  },
)

testMany(
  'Can require scoped node modules',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-scope', { opts: options })
  },
)

testMany(
  'Can require node modules nested files',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-path', { opts: options })
  },
)

testMany(
  'Can require dynamically generated node modules',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'side-module', { opts: options })
  },
)

testMany(
  'Ignore some excluded node modules',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'node-module-excluded'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    const { tmpDir } = await zipNode(t, fixtureName, { opts })

    t.false(await pathExists(`${tmpDir}/node_modules/aws-sdk`))

    try {
      const func = require(`${tmpDir}/function.js`)

      func()

      t.fail('Running the function should fail due to the missing module')
    } catch (error) {
      t.is(error.code, 'MODULE_NOT_FOUND')
    }
  },
)

testMany(
  'Ignore TypeScript types',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { tmpDir } = await zipNode(t, 'node-module-typescript-types', {
      opts: options,
    })
    t.false(await pathExists(`${tmpDir}/node_modules/@types/node`))
  },
)

testMany(
  'Throws on runtime errors',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await t.throwsAsync(zipNode(t, 'node-module-error', { opts: options }))
  },
)

testMany(
  'Throws on missing dependencies',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await t.throwsAsync(zipNode(t, 'node-module-missing', { opts: options }))
  },
)

testMany(
  'Throws on missing dependencies with no optionalDependencies',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await t.throwsAsync(zipNode(t, 'node-module-missing-package', { opts: options }))
  },
)

testMany(
  'Throws on missing conditional dependencies',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await t.throwsAsync(zipNode(t, 'node-module-missing-conditional', { opts: options }))
  },
)

testMany(
  "Throws on missing dependencies' dependencies",
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await t.throwsAsync(zipNode(t, 'node-module-missing-deep', { opts: options }))
  },
)

testMany(
  'Ignore missing optional dependencies',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-missing-optional', { opts: options })
  },
)

testMany(
  'Ignore modules conditional dependencies',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-deep-conditional', { opts: options })
  },
)

testMany(
  'Ignore missing optional peer dependencies',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-peer-optional', { opts: options })
  },
)

testMany(
  'Throws on missing optional peer dependencies with no peer dependencies',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await t.throwsAsync(zipNode(t, 'node-module-peer-optional-none', { opts: options }))
  },
)

testMany(
  'Throws on missing non-optional peer dependencies',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await t.throwsAsync(zipNode(t, 'node-module-peer-not-optional', { opts: options }))
  },
)

testMany(
  'Resolves dependencies from .netlify/plugins/node_modules when using `zipFunctions()`',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-next-image', { opts: options })
  },
)

testMany(
  'Resolves dependencies from .netlify/plugins/node_modules when using `zipFunction()`',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
    const mainFile = join(FIXTURES_DIR, 'node-module-next-image', 'function', 'function.js')
    const result = await zipFunction(mainFile, tmpDir, options)

    await unzipFiles([result])

    const func = require(join(tmpDir, 'function.js'))

    t.true(func)
  },
)

// We persist `package.json` as `package.json.txt` in git. Otherwise ESLint
// tries to load when linting sibling JavaScript files. In this test, we
// temporarily rename it to an actual `package.json`.
testMany(
  'Throws on invalid package.json',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi'],
  async (options, t) => {
    const fixtureDir = await tmpName({ prefix: 'zip-it-test' })
    await cpy('**', `${fixtureDir}/invalid-package-json`, {
      cwd: `${FIXTURES_DIR}/invalid-package-json`,
      parents: true,
    })

    const invalidPackageJsonDir = `${fixtureDir}/invalid-package-json`
    const srcPackageJson = `${invalidPackageJsonDir}/package.json.txt`
    const distPackageJson = `${invalidPackageJsonDir}/package.json`

    await pRename(srcPackageJson, distPackageJson)
    try {
      await t.throwsAsync(zipNode(t, 'invalid-package-json', { opts: options, fixtureDir }), {
        message: /(invalid JSON|package.json:1:1: error: Expected string but found "{")/,
      })
    } finally {
      await pRename(distPackageJson, srcPackageJson)
    }
  },
)

testMany(
  'Ignore invalid require()',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'invalid-require', { opts: options })
  },
)

testMany('Can use dynamic import() with esbuild', ['bundler_esbuild'], async (options, t) => {
  await zipNode(t, 'dynamic-import', { opts: options })
})

testMany(
  'Can require local files',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'local-require', { opts: options })
  },
)

testMany(
  'Can bundle functions with `.js` extension using ES Modules',
  ['bundler_esbuild', 'bundler_nft'],
  async (options, t) => {
    const length = 4
    const fixtureName = 'local-require-esm'
    const opts = merge(options, {
      basePath: `${FIXTURES_DIR}/${fixtureName}`,
      featureFlags: { defaultEsModulesToEsbuild: false },
    })
    const { files, tmpDir } = await zipFixture(t, 'local-require-esm', {
      length,
      opts,
    })

    await unzipFiles(files, (path) => `${path}/../${basename(path)}_out`)

    const func1 = () => require(join(tmpDir, 'function.zip_out', 'function.js'))
    const func2 = () => require(join(tmpDir, 'function_cjs.zip_out', 'function_cjs.js'))
    const func3 = () => require(join(tmpDir, 'function_export_only.zip_out', 'function_export_only.js'))
    const func4 = () => require(join(tmpDir, 'function_import_only.zip_out', 'function_import_only.js'))

    // Dynamic imports are not supported in Node <13.2.0.
    if (semver.gte(nodeVersion, '13.2.0')) {
      t.is(await func2()(), 0)
    }

    t.is(func1().ZERO, 0)
    t.is(typeof func3().howdy, 'string')
    t.deepEqual(func4(), {})
  },
)

testMany(
  'Can bundle functions with `.js` extension using ES Modules when `archiveType` is `none`',
  ['bundler_esbuild', 'bundler_nft'],
  async (options, t) => {
    const length = 4
    const fixtureName = 'local-require-esm'
    const opts = merge(options, {
      archiveFormat: 'none',
      basePath: `${FIXTURES_DIR}/${fixtureName}`,
      featureFlags: { defaultEsModulesToEsbuild: false },
    })
    const { tmpDir } = await zipFixture(t, 'local-require-esm', {
      length,
      opts,
    })

    const func1 = () => require(join(tmpDir, 'function', 'function.js'))
    const func2 = () => require(join(tmpDir, 'function_cjs', 'function_cjs.js'))
    const func3 = () => require(join(tmpDir, 'function_export_only', 'function_export_only.js'))
    const func4 = () => require(join(tmpDir, 'function_import_only', 'function_import_only.js'))

    // Dynamic imports are not supported in Node <13.2.0.
    if (semver.gte(nodeVersion, '13.2.0')) {
      t.is(await func2()(), 0)
    }

    t.is(func1().ZERO, 0)
    t.is(typeof func3().howdy, 'string')
    t.deepEqual(func4(), {})
  },
)

testMany(
  'Can bundle CJS functions that import ESM files with an `import()` expression',
  ['bundler_esbuild', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'node-cjs-importing-mjs'
    const { files, tmpDir } = await zipFixture(t, fixtureName, {
      opts: options,
    })

    await unzipFiles(files)

    const func = require(join(tmpDir, 'function.js'))

    // Dynamic imports were added in Node v13.2.0.
    if (semver.gte(nodeVersion, '13.2.0')) {
      const { body, statusCode } = await func.handler()

      t.is(body, 'Hello world')
      t.is(statusCode, 200)
    }
  },
)

testMany(
  'Can require local files deeply',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'local-deep-require', { opts: options })
  },
)

testMany(
  'Can require local files in the parent directories',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'local-parent-require', { opts: options })
  },
)

testMany(
  'Ignore missing critters dependency for Next.js 10',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-next10-critters', { opts: options })
  },
)

testMany(
  'Ignore missing critters dependency for Next.js exact version 10.0.5',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-next10-critters-exact', { opts: options })
  },
)

testMany(
  'Ignore missing critters dependency for Next.js with range ^10.0.5',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-next10-critters-10.0.5-range', {
      opts: options,
    })
  },
)

testMany(
  "Ignore missing critters dependency for Next.js with version='latest'",
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'node-module-next10-critters-latest', { opts: options })
  },
)

// Need to create symlinks dynamically because they sometimes get lost when
// committed on Windows
if (platform !== 'win32') {
  testMany(
    'Can require symlinks',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options, t) => {
      const fixtureDir = await tmpName({ prefix: 'zip-it-test' })
      const opts = merge(options, {
        basePath: `${fixtureDir}/symlinks`,
      })
      await cpy('**', `${fixtureDir}/symlinks`, {
        cwd: `${FIXTURES_DIR}/symlinks`,
        parents: true,
      })

      const symlinkDir = `${fixtureDir}/symlinks/function`
      const symlinkFile = `${symlinkDir}/file.js`
      const targetFile = `${symlinkDir}/target.js`

      if (!(await pathExists(symlinkFile))) {
        await pSymlink(targetFile, symlinkFile)
      }

      try {
        await zipNode(t, 'symlinks', { opts, fixtureDir })
      } finally {
        await pUnlink(symlinkFile)
      }
    },
  )
}

testMany(
  'Can target a directory with a main file with the same name',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'directory-handler'
    const { files } = await zipNode(t, fixtureName, { opts: options })

    t.is(files[0].mainFile, join(FIXTURES_DIR, fixtureName, 'function', 'function.js'))
  },
)

testMany(
  'Can target a directory with an index.js file',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'index-handler'
    const { files, tmpDir } = await zipFixture(t, fixtureName, {
      opts: options,
    })
    await unzipFiles(files)
    t.true(require(`${tmpDir}/function.js`))
    t.is(files[0].mainFile, join(FIXTURES_DIR, fixtureName, 'function', 'index.js'))
  },
)

testMany(
  'Keeps non-required files inside the target directory',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { tmpDir } = await zipNode(t, 'keep-dir-files', { opts: options })
    t.true(await pathExists(`${tmpDir}/function.js`))
  },
)

testMany(
  'Ignores non-required node_modules inside the target directory',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { tmpDir } = await zipNode(t, 'ignore-dir-node-modules', {
      opts: options,
    })
    t.false(await pathExists(`${tmpDir}/node_modules`))
  },
)

testMany(
  'Ignores deep non-required node_modules inside the target directory',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { tmpDir } = await zipNode(t, 'ignore-deep-dir-node-modules', {
      opts: options,
    })
    t.false(await pathExists(`${tmpDir}/deep/node_modules`))
  },
)

testMany(
  'Works with many dependencies',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'many-dependencies', { opts: options })
  },
)

testMany(
  'Works with many function files',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const names = new Set(['one', 'two', 'three', 'four', 'five', 'six'])
    const { files } = await zipNode(t, 'many-functions', {
      opts: options,
      length: TEST_FUNCTIONS_LENGTH,
    })

    files.forEach(({ name }) => {
      t.true(names.has(name))
    })
  },
)

const TEST_FUNCTIONS_LENGTH = 6

testMany(
  'Produces deterministic checksums',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const bundler = options.config['*'].nodeBundler
    const [checksumOne, checksumTwo] = await Promise.all([getZipChecksum(t, bundler), getZipChecksum(t, bundler)])
    t.is(checksumOne, checksumTwo)
  },
)

testMany(
  'Throws when the source folder does not exist',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await t.throwsAsync(zipNode(t, 'does-not-exist', { opts: options }), {
      message: /Functions folder does not exist/,
    })
  },
)

testMany(
  'Works even if destination folder does not exist',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'simple', { opts: options })
  },
)

testMany(
  'Do not consider node_modules as a function file',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'ignore-node-modules', { opts: options })
  },
)

testMany(
  'Ignore directories without a main file',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'ignore-directories', { opts: options })
  },
)

testMany(
  'Remove useless files',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { tmpDir } = await zipNode(t, 'useless', { opts: options })
    t.false(await pathExists(`${tmpDir}/Desktop.ini`))
  },
)

testMany(
  'Works on empty directories',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipNode(t, 'empty', { opts: options, length: 0 })
  },
)

testMany(
  'Works when no package.json is present',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const fixtureDir = await tmpName({ prefix: 'zip-it-test' })
    const opts = merge(options, {
      basePath: fixtureDir,
    })
    await cpy('**', `${fixtureDir}/no-package-json`, { cwd: `${FIXTURES_DIR}/no-package-json`, parents: true })
    await zipNode(t, 'no-package-json', { opts, length: 1, fixtureDir })
  },
)

testMany(
  'Copies already zipped files',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const tmpDir = await tmpName({ prefix: 'zip-it-test' })
    const { files } = await zipCheckFunctions(t, 'keep-zip', { tmpDir })

    t.true(files.every(({ runtime }) => runtime === 'js'))
    t.true(
      await pEvery(files, async ({ path }) => {
        const fileContents = await pReadFile(path, 'utf8')
        return fileContents.trim() === 'test'
      }),
    )
  },
)

testMany(
  'Ignore unsupported programming languages',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    await zipFixture(t, 'unsupported', { length: 0, opts: options })
  },
)

testMany(
  'Can reduce parallelism',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const opts = merge(options, { parallelLimit: 1 })

    await zipNode(t, 'simple', { length: 1, opts })
  },
)

testMany(
  'Can use zipFunction()',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t, variation) => {
    const bundler = options.config['*'].nodeBundler
    const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
    const mainFile = join(FIXTURES_DIR, 'simple', 'function.js')
    const result = await zipFunction(mainFile, tmpDir, options)
    const bundlerUsed = getNodeBundlerString(variation)

    t.is(result.name, 'function')
    t.is(result.runtime, 'js')
    t.is(result.bundler, bundlerUsed)
    t.is(result.mainFile, mainFile)
    t.deepEqual(result.config, bundler === undefined ? {} : { nodeBundler: bundlerUsed })
  },
)

test('Can list function main files with listFunctions()', async (t) => {
  const fixtureDir = `${FIXTURES_DIR}/list`
  const functions = await listFunctions(fixtureDir)
  t.deepEqual(
    functions,
    [
      { schedule: undefined, name: 'test', mainFile: 'test.zip', runtime: 'js', extension: '.zip' },
      { schedule: undefined, name: 'test', mainFile: 'test.js', runtime: 'js', extension: '.js' },
      { schedule: undefined, name: 'five', mainFile: 'five/index.ts', runtime: 'js', extension: '.ts' },
      { schedule: undefined, name: 'four', mainFile: 'four.js/four.js.js', runtime: 'js', extension: '.js' },
      { schedule: undefined, name: 'one', mainFile: 'one/index.js', runtime: 'js', extension: '.js' },
      { schedule: undefined, name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.js' },
      { schedule: undefined, name: 'test', mainFile: 'test', runtime: 'go', extension: '' },
    ].map(normalizeFiles.bind(null, fixtureDir)),
  )
})

test('Can list function main files from multiple source directories with listFunctions()', async (t) => {
  const fixtureDir = `${FIXTURES_DIR}/multiple-src-directories`
  const functions = await listFunctions([
    join(fixtureDir, '.netlify', 'internal-functions'),
    join(fixtureDir, 'netlify', 'functions'),
  ])

  t.deepEqual(
    functions,
    [
      {
        schedule: undefined,
        name: 'function',
        mainFile: '.netlify/internal-functions/function.js',
        runtime: 'js',
        extension: '.js',
      },
      {
        schedule: undefined,
        name: 'function_internal',
        mainFile: '.netlify/internal-functions/function_internal.js',
        runtime: 'js',
        extension: '.js',
      },
      {
        schedule: undefined,
        name: 'function',
        mainFile: 'netlify/functions/function.js',
        runtime: 'js',
        extension: '.js',
      },
      {
        schedule: undefined,
        name: 'function_user',
        mainFile: 'netlify/functions/function_user.js',
        runtime: 'js',
        extension: '.js',
      },
    ].map(normalizeFiles.bind(null, fixtureDir)),
  )
})

testMany(
  'Can list all function files with listFunctionsFiles()',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const fixtureDir = `${FIXTURES_DIR}/list`
    const opts = merge(options, {
      basePath: fixtureDir,
    })
    const bundler = options.config['*'].nodeBundler
    const files = await listFunctionsFiles(fixtureDir, opts)
    const sortedFiles = sortOn(files, ['mainFile', 'srcFile'])
    const expectedFiles = [
      {
        name: 'five',
        mainFile: 'five/index.ts',
        runtime: 'js',
        extension: '.ts',
        schedule: undefined,
        srcFile: 'five/index.ts',
      },

      bundler === 'nft' && {
        name: 'five',
        mainFile: 'five/index.ts',
        runtime: 'js',
        extension: '.ts',
        srcFile: 'five/util.ts',
        schedule: undefined,
      },

      {
        name: 'four',
        mainFile: 'four.js/four.js.js',
        runtime: 'js',
        extension: '.js',
        srcFile: 'four.js/four.js.js',
        schedule: undefined,
      },
      {
        name: 'one',
        mainFile: 'one/index.js',
        runtime: 'js',
        extension: '.js',
        schedule: undefined,
        srcFile: 'one/index.js',
      },
      { name: 'test', mainFile: 'test', runtime: 'go', extension: '', schedule: undefined, srcFile: 'test' },
      { name: 'test', mainFile: 'test.js', runtime: 'js', extension: '.js', schedule: undefined, srcFile: 'test.js' },
      {
        name: 'test',
        mainFile: 'test.zip',
        runtime: 'js',
        extension: '.zip',
        schedule: undefined,
        srcFile: 'test.zip',
      },

      (bundler === undefined || bundler === 'nft') && {
        name: 'two',
        mainFile: 'two/two.js',
        runtime: 'js',
        extension: '.json',
        schedule: undefined,
        srcFile: 'two/three.json',
      },

      {
        name: 'two',
        mainFile: 'two/two.js',
        runtime: 'js',
        extension: '.js',
        schedule: undefined,
        srcFile: 'two/two.js',
      },
    ]
      .filter(Boolean)
      .map(normalizeFiles.bind(null, fixtureDir))

    t.deepEqual(sortedFiles, sortOn(expectedFiles, ['mainFile', 'srcFile']))
  },
)

testMany(
  'Can list all function files from multiple source directorires with listFunctionsFiles()',
  ['bundler_esbuild', 'bundler_default', 'bundler_nft'],
  // eslint-disable-next-line complexity
  async (options, t) => {
    const fixtureDir = `${FIXTURES_DIR}/multiple-src-directories`
    const opts = merge(options, {
      basePath: fixtureDir,
    })
    const bundler = options.config['*'].nodeBundler
    const functions = await listFunctionsFiles(
      [join(fixtureDir, '.netlify', 'internal-functions'), join(fixtureDir, 'netlify', 'functions')],
      opts,
    )
    const sortedFunctions = sortOn(functions, 'mainFile')
    const shouldInlineFiles = bundler === 'esbuild_zisi' || bundler === 'esbuild'

    t.deepEqual(
      sortedFunctions,
      sortOn(
        [
          {
            name: 'function',
            mainFile: '.netlify/internal-functions/function.js',
            runtime: 'js',
            extension: '.js',
            srcFile: '.netlify/internal-functions/function.js',
          },

          !shouldInlineFiles && {
            name: 'function',
            mainFile: '.netlify/internal-functions/function.js',
            runtime: 'js',
            extension: '.js',
            srcFile: 'node_modules/test/index.js',
          },

          !shouldInlineFiles && {
            name: 'function',
            mainFile: '.netlify/internal-functions/function.js',
            runtime: 'js',
            extension: '.json',
            srcFile: 'node_modules/test/package.json',
          },

          {
            name: 'function_internal',
            mainFile: '.netlify/internal-functions/function_internal.js',
            runtime: 'js',
            extension: '.js',
            srcFile: '.netlify/internal-functions/function_internal.js',
          },

          !shouldInlineFiles && {
            name: 'function_internal',
            mainFile: '.netlify/internal-functions/function_internal.js',
            runtime: 'js',
            extension: '.js',
            srcFile: 'node_modules/test/index.js',
          },

          !shouldInlineFiles && {
            name: 'function_internal',
            mainFile: '.netlify/internal-functions/function_internal.js',
            runtime: 'js',
            extension: '.json',
            srcFile: 'node_modules/test/package.json',
          },

          {
            name: 'function',
            mainFile: 'netlify/functions/function.js',
            runtime: 'js',
            extension: '.js',
            srcFile: 'netlify/functions/function.js',
          },

          !shouldInlineFiles && {
            name: 'function',
            mainFile: 'netlify/functions/function.js',
            runtime: 'js',
            extension: '.js',
            srcFile: 'node_modules/test/index.js',
          },

          !shouldInlineFiles && {
            name: 'function',
            mainFile: 'netlify/functions/function.js',
            runtime: 'js',
            extension: '.json',
            srcFile: 'node_modules/test/package.json',
          },

          {
            name: 'function_user',
            mainFile: 'netlify/functions/function_user.js',
            runtime: 'js',
            extension: '.js',
            srcFile: 'netlify/functions/function_user.js',
          },

          !shouldInlineFiles && {
            name: 'function_user',
            mainFile: 'netlify/functions/function_user.js',
            runtime: 'js',
            extension: '.js',
            srcFile: 'node_modules/test/index.js',
          },

          !shouldInlineFiles && {
            name: 'function_user',
            mainFile: 'netlify/functions/function_user.js',
            runtime: 'js',
            extension: '.json',
            srcFile: 'node_modules/test/package.json',
          },
        ],
        'mainFile',
      )
        .filter(Boolean)
        .map(normalizeFiles.bind(null, fixtureDir)),
    )
  },
)

testMany('Zips node modules', ['bundler_default', 'bundler_nft'], async (options, t) => {
  await zipNode(t, 'node-module', { opts: options })
})

testMany('Include most files from node modules', ['bundler_default'], async (options, t) => {
  const fixtureName = 'node-module-included'
  const opts = merge(options, {
    basePath: join(FIXTURES_DIR, fixtureName),
  })
  const { tmpDir } = await zipNode(t, 'node-module-included', { opts })
  const [mapExists, htmlExists] = await Promise.all([
    pathExists(`${tmpDir}/node_modules/test/test.map`),
    pathExists(`${tmpDir}/node_modules/test/test.html`),
  ])
  t.false(mapExists)
  t.true(htmlExists)
})

testMany('Throws on missing critters dependency for Next.js 9', ['bundler_default'], async (options, t) => {
  await t.throwsAsync(zipNode(t, 'node-module-next9-critters', { opts: options }))
})

testMany(
  'Includes specific Next.js dependencies when using next-on-netlify',
  ['bundler_default'],
  async (options, t) => {
    const { tmpDir } = await zipNode(t, 'node-module-next-on-netlify', {
      opts: options,
    })
    const [constantsExists, semverExists, otherExists, indexExists] = await Promise.all([
      pathExists(`${tmpDir}/node_modules/next/dist/next-server/lib/constants.js`),
      pathExists(`${tmpDir}/node_modules/next/dist/compiled/semver.js`),
      pathExists(`${tmpDir}/node_modules/next/dist/other.js`),
      pathExists(`${tmpDir}/node_modules/next/index.js`),
    ])
    t.true(constantsExists)
    t.true(semverExists)
    t.false(otherExists)
    t.false(indexExists)
  },
)

testMany(
  'Includes all Next.js dependencies when not using next-on-netlify',
  ['bundler_default'],
  async (options, t) => {
    const { tmpDir } = await zipNode(t, 'node-module-next', { opts: options })
    const [constantsExists, semverExists, otherExists, indexExists] = await Promise.all([
      pathExists(`${tmpDir}/node_modules/next/dist/next-server/lib/constants.js`),
      pathExists(`${tmpDir}/node_modules/next/dist/compiled/semver.js`),
      pathExists(`${tmpDir}/node_modules/next/dist/other.js`),
      pathExists(`${tmpDir}/node_modules/next/index.js`),
    ])
    t.true(constantsExists)
    t.true(semverExists)
    t.true(otherExists)
    t.true(indexExists)
  },
)

testMany('Inlines node modules in the bundle', ['bundler_esbuild'], async (options, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
    opts: options,
  })
  const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

  t.false(requires.includes('test'))
  t.false(await pathExists(`${tmpDir}/node_modules/test`))
})

testMany(
  'Does not inline node modules and includes them in a `node_modules` directory if they are defined in `externalNodeModules`',
  ['bundler_esbuild'],
  async (options, t) => {
    const opts = merge(options, {
      config: {
        function: {
          externalNodeModules: ['test'],
        },
      },
    })
    const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
      opts,
    })
    const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

    t.true(requires.includes('test'))
    t.true(await pathExists(`${tmpDir}/node_modules/test`))
  },
)

testMany(
  'Does not inline node modules and excludes them from the bundle if they are defined in `ignoredNodeModules`',
  ['bundler_esbuild'],
  async (options, t) => {
    const opts = merge(options, {
      config: {
        function: {
          ignoredNodeModules: ['test'],
        },
      },
    })
    const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
      opts,
    })
    const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

    t.true(requires.includes('test'))
    t.false(await pathExists(`${tmpDir}/node_modules/test`))
  },
)

testMany(
  'Include most files from node modules present in `externalNodeModules`',
  ['bundler_esbuild'],
  async (options, t) => {
    const opts = merge(options, {
      config: {
        function: {
          externalNodeModules: ['test'],
        },
      },
    })
    const { tmpDir } = await zipNode(t, 'node-module-included', {
      opts,
    })
    const [mapExists, htmlExists] = await Promise.all([
      pathExists(`${tmpDir}/node_modules/test/test.map`),
      pathExists(`${tmpDir}/node_modules/test/test.html`),
    ])
    t.false(mapExists)
    t.true(htmlExists)
  },
)

testMany(
  'Does not throw if one of the modules defined in `externalNodeModules` does not exist',
  ['bundler_esbuild'],
  async (options, t) => {
    const opts = merge(options, {
      config: {
        function: {
          externalNodeModules: ['i-do-not-exist'],
        },
      },
    })
    const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
      opts,
    })

    t.false(await pathExists(`${tmpDir}/node_modules/i-do-not-exist`))
  },
)

testMany(
  'Exposes the main export of `node-fetch` when imported using `require()`',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-fetch', { opts: options })
    await unzipFiles(files)
    t.true(typeof require(`${tmpDir}/function.js`) === 'function')
  },
)

testMany(
  '{name}/{name}.js takes precedence over {name}.js and {name}/index.js',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'conflicting-names-1', {
      opts: options,
    })
    await unzipFiles(files)
    t.is(require(`${tmpDir}/function.js`), 'function-js-file-in-directory')
  },
)

testMany(
  '{name}/index.js takes precedence over {name}.js',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'conflicting-names-2', {
      opts: options,
    })
    await unzipFiles(files)
    t.is(require(`${tmpDir}/function.js`), 'index-js-file-in-directory')
  },
)

testMany(
  '{name}/index.js takes precedence over {name}/index.ts',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'conflicting-names-3', {
      opts: options,
    })
    await unzipFiles(files)
    t.is(require(`${tmpDir}/function.js`).type, 'index-js-file-in-directory')
  },
)

testMany(
  '{name}.js takes precedence over {name}.ts',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'conflicting-names-4', {
      opts: options,
    })
    await unzipFiles(files)
    t.is(require(`${tmpDir}/function.js`).type, 'function-js-file')
  },
)

testMany(
  '{name}.js takes precedence over {name}.zip',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'conflicting-names-5', {
      opts: options,
    })
    await unzipFiles(files)
    t.is(require(`${tmpDir}/function.js`).type, 'function-js-file')
  },
)

testMany(
  'Handles a TypeScript function ({name}.ts)',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript', {
      opts: options,
    })
    await unzipFiles(files)
    t.true(typeof require(`${tmpDir}/function.js`).type === 'string')
  },
)

testMany(
  'Handles a TypeScript function ({name}/{name}.ts)',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-directory-1', {
      opts: options,
    })
    await unzipFiles(files)
    t.true(typeof require(`${tmpDir}/function.js`).type === 'string')
  },
)

testMany(
  'Handles a TypeScript function ({name}/index.ts)',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-directory-2', {
      opts: options,
    })
    await unzipFiles(files)
    t.true(typeof require(`${tmpDir}/function.js`).type === 'string')
  },
)

testMany(
  'Handles a TypeScript function with imports',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-with-imports', {
      opts: options,
    })
    await unzipFiles(files)
    t.true(typeof require(`${tmpDir}/function.js`).type === 'string')
  },
)

testMany(
  'Handles a JavaScript function ({name}.mjs, {name}/{name}.mjs, {name}/index.mjs)',
  ['bundler_esbuild', 'bundler_default'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-mjs', {
      length: 3,
      opts: options,
    })

    await unzipFiles(files)

    t.is(files.length, 3)
    files.forEach((file) => {
      t.is(file.bundler, 'esbuild')
    })

    t.true(require(`${tmpDir}/func1.js`).handler())
    t.true(require(`${tmpDir}/func2.js`).handler())
    t.true(require(`${tmpDir}/func3.js`).handler())
  },
)

testMany(
  'Loads a tsconfig.json placed in the same directory as the function',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-tsconfig-sibling', {
      opts: options,
    })
    await unzipFiles(files)
    t.true(require(`${tmpDir}/function.js`).value)
  },
)

testMany(
  'Loads a tsconfig.json placed in a parent directory',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'todo:bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-tsconfig-parent/functions', {
      opts: options,
    })
    await unzipFiles(files)
    t.true(require(`${tmpDir}/function.js`).value)
  },
)

testMany(
  'Respects the target defined in the config over a `target` property defined in tsconfig',
  ['bundler_esbuild', 'bundler_default', 'todo:bundler_nft'],
  async (options, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-tsconfig-target/functions', {
      opts: options,
    })
    await unzipFiles(files)

    const result = require(`${tmpDir}/function.js`)

    // We want to assert that the `target` specified in the tsconfig file (es5)
    // was overridden by our own target. It's not easy to assert that without
    // parsing the generated file, and evem then we're subject to failures due
    // to internal changes in esbuild. The best we can do here is assert that
    // the bundling was successful and the return values are what we expect,
    // because the bundling should fail if the ES5 target is being used, since
    // esbuild can't currently transpile object destructuring down to ES5.
    t.is(result.foo, true)
    t.is(result.bar, false)
    t.deepEqual(result.others, { baz: true })
  },
)

test('Limits the amount of log lines produced by esbuild', async (t) => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const binaryPath = resolve(__dirname, '../dist/bin.js')
  const fixturePath = join(FIXTURES_DIR, 'esbuild-log-limit')

  try {
    await execa('node', [binaryPath, fixturePath, tmpDir, `--config.*.nodeBundler=esbuild`])

    t.fail('Bundling should have thrown')
  } catch (error) {
    const logCount = (error.stderr.match(/require\('module-\d+'\)/g) || []).length

    t.true(logCount <= ESBUILD_LOG_LIMIT)
    t.true(error.stderr.includes(`${ESBUILD_LOG_LIMIT} of 13 errors shown`))
  }
})

// We're not running this test for the `DEFAULT` bundler — not because it's not
// supported, but because the legacy bundler doesn't use any of the available
// configuration properties and therefore there is nothing we could test.
testMany(
  'Applies the configuration parameters supplied in the `config` property and returns the config in the response',
  ['bundler_esbuild', 'todo:bundler_nft'],
  async (options, t) => {
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
    const { files, tmpDir } = await zipNode(t, 'config-apply-1', { length: 3, opts })
    const requires = await Promise.all([
      getRequires({ filePath: resolve(tmpDir, 'another_function.js') }),
      getRequires({ filePath: resolve(tmpDir, 'function_two.js') }),
      getRequires({ filePath: resolve(tmpDir, 'function_one.js') }),
    ])

    t.deepEqual(requires[0], ['test-1'])
    t.deepEqual(requires[1], ['test-1', 'test-2'])
    t.deepEqual(requires[2], ['test-1', 'test-2', 'test-3'])

    const matches = ['another_function.zip', 'function_two.zip', 'function_one.zip'].map((zipName) =>
      // eslint-disable-next-line max-nested-callbacks
      files.find(({ path }) => path.endsWith(zipName)),
    )

    t.deepEqual(matches[0].config, { externalNodeModules: ['test-1'], nodeBundler: 'esbuild' })
    t.deepEqual(matches[1].config, { externalNodeModules: ['test-1', 'test-2'], nodeBundler: 'esbuild' })
    t.deepEqual(matches[2].config, { externalNodeModules: ['test-1', 'test-2', 'test-3'], nodeBundler: 'esbuild' })
  },
)

testMany(
  'Ignores `undefined` values when computing the configuration object for a function',
  ['bundler_esbuild'],
  async (options, t) => {
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
    const { files, tmpDir } = await zipNode(t, 'config-apply-1', { length: 3, opts })
    const requires = await Promise.all([
      getRequires({ filePath: resolve(tmpDir, 'another_function.js') }),
      getRequires({ filePath: resolve(tmpDir, 'function_two.js') }),
      getRequires({ filePath: resolve(tmpDir, 'function_one.js') }),
    ])

    t.deepEqual(requires[0], externalNodeModules)
    t.deepEqual(requires[1], externalNodeModules)
    t.deepEqual(requires[2], externalNodeModules)

    const matches = ['another_function.zip', 'function_two.zip', 'function_one.zip'].map((zipName) =>
      // eslint-disable-next-line max-nested-callbacks
      files.find(({ path }) => path.endsWith(zipName)),
    )

    t.deepEqual(matches[0].config, { externalNodeModules, nodeBundler: 'esbuild' })
    t.deepEqual(matches[1].config, { externalNodeModules, nodeBundler: 'esbuild' })
    t.deepEqual(matches[2].config, { externalNodeModules, nodeBundler: 'esbuild' })
  },
)

testMany(
  'Generates a directory if `archiveFormat` is set to `none`',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const opts = merge(options, {
      archiveFormat: 'none',
    })
    const { files } = await zipNode(t, 'node-module-included', {
      opts,
    })

    const functionEntry = require(`${files[0].path}/function.js`)

    t.true(functionEntry)
  },
)

testMany(
  'Includes in the bundle any paths matched by a `included_files` glob',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'included_files'
    const opts = merge(options, {
      config: {
        '*': {
          includedFiles: ['content/*', '!content/post3.md', 'something.md'],
          includedFilesBasePath: join(FIXTURES_DIR, fixtureName),
        },
      },
    })
    const { tmpDir } = await zipNode(t, `${fixtureName}/netlify/functions`, {
      opts,
    })

    const func = require(`${tmpDir}/func1.js`)

    const { body: body1 } = await func.handler({ queryStringParameters: { name: 'post1' } })
    const { body: body2 } = await func.handler({ queryStringParameters: { name: 'post2' } })
    const { body: body3 } = await func.handler({ queryStringParameters: { name: 'post3' } })

    t.true(body1.includes('Hello from the other side'))
    t.true(body2.includes("I must've called a thousand times"))
    t.true(body3.includes('Uh-oh'))

    t.true(await pathExists(`${tmpDir}/content/post1.md`))
    t.true(await pathExists(`${tmpDir}/content/post2.md`))
    t.false(await pathExists(`${tmpDir}/content/post3.md`))
    t.true(await pathExists(`${tmpDir}/something.md`))
  },
)

test('Generates a bundle for the Node runtime version specified in the `nodeVersion` config property', async (t) => {
  // Using the optional catch binding feature to assert that the bundle is
  // respecting the Node version supplied.
  // - in Node <10 we should see `try {} catch (e) {}`
  // - in Node >= 10 we should see `try {} catch {}`
  const { files: node8Files } = await zipNode(t, 'node-module-optional-catch-binding', {
    opts: { archiveFormat: 'none', config: { '*': { nodeBundler: 'esbuild', nodeVersion: '8.x' } } },
  })

  const node8Function = await pReadFile(`${node8Files[0].path}/src/function.js`, 'utf8')

  t.regex(node8Function, /catch \(\w+\) {/)

  const { files: node12Files } = await zipNode(t, 'node-module-optional-catch-binding', {
    opts: { archiveFormat: 'none', config: { '*': { nodeBundler: 'esbuild', nodeVersion: '12.x' } } },
  })

  const node12Function = await pReadFile(`${node12Files[0].path}/src/function.js`, 'utf8')

  t.regex(node12Function, /catch {/)
})

testMany(
  'Returns an `inputs` property with all the imported paths',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'node-module-and-local-imports'
    const { files, tmpDir } = await zipNode(t, fixtureName, {
      opts: options,
    })

    t.true(files[0].inputs.includes(join(FIXTURES_DIR, fixtureName, 'function.js')))
    t.true(files[0].inputs.includes(join(FIXTURES_DIR, fixtureName, 'lib', 'file1.js')))
    t.true(files[0].inputs.includes(join(FIXTURES_DIR, fixtureName, 'lib2', 'file2.js')))
    t.true(files[0].inputs.includes(join(FIXTURES_DIR, fixtureName, 'node_modules', 'test', 'index.js')))
    t.true(files[0].inputs.includes(join(FIXTURES_DIR, fixtureName, 'node_modules', 'test-child', 'index.js')))

    t.false(files[0].inputs.includes(join(FIXTURES_DIR, fixtureName, 'lib2', 'unused_file.js')))

    // Tree-shaking of node modules only happens with esbuild.
    if (files[0].bundler === 'esbuild') {
      t.false(files[0].inputs.includes(join(FIXTURES_DIR, fixtureName, 'node_modules', 'test', 'unused_file.js')))
      t.false(files[0].inputs.includes(join(FIXTURES_DIR, fixtureName, 'node_modules', 'test-child', 'unused_file.js')))
    }

    const functionEntry = require(`${tmpDir}/function.js`)

    t.true(functionEntry)
  },
)

testMany(
  'Places all user-defined files at the root of the target directory',
  ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'base_path'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: {
        '*': {
          includedFiles: ['content/*'],
        },
      },
    })
    const { tmpDir } = await zipNode(t, `${fixtureName}/netlify/functions1`, {
      opts,
    })

    const function1Entry = require(`${tmpDir}/func1.js`)

    // The function should not be on a `src/` namespace.
    t.false(unixify(function1Entry[0]).includes('/src/'))
    t.false(await pathExists(`${tmpDir}/src/func1.js`))
    t.true(await pathExists(`${tmpDir}/content/post1.md`))
    t.true(await pathExists(`${tmpDir}/content/post2.md`))
    t.true(await pathExists(`${tmpDir}/content/post3.md`))
    t.false(await pathExists(`${tmpDir}/src/content/post1.md`))
    t.false(await pathExists(`${tmpDir}/src/content/post2.md`))
    t.false(await pathExists(`${tmpDir}/src/content/post3.md`))
  },
)

testMany(
  'Places all user-defined files in a `src/` sub-directory if there is a naming conflict with the entry file',
  ['bundler_esbuild', 'bundler_default', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'base_path'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: {
        '*': {
          includedFiles: ['content/*', 'func2.js'],
        },
      },
    })
    const { tmpDir } = await zipNode(t, `${fixtureName}/netlify/functions2`, {
      opts,
    })

    const function2Entry = require(`${tmpDir}/func2.js`)

    // The function should be on a `src/` namespace because there's a conflict
    // with the /func2.js path present in `includedFiles`.
    t.true(unixify(function2Entry[0]).includes('/src/'))
    t.true(await pathExists(`${tmpDir}/src/func2.js`))
    t.false(await pathExists(`${tmpDir}/content/post1.md`))
    t.false(await pathExists(`${tmpDir}/content/post2.md`))
    t.false(await pathExists(`${tmpDir}/content/post3.md`))
    t.true(await pathExists(`${tmpDir}/src/content/post1.md`))
    t.true(await pathExists(`${tmpDir}/src/content/post2.md`))
    t.true(await pathExists(`${tmpDir}/src/content/post3.md`))
  },
)

testMany(
  'Bundles functions from multiple directories when the first argument of `zipFunctions()` is an array',
  ['bundler_esbuild', 'bundler_default', 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'multiple-src-directories'
    const pathInternal = `${fixtureName}/.netlify/internal-functions`
    const pathUser = `${fixtureName}/netlify/functions`
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    const { files, tmpDir } = await zipNode(t, [pathInternal, pathUser], {
      length: 3,
      opts,
    })

    const functionCommon = require(`${tmpDir}/function.js`)
    const functionInternal = require(`${tmpDir}/function_internal.js`)
    const functionUser = require(`${tmpDir}/function_user.js`)

    // Functions from rightmost directories in the array take precedence.
    t.is(functionCommon, 'user')
    t.is(functionInternal, 'internal')
    t.is(functionUser, 'user')

    const functionCommonEntry = files.find(({ name }) => name === 'function')
    const functionInternalEntry = files.find(({ name }) => name === 'function_internal')
    const functionUserEntry = files.find(({ name }) => name === 'function_user')

    t.not(functionCommonEntry, undefined)
    t.not(functionInternalEntry, undefined)
    t.not(functionUserEntry, undefined)

    t.is(dirname(functionCommonEntry.mainFile), resolve(join(__dirname, 'fixtures', pathUser)))
    t.is(dirname(functionInternalEntry.mainFile), resolve(join(__dirname, 'fixtures', pathInternal)))
    t.is(dirname(functionUserEntry.mainFile), resolve(join(__dirname, 'fixtures', pathUser)))
  },
)

test('When generating a directory for a function with `archiveFormat: "none"`, it empties the directory before copying any files', async (t) => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const functionDirectory = join(tmpDir, 'function')

  await makeDir(functionDirectory)

  const testFilePath = join(functionDirectory, 'some-file.js')

  await pWriteFile(testFilePath, 'module.exports = true')

  await zipFunction(`${FIXTURES_DIR}/simple/function.js`, tmpDir, {
    archiveFormat: 'none',
  })

  const functionEntry = require(`${functionDirectory}/function.js`)

  t.true(functionEntry)

  await t.throwsAsync(pStat(testFilePath))
})

test('Throws an error if the `archiveFormat` property contains an invalid value`', async (t) => {
  await t.throwsAsync(
    zipNode(t, 'node-module-included', {
      opts: { archiveFormat: 'gzip' },
    }),
    { message: `Invalid archive format: gzip` },
  )
})

testMany(
  'Adds `type: "functionsBundling"` to user errors when parsing with esbuild',
  ['bundler_esbuild'],
  async (options, t) => {
    const bundler = options.config['*'].nodeBundler

    try {
      await zipNode(t, 'node-syntax-error', {
        opts: options,
      })

      t.fail('Bundling should have thrown')
    } catch (error) {
      const { customErrorInfo } = error

      t.is(customErrorInfo.type, 'functionsBundling')
      t.is(customErrorInfo.location.bundler, bundler === 'esbuild' ? 'esbuild' : 'zisi')
      t.is(customErrorInfo.location.functionName, 'function')
      t.is(customErrorInfo.location.runtime, 'js')
    }
  },
)

test('Returns a list of all modules with dynamic imports in a `nodeModulesWithDynamicImports` property', async (t) => {
  const fixtureName = 'node-module-dynamic-import'
  const { files } = await zipNode(t, fixtureName, {
    opts: { basePath: join(FIXTURES_DIR, fixtureName), config: { '*': { nodeBundler: 'esbuild' } } },
  })

  t.is(files[0].nodeModulesWithDynamicImports.length, 2)
  t.true(files[0].nodeModulesWithDynamicImports.includes('test-two'))
  t.true(files[0].nodeModulesWithDynamicImports.includes('test-three'))
})

test('Returns an empty list of modules with dynamic imports if the modules are missing a `package.json`', async (t) => {
  const { files } = await zipNode(t, 'node-module-dynamic-import-invalid', {
    opts: { config: { '*': { nodeBundler: 'esbuild' } } },
  })

  t.is(files[0].nodeModulesWithDynamicImports.length, 0)
})

test('Leaves dynamic imports untouched when the `processDynamicNodeImports` configuration property is `false`', async (t) => {
  const fixtureName = 'node-module-dynamic-import-template-literal'
  const { tmpDir } = await zipNode(t, fixtureName, {
    opts: {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: 'esbuild', processDynamicNodeImports: false } },
    },
  })
  const functionSource = await pReadFile(`${tmpDir}/function.js`, 'utf8')

  /* eslint-disable no-template-curly-in-string */
  t.true(functionSource.includes('const require1 = require(`./files/${number}.js`);'))
  t.true(functionSource.includes('const require2 = require(`./files/${number}`);'))
  t.true(functionSource.includes('const require3 = require(`./files/${parent.child}`);'))
  t.true(functionSource.includes('const require4 = require(`./files/${arr[0]}`);'))
  t.true(functionSource.includes('const require5 = require(`./files/${number.length > 0 ? number : "uh-oh"}`);'))
  /* eslint-enable no-template-curly-in-string */
})

test('Adds a runtime shim and includes the files needed for dynamic imports using a template literal', async (t) => {
  const fixtureName = 'node-module-dynamic-import-template-literal'
  const { files, tmpDir } = await zipNode(t, fixtureName, {
    opts: {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: 'esbuild' } },
    },
  })

  const func = require(`${tmpDir}/function.js`)
  const values = func('one')
  const expectedLength = 5

  // eslint-disable-next-line unicorn/new-for-builtins
  t.deepEqual(values, Array(expectedLength).fill(true))
  t.throws(() => func('two'))
  t.is(files[0].nodeModulesWithDynamicImports.length, 0)
})

test('Leaves dynamic imports untouched when the files required to resolve the expression cannot be packaged at build time', async (t) => {
  const fixtureName = 'node-module-dynamic-import-unresolvable'
  const { tmpDir } = await zipNode(t, fixtureName, {
    opts: {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: 'esbuild' } },
    },
  })
  const functionSource = await pReadFile(`${tmpDir}/function.js`, 'utf8')

  t.true(functionSource.includes('const require1 = require(number)'))
  // eslint-disable-next-line no-template-curly-in-string
  t.true(functionSource.includes('const require2 = require(`${number}.json`);'))
  t.true(functionSource.includes('const require3 = require(foo(number));'))
})

test('Adds a runtime shim and includes the files needed for dynamic imports using an expression built with the `+` operator', async (t) => {
  const fixtureName = 'node-module-dynamic-import-2'
  const { tmpDir } = await zipNode(t, fixtureName, {
    opts: {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: 'esbuild' } },
    },
  })

  const func = require(`${tmpDir}/function.js`)

  t.deepEqual(func('en')[0], ['yes', 'no'])
  t.deepEqual(func('en')[1], ['yes', 'no'])
  t.deepEqual(func('pt')[0], ['sim', 'não'])
  t.deepEqual(func('pt')[1], ['sim', 'não'])
  t.throws(() => func('fr'))
})

test('The dynamic import runtime shim handles files in nested directories', async (t) => {
  const fixtureName = 'node-module-dynamic-import-4'
  const { tmpDir } = await zipNode(t, fixtureName, {
    opts: {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: 'esbuild' } },
    },
  })

  const func = require(`${tmpDir}/function.js`)

  t.deepEqual(func('en')[0], ['yes', 'no'])
  t.deepEqual(func('en')[1], ['yes', 'no'])
  t.deepEqual(func('pt')[0], ['sim', 'não'])
  t.deepEqual(func('pt')[1], ['sim', 'não'])
  t.deepEqual(func('nested/es')[0], ['sí', 'no'])
  t.deepEqual(func('nested/es')[1], ['sí', 'no'])
  t.throws(() => func('fr'))
})

test('The dynamic import runtime shim handles files in nested directories when using `archiveFormat: "none"`', async (t) => {
  const fixtureName = 'node-module-dynamic-import-4'
  const { tmpDir } = await zipNode(t, fixtureName, {
    opts: {
      archiveFormat: 'none',
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: 'esbuild' } },
    },
  })

  const func = require(`${tmpDir}/function/function.js`)

  t.deepEqual(func('en')[0], ['yes', 'no'])
  t.deepEqual(func('en')[1], ['yes', 'no'])
  t.deepEqual(func('pt')[0], ['sim', 'não'])
  t.deepEqual(func('pt')[1], ['sim', 'não'])
  t.deepEqual(func('nested/es')[0], ['sí', 'no'])
  t.deepEqual(func('nested/es')[1], ['sí', 'no'])
  t.throws(() => func('fr'))
})

test('Negated files in `included_files` are excluded from the bundle even if they match a dynamic import expression', async (t) => {
  const fixtureName = 'node-module-dynamic-import-2'
  const { tmpDir } = await zipNode(t, fixtureName, {
    opts: {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { includedFiles: ['!lang/en.*'], nodeBundler: 'esbuild' } },
    },
  })

  const func = require(`${tmpDir}/function.js`)

  t.deepEqual(func('pt')[0], ['sim', 'não'])
  t.deepEqual(func('pt')[1], ['sim', 'não'])
  t.throws(() => func('en'))
})

testMany(
  'Negated files in `included_files` are excluded from the bundle even if they match Node modules required in a function',
  ['bundler_default', 'bundler_default_nft', 'bundler_esbuild', 'bundler_nft'],
  async (options, t) => {
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
    const { tmpDir } = await zipNode(t, fixtureName, { opts })

    t.true(await pathExists(`${tmpDir}/function.js`))
    t.false(await pathExists(`${tmpDir}/node_modules/test/index.js`))
  },
)

test('Creates dynamic import shims for functions with the same name and same shim contents with no naming conflicts', async (t) => {
  const FUNCTION_COUNT = 30
  const fixtureName = 'node-module-dynamic-import-3'

  const { tmpDir } = await zipNode(t, fixtureName, {
    length: FUNCTION_COUNT,
    opts: {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: 'esbuild' } },
    },
  })

  for (let ind = 1; ind <= FUNCTION_COUNT; ind++) {
    const func = require(`${tmpDir}/function${ind}.js`)

    t.deepEqual(func('en')[0], ['yes', 'no'])
    t.deepEqual(func('en')[1], ['yes', 'no'])
    t.deepEqual(func('pt')[0], ['sim', 'não'])
    t.deepEqual(func('pt')[1], ['sim', 'não'])
    t.throws(() => func('fr'))
  }
})

test('Creates dynamic import shims for functions using `zipFunction`', async (t) => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const fixtureDir = join(FIXTURES_DIR, 'node-module-dynamic-import-2')
  const result = await zipFunction(join(fixtureDir, 'function.js'), tmpDir, {
    basePath: fixtureDir,
    config: { '*': { nodeBundler: 'esbuild' } },
  })

  await unzipFiles([result])

  const func = require(`${tmpDir}/function.js`)

  t.deepEqual(func('en')[0], ['yes', 'no'])
  t.deepEqual(func('en')[1], ['yes', 'no'])
  t.deepEqual(func('pt')[0], ['sim', 'não'])
  t.deepEqual(func('pt')[1], ['sim', 'não'])
  t.throws(() => func('fr'))
})

test('Uses the default Node bundler if no configuration object is supplied', async (t) => {
  const { files, tmpDir } = await zipNode(t, 'local-node-module')
  const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

  t.deepEqual(requires, ['test'])
  t.is(files[0].bundler, 'zisi')
  t.deepEqual(files[0].config, {})
})

test('Zips Rust function files', async (t) => {
  const { files, tmpDir } = await zipFixture(t, 'rust-simple', { length: 1 })

  t.true(files.every(({ runtime }) => runtime === 'rs'))

  await unzipFiles(files)

  const unzippedFile = `${tmpDir}/bootstrap`
  t.true(await pathExists(unzippedFile))

  // The library we use for unzipping does not keep executable permissions.
  // https://github.com/cthackers/adm-zip/issues/86
  // However `chmod()` is not cross-platform
  if (platform === 'linux') {
    await pChmod(unzippedFile, EXECUTABLE_PERMISSION)

    const { stdout } = await execa(unzippedFile)
    t.is(stdout, 'Hello, world!')
  }

  const tcFile = `${tmpDir}/netlify-toolchain`
  t.true(await pathExists(tcFile))
  const tc = await pReadFile(tcFile, 'utf8')
  t.is(tc.trim(), '{"runtime":"rs"}')
})

test('Does not zip Go function files', async (t) => {
  const { files } = await zipFixture(t, 'go-simple', { length: 1 })

  t.true(files.every(({ runtime }) => runtime === 'go'))
  t.true(await pEvery(files, async ({ path }) => !path.endsWith('.zip') && (await pathExists(path))))
})

test.serial('Does not build Go functions from source if the `buildGoSource` feature flag is not enabled', async (t) => {
  shellUtilsStub.callsFake((...args) => pWriteFile(args[1][2], ''))

  const fixtureName = 'go-source-multiple'
  const { files } = await zipFixture(t, fixtureName, { length: 0 })

  t.is(files.length, 0)
  t.is(shellUtilsStub.callCount, 0)
})

test.serial('Builds Go functions from source if the `buildGoSource` feature flag is enabled', async (t) => {
  shellUtilsStub.callsFake((...args) => pWriteFile(args[1][2], ''))

  const fixtureName = 'go-source-multiple'
  const { files } = await zipFixture(t, fixtureName, {
    length: 2,
    opts: {
      featureFlags: {
        buildGoSource: true,
      },
    },
  })

  t.is(shellUtilsStub.callCount, 2)

  const { args: call1 } = shellUtilsStub.getCall(0)
  const { args: call2 } = shellUtilsStub.getCall(1)

  t.is(call1[0], 'go')
  t.is(call1[1][0], 'build')
  t.is(call1[1][1], '-o')
  t.true(call1[1][2].endsWith(`${sep}go-func-1`))
  t.is(call1[2].env.CGO_ENABLED, '0')
  t.is(call1[2].env.GOOS, 'linux')

  t.is(files[0].mainFile, join(FIXTURES_DIR, fixtureName, 'go-func-1', 'main.go'))
  t.is(files[0].name, 'go-func-1')
  t.is(files[0].runtime, 'go')

  t.is(call2[0], 'go')
  t.is(call2[1][0], 'build')
  t.is(call2[1][1], '-o')
  t.true(call2[1][2].endsWith(`${sep}go-func-2`))
  t.is(call2[2].env.CGO_ENABLED, '0')
  t.is(call2[2].env.GOOS, 'linux')

  t.is(files[1].mainFile, join(FIXTURES_DIR, fixtureName, 'go-func-2', 'go-func-2.go'))
  t.is(files[1].name, 'go-func-2')
  t.is(files[1].runtime, 'go')
})

test.serial('Adds `type: "functionsBundling"` to errors resulting from compiling Go binaries', async (t) => {
  shellUtilsStub.callsFake(() => {
    throw new Error('Fake error')
  })

  try {
    await zipFixture(t, 'go-source', {
      opts: {
        featureFlags: {
          buildGoSource: true,
        },
      },
    })

    t.fail('Expected catch block')
  } catch (error) {
    t.deepEqual(error.customErrorInfo, {
      type: 'functionsBundling',
      location: { functionName: 'go-func-1', runtime: 'go' },
    })
  }
})

test.serial(
  'Does not build Rust functions from source if the `buildRustSource` feature flag is not enabled',
  async (t) => {
    shellUtilsStub.callsFake((...args) => pWriteFile(args[1][2], ''))

    const fixtureName = 'rust-source-multiple'
    const { files } = await zipFixture(t, fixtureName, { length: 0 })

    t.is(files.length, 0)
    t.is(shellUtilsStub.callCount, 0)
  },
)

test.serial('Builds Rust functions from source if the `buildRustSource` feature flag is enabled', async (t) => {
  const targetDirectory = await tmpName({ prefix: `zip-it-test-rust-function-[name]` })
  const tmpDirectory = await tmpName({ prefix: `zip-it-test-` })

  shellUtilsStub.callsFake(async (...args) => {
    const [rootCommand, , { cwd, env: environment } = {}] = args

    if (rootCommand === 'cargo') {
      const directory = join(environment.CARGO_TARGET_DIR, args[1][2], 'release')
      const binaryPath = join(directory, 'hello')

      if (cwd.endsWith('rust-func-1')) {
        t.is(dirname(environment.CARGO_TARGET_DIR), dirname(tmpDirectory))
      }

      if (cwd.endsWith('rust-func-2')) {
        t.is(environment.CARGO_TARGET_DIR, targetDirectory.replace('[name]', 'rust-func-2'))
      }

      await makeDir(directory)

      return pWriteFile(binaryPath, '')
    }
  })

  const fixtureName = 'rust-source-multiple'
  const { files } = await zipFixture(t, fixtureName, {
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

  t.is(files.length, 2)
  // eslint-disable-next-line no-magic-numbers
  t.is(shellUtilsStub.callCount, 4)

  const { args: call1 } = shellUtilsStub.getCall(0)
  const { args: call2 } = shellUtilsStub.getCall(1)
  const { args: call3 } = shellUtilsStub.getCall(2)
  const { args: call4 } = shellUtilsStub.getCall(3)

  t.is(call1[0], 'rustup')
  t.is(call1[1][0], 'default')
  t.is(call1[1][1], 'stable')

  t.is(call2[0], 'rustup')
  t.is(call2[1][0], 'target')
  t.is(call2[1][1], 'add')
  t.is(call2[1][2], 'x86_64-unknown-linux-musl')

  t.is(call3[0], 'cargo')
  t.is(call3[1][0], 'build')
  t.is(call3[1][1], '--target')
  t.is(call3[1][2], 'x86_64-unknown-linux-musl')

  t.is(call4[0], call3[0])
  t.is(call4[1][0], call3[1][0])
  t.is(call4[1][1], call3[1][1])
  t.is(call4[1][2], call3[1][2])

  t.is(files[0].mainFile, join(FIXTURES_DIR, fixtureName, 'rust-func-1', 'src', 'main.rs'))
  t.is(files[0].name, 'rust-func-1')
  t.is(files[0].runtime, 'rs')

  t.is(files[1].mainFile, join(FIXTURES_DIR, fixtureName, 'rust-func-2', 'src', 'main.rs'))
  t.is(files[1].name, 'rust-func-2')
  t.is(files[1].runtime, 'rs')
})

test.serial('Adds `type: "functionsBundling"` to errors resulting from compiling Rust binaries', async (t) => {
  shellUtilsStub.callsFake((...args) => {
    if (args[0] === 'cargo') {
      throw new Error('Fake error')
    }
  })

  try {
    await zipFixture(t, 'rust-source', {
      opts: {
        featureFlags: {
          buildRustSource: true,
        },
      },
    })

    t.fail('Expected catch block')
  } catch (error) {
    t.deepEqual(error.customErrorInfo, {
      type: 'functionsBundling',
      location: { functionName: 'rust-func-1', runtime: 'rs' },
    })
  }
})

test.serial('Throws an error with an informative message when the Rust toolchain is missing', async (t) => {
  shellUtilsStub.callsFake(() => {
    throw new Error('Fake error')
  })

  try {
    await zipFixture(t, 'rust-source', {
      opts: {
        featureFlags: {
          buildRustSource: true,
        },
      },
    })

    t.fail('Expected catch block')
  } catch (error) {
    t.true(error.message.startsWith('There is no Rust toolchain installed'))
    t.deepEqual(error.customErrorInfo, {
      type: 'functionsBundling',
      location: { functionName: 'rust-func-1', runtime: 'rs' },
    })
  }
})

test('Does not generate a sourcemap unless `nodeSourcemap` is set', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-and-local-imports', {
    opts: { config: { '*': { nodeBundler: 'esbuild' } } },
  })

  t.false(await pathExists(`${tmpDir}/function.js.map`))

  const functionSource = await pReadFile(`${tmpDir}/function.js`, 'utf8')

  t.false(functionSource.includes('sourceMappingURL'))
})

if (platform !== 'win32') {
  test('Generates a sourcemap if `nodeSourcemap` is set', async (t) => {
    const { tmpDir } = await zipNode(t, 'node-module-and-local-imports', {
      opts: { config: { '*': { nodeBundler: 'esbuild', nodeSourcemap: true } } },
    })
    const sourcemap = await pReadFile(`${tmpDir}/function.js.map`, 'utf8')
    const { sourceRoot, sources } = JSON.parse(sourcemap)

    await Promise.all(
      sources.map(async (source) => {
        const absolutePath = resolve(sourceRoot, source)

        t.true(await pathExists(absolutePath))
      }),
    )
  })
}

test('Creates a manifest file with the list of created functions if the `manifest` property is supplied', async (t) => {
  const FUNCTIONS_COUNT = 6
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const manifestPath = join(tmpDir, 'manifest.json')
  const { files } = await zipNode(t, 'many-functions', {
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

  const manifest = require(manifestPath)

  t.is(manifest.version, 1)
  t.is(manifest.system.arch, arch)
  t.is(manifest.system.platform, platform)
  t.is(typeof manifest.timestamp, 'number')

  manifest.functions.forEach((fn, index) => {
    const file = files[index]

    t.true(isAbsolute(fn.path))
    t.is(fn.mainFile, file.mainFile)
    t.is(fn.name, file.name)
    t.is(fn.runtime, file.runtime)
    t.is(fn.path, file.path)
    t.is(fn.schedule, fn.name === 'five' ? '@daily' : undefined)
  })
})

testMany(
  'Correctly follows node_modules via symlink',
  ['bundler_esbuild', platform === 'win32' ? 'todo:bundler_nft' : 'bundler_nft'],
  async (options, t) => {
    const fixtureName = 'node-module-symlinks'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    const { tmpDir } = await zipNode(t, fixtureName, {
      opts,
    })

    const isEven = require(`${tmpDir}/function`)
    t.is(isEven(2), '2 is even')
  },
)

testMany(
  'Can find Node modules in the `repositoryRoot` path, even if it is a parent directory of `basePath`',
  ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
  async (options, t) => {
    const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
    const fixtureDir = join(FIXTURES_DIR, 'node-monorepo')
    const basePath = join(fixtureDir, 'packages', 'site-1', 'netlify', 'functions')
    const opts = merge(options, {
      basePath,
      config: {
        '*': {
          externalNodeModules: ['@netlify/mock-package-2'],
        },
      },
      repositoryRoot: fixtureDir,
    })
    const result = await zipFunction(`${basePath}/function-1.js`, tmpDir, opts)

    await unzipFiles([result])

    const { mock1, mock2 } = require(`${tmpDir}/function-1.js`)

    t.true(mock1)
    t.true(mock2)
  },
)

testMany(
  'Handles built-in modules imported with the `node:` prefix',
  ['bundler_default', 'bundler_default_nft', 'bundler_nft', 'bundler_esbuild', 'bundler_esbuild_zisi'],
  async (options, t, bundler) => {
    const importSyntaxIsCompiledAway = bundler.includes('esbuild')
    const zip = importSyntaxIsCompiledAway ? zipNode : zipFixture
    await zip(t, 'node-force-builtin-esm', {
      opts: options,
    })
  },
)

testMany(
  'Handles built-in modules required with the `node:` prefix',
  ['bundler_default', 'bundler_default_nft', 'bundler_nft', 'bundler_esbuild', 'bundler_esbuild_zisi'],
  async (options, t) => {
    const nodePrefixIsUnderstood = semver.gte(nodeVersion, '14.18.0')
    const zip = nodePrefixIsUnderstood ? zipNode : zipFixture
    await zip(t, 'node-force-builtin-cjs', {
      opts: options,
    })
  },
)

testMany(
  'Returns a `size` property with the size of each generated archive',
  ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
  async (options, t) => {
    const FUNCTIONS_COUNT = 6
    const { files } = await zipNode(t, 'many-functions', {
      length: FUNCTIONS_COUNT,
      opts: options,
    })

    files.every(({ size }) => Number.isInteger(size) && size > 0)
  },
)

testMany(
  'Should surface schedule declarations on a top-level `schedule` property',
  ['bundler_default', 'bundler_default_nft', 'bundler_esbuild', 'bundler_nft'],
  async (options, t) => {
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
    const { files } = await zipNode(t, fixtureName, { opts })

    files.every((file) => t.is(file.schedule, schedule))

    const manifest = require(manifestPath)

    manifest.functions.forEach((fn) => {
      t.is(fn.schedule, schedule)
    })
  },
)

test('Generates a sourcemap for any transpiled files when `nodeSourcemap: true`', async (t) => {
  const fixtureName = 'esm-throwing-error'
  const basePath = join(FIXTURES_DIR, fixtureName)
  const { files } = await zipFixture(t, fixtureName, {
    opts: {
      archiveFormat: 'none',
      basePath,
      config: { '*': { nodeBundler: 'nft', nodeSourcemap: true } },
      featureFlags: { nftTranspile: true },
    },
  })
  const func = require(join(files[0].path, 'function.js'))

  try {
    func.handler()

    t.fail()
  } catch (error) {
    const filePath = join(files[0].path, 'src', 'tests', 'fixtures', fixtureName, 'function.js')

    // Asserts that the line/column of the error match the position of the
    // original source file, not the transpiled one.
    t.true(error.stack.includes(`${filePath}:2:9`))
  }
})

testMany(
  'Finds in-source config declarations using the `schedule` helper',
  ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
  async (options, t) => {
    const FUNCTIONS_COUNT = 7
    const { files } = await zipFixture(t, join('in-source-config', 'functions'), {
      opts: options,
      length: FUNCTIONS_COUNT,
    })

    t.is(files.length, FUNCTIONS_COUNT)

    files.forEach((result) => {
      t.is(result.schedule, '@daily')
    })
  },
)

test('listFunctions surfaces schedule config property', async (t) => {
  const functions = await listFunctions(join(FIXTURES_DIR, 'many-functions'), {
    config: {
      five: {
        schedule: '@daily',
      },
    },
  })
  const five = functions.find((func) => func.name === 'five')
  t.is(five.schedule, '@daily')
})

test('listFunctions includes in-source config declarations', async (t) => {
  const functions = await listFunctions(join(FIXTURES_DIR, 'in-source-config', 'functions'), {
    parseISC: true,
  })
  const FUNCTIONS_COUNT = 7
  t.is(functions.length, FUNCTIONS_COUNT)
  functions.forEach((func) => {
    t.is(func.schedule, '@daily')
  })
})

test('listFunction includes in-source config declarations', async (t) => {
  const mainFile = join(FIXTURES_DIR, 'in-source-config', 'functions', 'cron_cjs.js')
  const func = await listFunction(mainFile, {
    parseISC: true,
  })
  t.deepEqual(func, {
    extension: '.js',
    mainFile,
    name: 'cron_cjs',
    runtime: 'js',
    schedule: '@daily',
  })
})

test('listFunctionsFiles includes in-source config declarations', async (t) => {
  const functions = await listFunctionsFiles(join(FIXTURES_DIR, 'in-source-config', 'functions'), {
    parseISC: true,
  })
  functions.forEach((func) => {
    t.is(func.schedule, '@daily')
  })
})
