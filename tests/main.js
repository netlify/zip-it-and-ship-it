const { readFile, chmod, symlink, unlink, rename, stat, writeFile } = require('fs')
const { tmpdir } = require('os')
const { join, normalize, resolve } = require('path')
const { platform, versions } = require('process')
const { promisify } = require('util')

const test = require('ava')
const cpy = require('cpy')
const del = require('del')
const execa = require('execa')
const makeDir = require('make-dir')
const pathExists = require('path-exists')
const semver = require('semver')
const { dir: getTmpDir, tmpName } = require('tmp-promise')
const unixify = require('unixify')

const { zipFunction, listFunctions, listFunctionsFiles } = require('..')
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
  await del(`${tmpdir()}/zip-it-test-bundler-all*`, { force: true })
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
    if (semver.lt(versions.node, '10.0.0')) {
      t.log('Skipping test for unsupported Node version')

      return t.pass()
    }

    const fixtureDir = 'node-module-native-buildtime'
    const { files, tmpDir } = await zipNode(t, fixtureDir, {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    const requires = await getRequires({ filePath: resolve(tmpDir, 'src/function.js') })
    const normalizedRequires = new Set(requires.map(unixify))
    const modulePath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/test`)

    t.is(files.length, 1)
    t.is(files[0].runtime, 'js')
    t.true(await pathExists(`${tmpDir}/src/node_modules/test/native.node`))
    t.true(await pathExists(`${tmpDir}/src/node_modules/test/side-file.js`))
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
    if (semver.lt(versions.node, '10.0.0')) {
      t.log('Skipping test for unsupported Node version')

      return t.pass()
    }

    const fixtureDir = 'node-module-native-runtime'
    const { files, tmpDir } = await zipNode(t, fixtureDir, {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    const requires = await getRequires({ filePath: resolve(tmpDir, 'src/function.js') })
    const normalizedRequires = new Set(requires.map(unixify))
    const modulePath = resolve(FIXTURES_DIR, `${fixtureDir}/node_modules/test`)

    t.is(files.length, 1)
    t.is(files[0].runtime, 'js')
    t.true(await pathExists(`${tmpDir}/src/node_modules/test/native.node`))
    t.true(await pathExists(`${tmpDir}/src/node_modules/test/side-file.js`))
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
  t.false(await pathExists(`${tmpDir}/src/node_modules/aws-sdk`))
})

testBundlers('Ignore TypeScript types', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-typescript-types', {
    opts: { config: { '*': { nodeBundler: bundler } } },
  })
  t.false(await pathExists(`${tmpDir}/src/node_modules/@types/node`))
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
      /(invalid JSON|package.json:1:1: error: Expected string but found "{")/,
    )
  } finally {
    await pRename(distPackageJson, srcPackageJson)
  }
})

testBundlers('Ignore invalid require()', [ESBUILD, ESBUILD_ZISI, DEFAULT], async (bundler, t) => {
  await zipNode(t, 'invalid-require', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Can use dynamic import() with esbuild', [ESBUILD, ESBUILD_ZISI], async (bundler, t) => {
  if (semver.lt(versions.node, '10.0.0')) {
    t.log('Skipping test for unsupported Node version')

    return t.pass()
  }

  await zipNode(t, 'dynamic-import', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Bundling does not crash with dynamic import() with zisi', [DEFAULT], async (bundler, t) => {
  if (semver.lt(versions.node, '10.0.0')) {
    t.log('Skipping test for unsupported Node version')

    return t.pass()
  }

  await t.throwsAsync(zipNode(t, 'dynamic-import', { opts: { config: { '*': { nodeBundler: bundler } } } }), /export/)
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
    t.false(await pathExists(`${tmpDir}/src/node_modules`))
  },
)

testBundlers(
  'Ignores deep non-required node_modules inside the target directory',
  [ESBUILD, ESBUILD_ZISI, DEFAULT],
  async (bundler, t) => {
    const { tmpDir } = await zipNode(t, 'ignore-deep-dir-node-modules', {
      opts: { config: { '*': { nodeBundler: bundler } } },
    })
    t.false(await pathExists(`${tmpDir}/src/deep/node_modules`))
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
  await t.throwsAsync(
    zipNode(t, 'does-not-exist', { opts: { config: { '*': { nodeBundler: bundler } } } }),
    /Functions folder does not exist/,
  )
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
  t.false(await pathExists(`${tmpDir}/src/Desktop.ini`))
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
      { name: 'four', mainFile: 'four.js/four.js.js', runtime: 'js', extension: '.js' },
      { name: 'one', mainFile: 'one/index.js', runtime: 'js', extension: '.js' },
      { name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.js' },
      { name: 'test', mainFile: 'test', runtime: 'go', extension: '' },
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

testBundlers('Zips node modules', [DEFAULT], async (bundler, t) => {
  await zipNode(t, 'node-module', { opts: { config: { '*': { nodeBundler: bundler } } } })
})

testBundlers('Include most files from node modules', [DEFAULT], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included', { opts: { config: { '*': { nodeBundler: bundler } } } })
  const [mapExists, htmlExists] = await Promise.all([
    pathExists(`${tmpDir}/src/node_modules/test/test.map`),
    pathExists(`${tmpDir}/src/node_modules/test/test.html`),
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
    pathExists(`${tmpDir}/src/node_modules/next/dist/next-server/lib/constants.js`),
    pathExists(`${tmpDir}/src/node_modules/next/dist/compiled/semver.js`),
    pathExists(`${tmpDir}/src/node_modules/next/dist/other.js`),
    pathExists(`${tmpDir}/src/node_modules/next/index.js`),
  ])
  t.true(constantsExists)
  t.true(semverExists)
  t.false(otherExists)
  t.false(indexExists)
})

testBundlers('Includes all Next.js dependencies when not using next-on-netlify', [DEFAULT], async (bundler, t) => {
  const { tmpDir } = await zipNode(t, 'node-module-next', { opts: { config: { '*': { nodeBundler: bundler } } } })
  const [constantsExists, semverExists, otherExists, indexExists] = await Promise.all([
    pathExists(`${tmpDir}/src/node_modules/next/dist/next-server/lib/constants.js`),
    pathExists(`${tmpDir}/src/node_modules/next/dist/compiled/semver.js`),
    pathExists(`${tmpDir}/src/node_modules/next/dist/other.js`),
    pathExists(`${tmpDir}/src/node_modules/next/index.js`),
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
  t.false(await pathExists(`${tmpDir}/src/node_modules/test`))
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
    t.true(await pathExists(`${tmpDir}/src/node_modules/test`))
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
    t.false(await pathExists(`${tmpDir}/src/node_modules/test`))
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
      pathExists(`${tmpDir}/src/node_modules/test/test.map`),
      pathExists(`${tmpDir}/src/node_modules/test/test.html`),
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

    t.false(await pathExists(`${tmpDir}/src/node_modules/i-do-not-exist`))
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
      getRequires({ filePath: resolve(tmpDir, 'src/another_function.js') }),
      getRequires({ filePath: resolve(tmpDir, 'src/function_two.js') }),
      getRequires({ filePath: resolve(tmpDir, 'src/function_one.js') }),
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
      getRequires({ filePath: resolve(tmpDir, 'src/another_function.js') }),
      getRequires({ filePath: resolve(tmpDir, 'src/function_two.js') }),
      getRequires({ filePath: resolve(tmpDir, 'src/function_one.js') }),
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
    `Invalid archive format: gzip`,
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

test('Uses the default Node bundler if no configuration object is supplied', async (t) => {
  const { files, tmpDir } = await zipNode(t, 'local-node-module')
  const requires = await getRequires({ filePath: resolve(tmpDir, 'src/function.js') })

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
