const { readFile, chmod, symlink, unlink, rename, stat, writeFile } = require('fs')
const { tmpdir } = require('os')
const { dirname, join, normalize, resolve, sep } = require('path')
const { env, platform } = require('process')
const { promisify } = require('util')

const test = require('ava')
const cpy = require('cpy')
const del = require('del')
const execa = require('execa')
const makeDir = require('make-dir')
const pathExists = require('path-exists')
const sinon = require('sinon')
const { dir: getTmpDir, tmpName } = require('tmp-promise')
const unixify = require('unixify')

// We must require this file first because we need to stub it before the main
// functions are required.
// eslint-disable-next-line import/order
const shellUtils = require('../src/utils/shell')

const shellUtilsStub = sinon.stub(shellUtils, 'runCommand')

const { zipFunction, listFunctions, listFunctionsFiles } = require('..')
const { ESBUILD_LOG_LIMIT } = require('../src/runtimes/node/bundler')
const {
  JS_BUNDLER_ESBUILD: ESBUILD,
  JS_BUNDLER_ESBUILD_ZISI: ESBUILD_ZISI,
  JS_BUNDLER_ZISI,
} = require('../src/utils/consts')

const { getRequires, zipNode, zipFixture, unzipFiles, zipCheckFunctions, FIXTURES_DIR } = require('./helpers/main')
const { computeSha1 } = require('./helpers/sha')
const { makeTestBundlers } = require('./helpers/test_bundlers')

const pReadFile = promisify(readFile)
const pChmod = promisify(chmod)
const pSymlink = promisify(symlink)
const pUnlink = promisify(unlink)
const pRename = promisify(rename)
const pStat = promisify(stat)
const pWriteFile = promisify(writeFile)

// Alias for the default bundler.
const DEFAULT = undefined
const EXECUTABLE_PERMISSION = 0o755

const normalizeFiles = function (fixtureDir, { name, mainFile, runtime, extension, srcFile }) {
  const mainFileA = normalize(`${fixtureDir}/${mainFile}`)
  const srcFileA = srcFile === undefined ? {} : { srcFile: normalize(`${fixtureDir}/${srcFile}`) }
  return { name, mainFile: mainFileA, runtime, extension, ...srcFileA }
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

// Convenience method for running a test for each JS bundler.
const testBundlers = makeTestBundlers(test)

testBundlers('Zips Node.js function files', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const fixtureName = 'simple'
  const { files } = await zipNode(t, fixtureName, { opts: { config: { '*': { nodeBundler: bundler } } } })

  t.is(files.length, 1)
  t.is(files[0].runtime, 'js')
  t.is(files[0].mainFile, join(FIXTURES_DIR, fixtureName, 'function.js'))
})

testBundlers(
  'Handles Node module with native bindings (buildtime marker module)',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const fixtureDir = 'node-module-native-buildtime'
    const { files, tmpDir } = await zipNode(t, fixtureDir, {
      opts: { config: { '*': { nodeBundler: bundler } } },
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
    if (bundler !== DEFAULT) {
      t.deepEqual(files[0].nativeNodeModules, { test: { [modulePath]: '1.0.0' } })
    }
  },
)

testBundlers(
  'Handles Node module with native bindings (runtime marker module)',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const fixtureDir = 'node-module-native-runtime'
    const { files, tmpDir } = await zipNode(t, fixtureDir, {
      opts: { config: { '*': { nodeBundler: bundler } } },
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
    if (bundler !== DEFAULT) {
      t.deepEqual(files[0].nativeNodeModules, { test: { [modulePath]: '1.0.0' } })
    }
  },
)

testBundlers('Can require node modules', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'local-node-module', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Can require scoped node modules', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'node-module-scope', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Can require node modules nested files', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'node-module-path', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Can require dynamically generated node modules', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'side-module', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Ignore some excluded node modules', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-excluded', { opts: { config: { '*': { nodeBundler: bundler } } } })

  t.false(await pathExists(`${tmpDir}/node_modules/aws-sdk`))

  try {
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    const func = require(`${tmpDir}/function.js`)

    func()

    t.fail('Running the function should fail due to the missing module')
  } catch (error) {
    t.is(error.code, 'MODULE_NOT_FOUND')
  }
})

testBundlers('Ignore TypeScript types', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-typescript-types', {
    opts: { config: { '*': { nodeBundler: bundler } } },
  })
  t.false(await pathExists(`${tmpDir}/node_modules/@types/node`))
})

testBundlers('Throws on runtime errors', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await t.throwsAsync(zipNode(t, 'node-module-error', { opts: { config: { '*': { nodeBundler: bundler } } } }))
})

testBundlers('Throws on missing dependencies', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await t.throwsAsync(zipNode(t, 'node-module-missing', { opts: { config: { '*': { nodeBundler: bundler } } } }))
})

testBundlers(
  'Throws on missing dependencies with no optionalDependencies',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await t.throwsAsync(
      zipNode(t, 'node-module-missing-package', { opts: { config: { '*': { nodeBundler: bundler } } } }),
    )
  },
)

testBundlers('Throws on missing conditional dependencies', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await t.throwsAsync(
    zipNode(t, 'node-module-missing-conditional', { opts: { config: { '*': { nodeBundler: bundler } } } }),
  )
})

testBundlers("Throws on missing dependencies' dependencies", [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await t.throwsAsync(zipNode(t, 'node-module-missing-deep', { opts: { config: { '*': { nodeBundler: bundler } } } }))
})

testBundlers('Ignore missing optional dependencies', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'node-module-missing-optional', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Ignore modules conditional dependencies', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'node-module-deep-conditional', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Ignore missing optional peer dependencies', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'node-module-peer-optional', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers(
  'Throws on missing optional peer dependencies with no peer dependencies',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await t.throwsAsync(
      zipNode(t, 'node-module-peer-optional-none', { opts: { config: { '*': { nodeBundler: bundler } } } }),
    )
  },
)

testBundlers(
  'Throws on missing non-optional peer dependencies',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await t.throwsAsync(
      zipNode(t, 'node-module-peer-not-optional', { opts: { config: { '*': { nodeBundler: bundler } } } }),
    )
  },
)

testBundlers(
  'Resolves dependencies from .netlify/plugins/node_modules',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await zipNode(t, 'node-module-next-image', { opts: { config: { '*': { nodeBundler: bundler } } } })
  },
)

// We persist `package.json` as `package.json.txt` in git. Otherwise ESLint
// tries to load when linting sibling JavaScript files. In this test, we
// temporarily rename it to an actual `package.json`.
testBundlers('Throws on invalid package.json', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const fixtureDir = await tmpName({ prefix: `zip-it-test-bundler-${bundler}` })
  await cpy('**', `${fixtureDir}/invalid-package-json`, {
    cwd: `${FIXTURES_DIR}/invalid-package-json`,
    parents: true,
  })

  const invalidPackageJsonDir = `${fixtureDir}/invalid-package-json`
  const srcPackageJson = `${invalidPackageJsonDir}/package.json.txt`
  const distPackageJson = `${invalidPackageJsonDir}/package.json`

  await pRename(srcPackageJson, distPackageJson)
  try {
    await t.throwsAsync(
      zipNode(t, 'invalid-package-json', { opts: { config: { '*': { nodeBundler: bundler } } }, fixtureDir }),
      { message: /(invalid JSON|package.json:1:1: error: Expected string but found "{")/ },
    )
  } finally {
    await pRename(distPackageJson, srcPackageJson)
  }
})

testBundlers('Ignore invalid require()', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'invalid-require', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Can use dynamic import() with esbuild', [ESBUILD, ESBUILD_ZISI], async (bundler, t) => {
  await zipNode(t, 'dynamic-import', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Bundling does not crash with dynamic import() with zisi', [DEFAULT], async (bundler, t) => {
  await t.throwsAsync(zipNode(t, 'dynamic-import', { opts: { config: { '*': { nodeBundler: bundler } } } }), {
    message: /export/,
  })
})

testBundlers('Can require local files', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'local-require', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Can require local files deeply', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'local-deep-require', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers(
  'Can require local files in the parent directories',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await zipNode(t, 'local-parent-require', { opts: { config: { '*': { nodeBundler: bundler } } } })
  },
)

testBundlers(
  'Ignore missing critters dependency for Next.js 10',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await zipNode(t, 'node-module-next10-critters', { opts: { config: { '*': { nodeBundler: bundler } } } })
  },
)

testBundlers(
  'Ignore missing critters dependency for Next.js exact version 10.0.5',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await zipNode(t, 'node-module-next10-critters-exact', { opts: { config: { '*': { nodeBundler: bundler } } } })
  },
)

testBundlers(
  'Ignore missing critters dependency for Next.js with range ^10.0.5',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await zipNode(t, 'node-module-next10-critters-10.0.5-range', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
  },
)

testBundlers(
  "Ignore missing critters dependency for Next.js with version='latest'",
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await zipNode(t, 'node-module-next10-critters-latest', { opts: { config: { '*': { nodeBundler: bundler } } } })
  },
)

// Need to create symlinks dynamically because they sometimes get lost when
// committed on Windows
if (platform !== 'win32') {
  testBundlers('Can require symlinks', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
    const fixtureDir = await tmpName({ prefix: `zip-it-test-bundler-${bundler}` })
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
      await zipNode(t, 'symlinks', { opts: { config: { '*': { nodeBundler: bundler } } }, fixtureDir })
    } finally {
      await pUnlink(symlinkFile)
    }
  })
}

testBundlers(
  'Can target a directory with a main file with the same name',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const fixtureName = 'directory-handler'
    const { files } = await zipNode(t, fixtureName, { opts: { config: { '*': { nodeBundler: bundler } } } })

    t.is(files[0].mainFile, join(FIXTURES_DIR, fixtureName, 'function', 'function.js'))
  },
)

testBundlers('Can target a directory with an index.js file', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const fixtureName = 'index-handler'
  const { files, tmpDir } = await zipFixture(t, fixtureName, {
    opts: { config: { '*': { nodeBundler: bundler } } },
  })
  await unzipFiles(files)
  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  t.true(require(`${tmpDir}/function.js`))
  t.is(files[0].mainFile, join(FIXTURES_DIR, fixtureName, 'function', 'index.js'))
})

testBundlers(
  'Keeps non-required files inside the target directory',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { tmpDir } = await zipNode(t, 'keep-dir-files', { opts: { config: { '*': { nodeBundler: bundler } } } })
    t.true(await pathExists(`${tmpDir}/function.js`))
  },
)

testBundlers(
  'Ignores non-required node_modules inside the target directory',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { tmpDir } = await zipNode(t, 'ignore-dir-node-modules', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    t.false(await pathExists(`${tmpDir}/node_modules`))
  },
)

testBundlers(
  'Ignores deep non-required node_modules inside the target directory',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { tmpDir } = await zipNode(t, 'ignore-deep-dir-node-modules', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    t.false(await pathExists(`${tmpDir}/deep/node_modules`))
  },
)

testBundlers('Works with many dependencies', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'many-dependencies', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Works with many function files', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const names = new Set(['one', 'two', 'three', 'four', 'five', 'six'])
  const { files } = await zipNode(t, 'many-functions', {
    opts: { config: { '*': { nodeBundler: bundler } } },
    length: TEST_FUNCTIONS_LENGTH,
  })

  files.forEach(({ name }) => {
    t.true(names.has(name))
  })
})

const TEST_FUNCTIONS_LENGTH = 6

testBundlers('Produces deterministic checksums', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const [checksumOne, checksumTwo] = await Promise.all([getZipChecksum(t, bundler), getZipChecksum(t, bundler)])
  t.is(checksumOne, checksumTwo)
})

testBundlers('Throws when the source folder does not exist', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await t.throwsAsync(zipNode(t, 'does-not-exist', { opts: { config: { '*': { nodeBundler: bundler } } } }), {
    message: /Functions folder does not exist/,
  })
})

testBundlers(
  'Works even if destination folder does not exist',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await zipNode(t, 'simple', { opts: { config: { '*': { nodeBundler: bundler } } } })
  },
)

testBundlers(
  'Do not consider node_modules as a function file',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    await zipNode(t, 'ignore-node-modules', { opts: { config: { '*': { nodeBundler: bundler } } } })
  },
)

testBundlers('Ignore directories without a main file', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'ignore-directories', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Remove useless files', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'useless', { opts: { config: { '*': { nodeBundler: bundler } } } })
  t.false(await pathExists(`${tmpDir}/Desktop.ini`))
})

testBundlers('Works on empty directories', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'empty', { opts: { config: { '*': { nodeBundler: bundler } } }, length: 0 })
})

testBundlers('Works when no package.json is present', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const fixtureDir = await tmpName({ prefix: `zip-it-test-bundler-${bundler}` })
  await cpy('**', `${fixtureDir}/no-package-json`, { cwd: `${FIXTURES_DIR}/no-package-json`, parents: true })
  await zipNode(t, 'no-package-json', { opts: { config: { '*': { nodeBundler: bundler } } }, length: 1, fixtureDir })
})

testBundlers('Copies already zipped files', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const tmpDir = await tmpName({ prefix: `zip-it-test-bundler-${bundler}` })
  const { files } = await zipCheckFunctions(t, 'keep-zip', { tmpDir })

  t.true(files.every(({ runtime }) => runtime === 'js'))
  t.true(
    (await Promise.all(files.map(async ({ path }) => (await pReadFile(path, 'utf8')).trim() === 'test'))).every(
      Boolean,
    ),
  )
})

testBundlers('Ignore unsupported programming languages', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipFixture(t, 'unsupported', { length: 0, opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Can reduce parallelism', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'simple', { length: 1, opts: { config: { '*': { nodeBundler: bundler } }, parallelLimit: 1 } })
})

testBundlers('Can use zipFunction()', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const mainFile = join(FIXTURES_DIR, 'simple', 'function.js')
  const result = await zipFunction(mainFile, tmpDir, {
    config: { '*': { nodeBundler: bundler } },
  })
  const outBundlers = { [ESBUILD_ZISI]: ESBUILD, [DEFAULT]: JS_BUNDLER_ZISI }
  const outBundler = outBundlers[bundler] || bundler

  t.is(result.name, 'function')
  t.is(result.runtime, 'js')
  t.is(result.bundler, outBundler)
  t.is(result.mainFile, mainFile)
  t.deepEqual(result.config, bundler === DEFAULT ? {} : { nodeBundler: outBundler })
})

test('Can list function main files with listFunctions()', async (t) => {
  const fixtureDir = `${FIXTURES_DIR}/list`
  const functions = await listFunctions(fixtureDir)
  t.deepEqual(
    functions,
    [
      { name: 'test', mainFile: 'test.zip', runtime: 'js', extension: '.zip' },
      { name: 'test', mainFile: 'test.js', runtime: 'js', extension: '.js' },
      { name: 'five', mainFile: 'five/index.ts', runtime: 'js', extension: '.ts' },
      { name: 'four', mainFile: 'four.js/four.js.js', runtime: 'js', extension: '.js' },
      { name: 'one', mainFile: 'one/index.js', runtime: 'js', extension: '.js' },
      { name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.js' },
      { name: 'test', mainFile: 'test', runtime: 'go', extension: '' },
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
      { name: 'function', mainFile: '.netlify/internal-functions/function.js', runtime: 'js', extension: '.js' },
      {
        name: 'function_internal',
        mainFile: '.netlify/internal-functions/function_internal.js',
        runtime: 'js',
        extension: '.js',
      },
      { name: 'function', mainFile: 'netlify/functions/function.js', runtime: 'js', extension: '.js' },
      { name: 'function_user', mainFile: 'netlify/functions/function_user.js', runtime: 'js', extension: '.js' },
    ].map(normalizeFiles.bind(null, fixtureDir)),
  )
})

testBundlers(
  'Can list all function files with listFunctionsFiles()',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const fixtureDir = `${FIXTURES_DIR}/list`
    const functions = await listFunctionsFiles(fixtureDir, { config: { '*': { nodeBundler: bundler } } })
    t.deepEqual(
      functions,
      [
        { name: 'test', mainFile: 'test.zip', runtime: 'js', extension: '.zip', srcFile: 'test.zip' },
        { name: 'test', mainFile: 'test.js', runtime: 'js', extension: '.js', srcFile: 'test.js' },
        { name: 'five', mainFile: 'five/index.ts', runtime: 'js', extension: '.ts', srcFile: 'five/index.ts' },
        {
          name: 'four',
          mainFile: 'four.js/four.js.js',
          runtime: 'js',
          extension: '.js',
          srcFile: 'four.js/four.js.js',
        },
        { name: 'one', mainFile: 'one/index.js', runtime: 'js', extension: '.js', srcFile: 'one/index.js' },

        // The JSON file should only be present when using the legacy bundler,
        // since esbuild will inline it within the main file.
        bundler === DEFAULT && {
          name: 'two',
          mainFile: 'two/two.js',
          runtime: 'js',
          extension: '.json',
          srcFile: 'two/three.json',
        },
        { name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.js', srcFile: 'two/two.js' },
        { name: 'test', mainFile: 'test', runtime: 'go', extension: '', srcFile: 'test' },
      ]
        .filter(Boolean)
        .map(normalizeFiles.bind(null, fixtureDir)),
    )
  },
)

testBundlers(
  'Can list all function files from multiple source directorires with listFunctionsFiles()',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  // eslint-disable-next-line complexity
  async (bundler, t) => {
    const fixtureDir = `${FIXTURES_DIR}/multiple-src-directories`
    const functions = await listFunctionsFiles(
      [join(fixtureDir, '.netlify', 'internal-functions'), join(fixtureDir, 'netlify', 'functions')],
      { config: { '*': { nodeBundler: bundler } } },
    )

    t.deepEqual(
      functions,
      [
        {
          name: 'function',
          mainFile: '.netlify/internal-functions/function.js',
          runtime: 'js',
          extension: '.js',
          srcFile: '.netlify/internal-functions/function.js',
        },

        bundler === DEFAULT && {
          name: 'function',
          mainFile: '.netlify/internal-functions/function.js',
          runtime: 'js',
          extension: '.js',
          srcFile: 'node_modules/test/index.js',
        },

        bundler === DEFAULT && {
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

        bundler === DEFAULT && {
          name: 'function_internal',
          mainFile: '.netlify/internal-functions/function_internal.js',
          runtime: 'js',
          extension: '.js',
          srcFile: 'node_modules/test/index.js',
        },

        bundler === DEFAULT && {
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

        bundler === DEFAULT && {
          name: 'function',
          mainFile: 'netlify/functions/function.js',
          runtime: 'js',
          extension: '.js',
          srcFile: 'node_modules/test/index.js',
        },

        bundler === DEFAULT && {
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

        bundler === DEFAULT && {
          name: 'function_user',
          mainFile: 'netlify/functions/function_user.js',
          runtime: 'js',
          extension: '.js',
          srcFile: 'node_modules/test/index.js',
        },

        bundler === DEFAULT && {
          name: 'function_user',
          mainFile: 'netlify/functions/function_user.js',
          runtime: 'js',
          extension: '.json',
          srcFile: 'node_modules/test/package.json',
        },
      ]
        .filter(Boolean)
        .map(normalizeFiles.bind(null, fixtureDir)),
    )
  },
)

testBundlers('Zips node modules', [DEFAULT], async (bundler, t) => {
  await zipNode(t, 'node-module', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Include most files from node modules', [DEFAULT], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included', { opts: { config: { '*': { nodeBundler: bundler } } } })
  const [mapExists, htmlExists] = await Promise.all([
    pathExists(`${tmpDir}/node_modules/test/test.map`),
    pathExists(`${tmpDir}/node_modules/test/test.html`),
  ])
  t.false(mapExists)
  t.true(htmlExists)
})

testBundlers('Throws on missing critters dependency for Next.js 9', [DEFAULT], async (bundler, t) => {
  await t.throwsAsync(zipNode(t, 'node-module-next9-critters', { opts: { config: { '*': { nodeBundler: bundler } } } }))
})

testBundlers('Includes specific Next.js dependencies when using next-on-netlify', [DEFAULT], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-next-on-netlify', {
    opts: { config: { '*': { nodeBundler: bundler } } },
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
})

testBundlers('Includes all Next.js dependencies when not using next-on-netlify', [DEFAULT], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-next', { opts: { config: { '*': { nodeBundler: bundler } } } })
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
})

testBundlers('Inlines node modules in the bundle', [ESBUILD, ESBUILD_ZISI], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
    opts: { config: { '*': { nodeBundler: bundler } } },
  })
  const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

  t.false(requires.includes('test'))
  t.false(await pathExists(`${tmpDir}/node_modules/test`))
})

testBundlers(
  'Does not inline node modules and includes them in a `node_modules` directory if they are defined in `externalNodeModules`',
  [ESBUILD, ESBUILD_ZISI],
  async (bundler, t) => {
    const config = {
      function: {
        externalNodeModules: ['test'],
        nodeBundler: bundler,
      },
    }
    const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
      opts: { config },
    })
    const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

    t.true(requires.includes('test'))
    t.true(await pathExists(`${tmpDir}/node_modules/test`))
  },
)

testBundlers(
  'Does not inline node modules and excludes them from the bundle if they are defined in `ignoredNodeModules`',
  [ESBUILD, ESBUILD_ZISI],
  async (bundler, t) => {
    const config = {
      function: {
        ignoredNodeModules: ['test'],
        nodeBundler: bundler,
      },
    }
    const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
      opts: { config },
    })
    const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

    t.true(requires.includes('test'))
    t.false(await pathExists(`${tmpDir}/node_modules/test`))
  },
)

testBundlers(
  'Include most files from node modules present in `externalNodeModules`',
  [ESBUILD, ESBUILD_ZISI],
  async (bundler, t) => {
    const config = {
      function: {
        externalNodeModules: ['test'],
        nodeBundler: bundler,
      },
    }
    const { tmpDir } = await zipNode(t, 'node-module-included', {
      opts: { config },
    })
    const [mapExists, htmlExists] = await Promise.all([
      pathExists(`${tmpDir}/node_modules/test/test.map`),
      pathExists(`${tmpDir}/node_modules/test/test.html`),
    ])
    t.false(mapExists)
    t.true(htmlExists)
  },
)

testBundlers(
  'Does not throw if one of the modules defined in `externalNodeModules` does not exist',
  [ESBUILD, ESBUILD_ZISI],
  async (bundler, t) => {
    const config = {
      function: {
        externalNodeModules: ['i-do-not-exist'],
        nodeBundler: bundler,
      },
    }
    const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
      opts: { config },
    })

    t.false(await pathExists(`${tmpDir}/node_modules/i-do-not-exist`))
  },
)

testBundlers(
  'Exposes the main export of `node-fetch` when imported using `require()`',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-fetch', { opts: { config: { '*': { nodeBundler: bundler } } } })
    await unzipFiles(files)
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    t.true(typeof require(`${tmpDir}/function.js`) === 'function')
  },
)

testBundlers(
  '{name}/{name}.js takes precedence over {name}.js and {name}/index.js',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files, tmpDir } = await zipFixture(t, 'conflicting-names-1', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    await unzipFiles(files)
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    t.is(require(`${tmpDir}/function.js`), 'function-js-file-in-directory')
  },
)

testBundlers(
  '{name}/index.js takes precedence over {name}.js',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files, tmpDir } = await zipFixture(t, 'conflicting-names-2', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    await unzipFiles(files)
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    t.is(require(`${tmpDir}/function.js`), 'index-js-file-in-directory')
  },
)

testBundlers(
  '{name}/index.js takes precedence over {name}/index.ts',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files, tmpDir } = await zipFixture(t, 'conflicting-names-3', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    await unzipFiles(files)
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    t.is(require(`${tmpDir}/function.js`).type, 'index-js-file-in-directory')
  },
)

testBundlers('{name}.js takes precedence over {name}.ts', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const { files, tmpDir } = await zipFixture(t, 'conflicting-names-4', {
    opts: { config: { '*': { nodeBundler: bundler } } },
  })
  await unzipFiles(files)
  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  t.is(require(`${tmpDir}/function.js`).type, 'function-js-file')
})

testBundlers('{name}.js takes precedence over {name}.zip', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const { files, tmpDir } = await zipFixture(t, 'conflicting-names-5', {
    opts: { config: { '*': { nodeBundler: bundler } } },
  })
  await unzipFiles(files)
  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  t.is(require(`${tmpDir}/function.js`).type, 'function-js-file')
})

testBundlers('Handles a TypeScript function ({name}.ts)', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const { files, tmpDir } = await zipFixture(t, 'node-typescript', {
    opts: { config: { '*': { nodeBundler: bundler } } },
  })
  await unzipFiles(files)
  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  t.true(typeof require(`${tmpDir}/function.js`).type === 'string')
})

testBundlers(
  'Handles a TypeScript function ({name}/{name}.ts)',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-directory-1', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    await unzipFiles(files)
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    t.true(typeof require(`${tmpDir}/function.js`).type === 'string')
  },
)

testBundlers(
  'Handles a TypeScript function ({name}/index.ts)',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-directory-2', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    await unzipFiles(files)
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    t.true(typeof require(`${tmpDir}/function.js`).type === 'string')
  },
)

testBundlers('Handles a TypeScript function with imports', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const { files, tmpDir } = await zipFixture(t, 'node-typescript-with-imports', {
    opts: { config: { '*': { nodeBundler: bundler } } },
  })
  await unzipFiles(files)
  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  t.true(typeof require(`${tmpDir}/function.js`).type === 'string')
})

testBundlers(
  'Loads a tsconfig.json placed in the same directory as the function',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-tsconfig-sibling', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    await unzipFiles(files)
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    t.true(require(`${tmpDir}/function.js`).value)
  },
)

testBundlers(
  'Loads a tsconfig.json placed in a parent directory',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-tsconfig-parent/functions', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    await unzipFiles(files)
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    t.true(require(`${tmpDir}/function.js`).value)
  },
)

testBundlers(
  'Respects the target defined in the config over a `target` property defined in tsconfig',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files, tmpDir } = await zipFixture(t, 'node-typescript-tsconfig-target/functions', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    await unzipFiles(files)

    // eslint-disable-next-line import/no-dynamic-require, node/global-require
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
  const binaryPath = resolve(__dirname, '../src/bin.js')
  const fixturePath = join(FIXTURES_DIR, 'esbuild-log-limit')

  try {
    await execa(binaryPath, [fixturePath, tmpDir, `--config.*.nodeBundler=esbuild`])

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
testBundlers(
  'Applies the configuration parameters supplied in the `config` property and returns the config in the response',
  [ESBUILD, ESBUILD_ZISI],
  async (bundler, t) => {
    const config = {
      '*': {
        externalNodeModules: ['test-1'],
        nodeBundler: bundler,
      },

      function_one: {
        externalNodeModules: ['test-3'],
      },

      'function_*': {
        externalNodeModules: ['test-2'],
      },
    }

    const { files, tmpDir } = await zipNode(t, 'config-apply-1', { length: 3, opts: { config } })
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

testBundlers(
  'Ignores `undefined` values when computing the configuration object for a function',
  [ESBUILD],
  async (bundler, t) => {
    const externalNodeModules = ['test-1', 'test-2', 'test-3']
    const config = {
      '*': {
        externalNodeModules,
        nodeBundler: bundler,
      },

      function_one: {
        externalNodeModules: undefined,
        nodeBundler: undefined,
      },
    }

    const { files, tmpDir } = await zipNode(t, 'config-apply-1', { length: 3, opts: { config } })
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

testBundlers(
  'Generates a directory if `archiveFormat` is set to `none`',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { files } = await zipNode(t, 'node-module-included', {
      opts: { archiveFormat: 'none', config: { '*': { nodeBundler: bundler } } },
    })

    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    const functionEntry = require(`${files[0].path}/function.js`)

    t.true(functionEntry)
  },
)

testBundlers(
  'Includes in the bundle any paths matched by a `included_files` glob',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const fixtureName = 'included_files'
    const { tmpDir } = await zipNode(t, `${fixtureName}/netlify/functions`, {
      opts: {
        config: {
          '*': {
            nodeBundler: bundler,
            includedFiles: ['content/*', '!content/post3.md'],
            includedFilesBasePath: join(FIXTURES_DIR, fixtureName),
          },
        },
      },
    })

    // eslint-disable-next-line import/no-dynamic-require, node/global-require
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
  },
)

test('Generates a bundle for the Node runtime version specified in the `nodeVersion` config property', async (t) => {
  // Using the optional catch binding feature to assert that the bundle is
  // respecting the Node version supplied.
  // - in Node <10 we should see `try {} catch (e) {}`
  // - in Node >= 10 we should see `try {} catch {}`
  const { files: node8Files } = await zipNode(t, 'node-module-optional-catch-binding', {
    opts: { archiveFormat: 'none', config: { '*': { nodeBundler: ESBUILD, nodeVersion: '8.x' } } },
  })

  const node8Function = await pReadFile(`${node8Files[0].path}/src/function.js`, 'utf8')

  t.regex(node8Function, /catch \(\w+\) {/)

  const { files: node12Files } = await zipNode(t, 'node-module-optional-catch-binding', {
    opts: { archiveFormat: 'none', config: { '*': { nodeBundler: ESBUILD, nodeVersion: '12.x' } } },
  })

  const node12Function = await pReadFile(`${node12Files[0].path}/src/function.js`, 'utf8')

  t.regex(node12Function, /catch {/)
})

testBundlers(
  'Returns an `inputs` property with all the imported paths',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const fixtureName = 'node-module-and-local-imports'
    const { files, tmpDir } = await zipNode(t, fixtureName, {
      opts: { config: { '*': { nodeBundler: bundler } } },
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

    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    const functionEntry = require(`${tmpDir}/function.js`)

    t.true(functionEntry)
  },
)

testBundlers(
  'Places all user-defined files at the root of the target directory',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const fixtureName = 'base_path'
    const { tmpDir } = await zipNode(t, `${fixtureName}/netlify/functions1`, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            includedFiles: ['content/*'],
            nodeBundler: bundler,
          },
        },
      },
    })

    // eslint-disable-next-line import/no-dynamic-require, node/global-require
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

testBundlers(
  'Places all user-defined files in a `src/` sub-directory if there is a naming conflict with the entry file',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const fixtureName = 'base_path'
    const { tmpDir } = await zipNode(t, `${fixtureName}/netlify/functions2`, {
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            includedFiles: ['content/*', 'func2.js'],
            nodeBundler: bundler,
          },
        },
      },
    })

    // eslint-disable-next-line import/no-dynamic-require, node/global-require
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

testBundlers(
  'Bundles functions from multiple directories when the first argument of `zipFunctions()` is an array',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const fixtureName = 'multiple-src-directories'
    const pathInternal = `${fixtureName}/.netlify/internal-functions`
    const pathUser = `${fixtureName}/netlify/functions`
    const { files, tmpDir } = await zipNode(t, [pathInternal, pathUser], {
      length: 3,
      opts: {
        basePath: join(FIXTURES_DIR, fixtureName),
        config: {
          '*': {
            nodeBundler: bundler,
          },
        },
      },
    })

    /* eslint-disable import/no-dynamic-require, node/global-require */
    const functionCommon = require(`${tmpDir}/function.js`)
    const functionInternal = require(`${tmpDir}/function_internal.js`)
    const functionUser = require(`${tmpDir}/function_user.js`)
    /* eslint-enable import/no-dynamic-require, node/global-require */

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

  // eslint-disable-next-line import/no-dynamic-require, node/global-require
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

test('Adds `type: "functionsBundling"` to esbuild bundling errors', async (t) => {
  try {
    await zipNode(t, 'node-module-missing', {
      opts: { config: { '*': { nodeBundler: ESBUILD } } },
    })

    t.fail('Function did not throw')
  } catch (error) {
    t.deepEqual(error.customErrorInfo, { type: 'functionsBundling', location: { functionName: 'function' } })
  }
})

test('Returns a list of all modules with dynamic imports in a `nodeModulesWithDynamicImports` property', async (t) => {
  const { files } = await zipNode(t, 'node-module-dynamic-import', {
    opts: { config: { '*': { nodeBundler: ESBUILD } } },
  })

  t.is(files[0].nodeModulesWithDynamicImports.length, 2)
  t.true(files[0].nodeModulesWithDynamicImports.includes('@org/test'))
  t.true(files[0].nodeModulesWithDynamicImports.includes('test-two'))
})

test('Returns an empty list of modules with dynamic imports if the modules are missing a `package.json`', async (t) => {
  const { files } = await zipNode(t, 'node-module-dynamic-import-invalid', {
    opts: { config: { '*': { nodeBundler: ESBUILD } } },
  })

  t.is(files[0].nodeModulesWithDynamicImports.length, 0)
})

test('Leaves dynamic imports untouched when the `processDynamicNodeImports` configuration property is not `true`', async (t) => {
  const fixtureName = 'node-module-dynamic-import-template-literal'
  const { tmpDir } = await zipNode(t, fixtureName, {
    opts: { basePath: join(FIXTURES_DIR, fixtureName), config: { '*': { nodeBundler: ESBUILD } } },
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
      config: { '*': { nodeBundler: ESBUILD, processDynamicNodeImports: true } },
    },
  })

  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  const func = require(`${tmpDir}/function.js`)
  const values = func('one')
  const expectedLength = 5

  // eslint-disable-next-line unicorn/new-for-builtins
  t.deepEqual(values, Array(expectedLength).fill(true))
  t.throws(() => func('two'))
  t.is(files[0].nodeModulesWithDynamicImports.length, 1)
  t.true(files[0].nodeModulesWithDynamicImports.includes('@org/test'))
})

test('Leaves dynamic imports untouched when the files required to resolve the expression cannot be packaged at build time', async (t) => {
  const fixtureName = 'node-module-dynamic-import-unresolvable'
  const { tmpDir } = await zipNode(t, fixtureName, {
    opts: {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: ESBUILD, processDynamicNodeImports: true } },
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
      config: { '*': { nodeBundler: ESBUILD, processDynamicNodeImports: true } },
    },
  })

  // eslint-disable-next-line import/no-dynamic-require, node/global-require
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
      config: { '*': { nodeBundler: ESBUILD, processDynamicNodeImports: true } },
    },
  })

  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  const func = require(`${tmpDir}/function.js`)

  t.deepEqual(func('en')[0], ['yes', 'no'])
  t.deepEqual(func('en')[1], ['yes', 'no'])
  t.deepEqual(func('pt')[0], ['sim', 'não'])
  t.deepEqual(func('pt')[1], ['sim', 'não'])
  t.deepEqual(func('nested/es')[0], ['sí', 'no'])
  t.deepEqual(func('nested/es')[1], ['sí', 'no'])
  t.throws(() => func('fr'))
})

test('The dynamic import runtime shim handles files in nested directories when using `archiveType: "none"`', async (t) => {
  const fixtureName = 'node-module-dynamic-import-4'
  const { tmpDir } = await zipNode(t, fixtureName, {
    opts: {
      archiveFormat: 'none',
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: ESBUILD, processDynamicNodeImports: true } },
    },
  })

  // eslint-disable-next-line import/no-dynamic-require, node/global-require
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
      config: { '*': { includedFiles: ['!lang/en.*'], nodeBundler: ESBUILD, processDynamicNodeImports: true } },
    },
  })

  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  const func = require(`${tmpDir}/function.js`)

  t.deepEqual(func('pt')[0], ['sim', 'não'])
  t.deepEqual(func('pt')[1], ['sim', 'não'])
  t.throws(() => func('en'))
})

test('Creates dynamic import shims for functions with the same name and same shim contents with no naming conflicts', async (t) => {
  const FUNCTION_COUNT = 30
  const fixtureName = 'node-module-dynamic-import-3'

  const { tmpDir } = await zipNode(t, fixtureName, {
    length: FUNCTION_COUNT,
    opts: {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: { '*': { nodeBundler: ESBUILD, processDynamicNodeImports: true } },
    },
  })

  for (let ind = 1; ind <= FUNCTION_COUNT; ind++) {
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
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
    config: { '*': { nodeBundler: 'esbuild', processDynamicNodeImports: true } },
  })

  await unzipFiles([result])

  // eslint-disable-next-line import/no-dynamic-require, node/global-require
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
  const tc = (await pReadFile(tcFile, 'utf8')).trim()
  t.is(tc, '{"runtime":"rs"}')
})

test('Does not zip Go function files', async (t) => {
  const { files } = await zipFixture(t, 'go-simple', { length: 1 })

  t.true(files.every(({ runtime }) => runtime === 'go'))
  t.true(
    (await Promise.all(files.map(async ({ path }) => !path.endsWith('.zip') && (await pathExists(path))))).every(
      Boolean,
    ),
  )
})

test.serial('Does not build Go functions from source if the `buildGoSource` feature flag is not enabled', async (t) => {
  shellUtilsStub.callsFake((...args) => pWriteFile(args[1][2], ''))

  const fixtureName = 'go-source'
  const { files } = await zipFixture(t, fixtureName, { length: 0 })

  t.is(files.length, 0)
  t.is(shellUtilsStub.callCount, 0)
})

test.serial('Builds Go functions from source if the `buildGoSource` feature flag is enabled', async (t) => {
  shellUtilsStub.callsFake((...args) => pWriteFile(args[1][2], ''))

  const fixtureName = 'go-source'
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

test.serial(
  'Does not build Rust functions from source if the `buildRustSource` feature flag is not enabled',
  async (t) => {
    shellUtilsStub.callsFake((...args) => pWriteFile(args[1][2], ''))

    const fixtureName = 'rust-source'
    const { files } = await zipFixture(t, fixtureName, { length: 0 })

    t.is(files.length, 0)
    t.is(shellUtilsStub.callCount, 0)
  },
)

test.serial('Builds Rust functions from source if the `buildRustSource` feature flag is enabled', async (t) => {
  shellUtilsStub.callsFake(async (...args) => {
    const directory = join(args[2].env.CARGO_TARGET_DIR, args[1][2], 'release')
    const binaryPath = join(directory, 'hello')

    await makeDir(directory)

    return pWriteFile(binaryPath, '')
  })

  const fixtureName = 'rust-source'
  const { files } = await zipFixture(t, fixtureName, {
    opts: {
      featureFlags: {
        buildRustSource: true,
      },
    },
  })

  t.is(shellUtilsStub.callCount, 1)

  const { args: call1 } = shellUtilsStub.getCall(0)

  t.is(call1[0], 'cargo')
  t.is(call1[1][0], 'build')
  t.is(call1[1][1], '--target')
  t.is(call1[1][2], 'x86_64-unknown-linux-musl')

  t.is(files[0].mainFile, join(FIXTURES_DIR, fixtureName, 'rust-func-1', 'src', 'main.rs'))
  t.is(files[0].name, 'rust-func-1')
  t.is(files[0].runtime, 'rs')
})

test.serial('Throws an error with an informative message when the Rust toolchain is missing', async (t) => {
  shellUtilsStub.throws()

  const fixtureName = 'rust-source'
  await t.throwsAsync(
    zipFixture(t, fixtureName, {
      opts: {
        featureFlags: {
          buildRustSource: true,
        },
      },
    }),
    { message: /^There is no Rust toolchain installed./ },
  )
})

test('Does not generate a sourcemap unless `nodeSourcemap` is set', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-and-local-imports', {
    opts: { config: { '*': { nodeBundler: ESBUILD } } },
  })

  t.false(await pathExists(`${tmpDir}/function.js.map`))

  const functionSource = await pReadFile(`${tmpDir}/function.js`, 'utf8')

  t.false(functionSource.includes('sourceMappingURL'))
})

if (platform !== 'win32') {
  test('Generates a sourcemap if `nodeSourcemap` is set', async (t) => {
    const { tmpDir } = await zipNode(t, 'node-module-and-local-imports', {
      opts: { config: { '*': { nodeBundler: ESBUILD, nodeSourcemap: true } } },
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
