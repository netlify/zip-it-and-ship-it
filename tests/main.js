const { readFile, chmod, symlink, unlink, rename } = require('fs')
const { tmpdir } = require('os')
const { normalize, resolve } = require('path')
const { platform } = require('process')
const { promisify } = require('util')

const test = require('ava')
const cpy = require('cpy')
const del = require('del')
const execa = require('execa')
const pathExists = require('path-exists')
const { dir: getTmpDir, tmpName } = require('tmp-promise')

const { zipFunction, listFunctions, listFunctionsFiles } = require('..')

const { getRequires, zipNode, zipFixture, unzipFiles, zipCheckFunctions, FIXTURES_DIR } = require('./helpers/main')
const { computeSha1 } = require('./helpers/sha')

const pReadFile = promisify(readFile)
const pChmod = promisify(chmod)
const pSymlink = promisify(symlink)
const pUnlink = promisify(unlink)
const pRename = promisify(rename)

const BUNDLERS = ['legacy', 'esbuild']
const EXECUTABLE_PERMISSION = 0o755

const normalizeFiles = function (fixtureDir, { name, mainFile, runtime, extension, srcFile }) {
  const mainFileA = normalize(`${fixtureDir}/${mainFile}`)
  const srcFileA = srcFile === undefined ? {} : { srcFile: normalize(`${fixtureDir}/${srcFile}`) }
  return { name, mainFile: mainFileA, runtime, extension, ...srcFileA }
}

const getZipChecksum = async function (t) {
  const {
    files: [{ path }],
  } = await zipFixture(t, 'many-dependencies')
  const sha1sum = computeSha1(path)
  return sha1sum
}

test.after.always(async () => {
  await del(`${tmpdir()}/zip-it-test*`, { force: true })
})

// Common tests.
BUNDLERS.forEach((bundler) => {
  const zipNodeWithBundler = (t, fixture, options = {}) => zipNode(t, fixture, { bundler, ...options })

  test(`[bundler: ${bundler}] Zips Node.js function files`, async (t) => {
    const { files } = await zipNode(t, 'simple')
    t.true(files.every(({ runtime }) => runtime === 'js'))
  })

  test(`[bundler: ${bundler}] Can require node modules`, async (t) => {
    await zipNodeWithBundler(t, 'local-node-module')
  })

  test(`[bundler: ${bundler}] Can require scoped node modules`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-scope')
  })

  test(`[bundler: ${bundler}] Can require node modules nested files`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-path')
  })

  test(`[bundler: ${bundler}] Can require dynamically generated node modules`, async (t) => {
    await zipNodeWithBundler(t, 'side-module')
  })

  test(`[bundler: ${bundler}] Ignore some excluded node modules`, async (t) => {
    const { tmpDir } = await zipNodeWithBundler(t, 'node-module-excluded')
    t.false(await pathExists(`${tmpDir}/src/node_modules/aws-sdk`))
  })

  test(`[bundler: ${bundler}] Ignore TypeScript types`, async (t) => {
    const { tmpDir } = await zipNodeWithBundler(t, 'node-module-typescript-types')
    t.false(await pathExists(`${tmpDir}/src/node_modules/@types/node`))
  })

  test(`[bundler: ${bundler}] Throws on runtime errors`, async (t) => {
    await t.throwsAsync(zipNodeWithBundler(t, 'node-module-error'))
  })

  test(`[bundler: ${bundler}] Throws on missing dependencies`, async (t) => {
    await t.throwsAsync(zipNodeWithBundler(t, 'node-module-missing'))
  })

  test(`[bundler: ${bundler}] Throws on missing dependencies with no optionalDependencies`, async (t) => {
    await t.throwsAsync(zipNodeWithBundler(t, 'node-module-missing-package'))
  })

  test(`[bundler: ${bundler}] Throws on missing conditional dependencies`, async (t) => {
    await t.throwsAsync(zipNodeWithBundler(t, 'node-module-missing-conditional'))
  })

  test(`[bundler: ${bundler}] Throws on missing dependencies' dependencies`, async (t) => {
    await t.throwsAsync(zipNodeWithBundler(t, 'node-module-missing-deep'))
  })

  test(`[bundler: ${bundler}] Ignore missing optional dependencies`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-missing-optional')
  })

  test(`[bundler: ${bundler}] Ignore modules conditional dependencies`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-deep-conditional')
  })

  test(`[bundler: ${bundler}] Ignore missing optional peer dependencies`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-peer-optional')
  })

  test(`[bundler: ${bundler}] Throws on missing optional peer dependencies with no peer dependencies`, async (t) => {
    await t.throwsAsync(zipNodeWithBundler(t, 'node-module-peer-optional-none'))
  })

  test(`[bundler: ${bundler}] Throws on missing non-optional peer dependencies`, async (t) => {
    await t.throwsAsync(zipNodeWithBundler(t, 'node-module-peer-not-optional'))
  })

  test(`[bundler: ${bundler}] Resolves dependencies from .netlify/plugins/node_modules`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-next-image')
  })

  // We persist `package.json` as `package.json.txt` in git. Otherwise ESLint
  // tries to load when linting sibling JavaScript files. In this test, we
  // temporarily rename it to an actual `package.json`.
  test(`[bundler: ${bundler}] Throws on invalid package.json`, async (t) => {
    const fixtureDir = await tmpName({ prefix: `zip-it-test-bundler-${bundler}` })
    await cpy('**', `${fixtureDir}/invalid-package-json`, {
      cwd: `${FIXTURES_DIR}/invalid-package-json`,
      parents: true,
    })

    const invalidPackageJsonDir = `${fixtureDir}/invalid-package-json`
    const srcPackageJson = `${invalidPackageJsonDir}/package.json.txt`
    const distPackageJson = `${invalidPackageJsonDir}/package.json`
    const expectedErrorRegex =
      bundler === 'esbuild' ? /package.json:1:1: error: Expected string but found "{"/ : /invalid JSON/

    await pRename(srcPackageJson, distPackageJson)
    try {
      await t.throwsAsync(zipNodeWithBundler(t, 'invalid-package-json', { fixtureDir }), expectedErrorRegex)
    } finally {
      await pRename(distPackageJson, srcPackageJson)
    }
  })

  test(`[bundler: ${bundler}] Ignore invalid require()`, async (t) => {
    await zipNodeWithBundler(t, 'invalid-require')
  })

  test(`[bundler: ${bundler}] Can require local files`, async (t) => {
    await zipNodeWithBundler(t, 'local-require')
  })

  test(`[bundler: ${bundler}] Can require local files deeply`, async (t) => {
    await zipNodeWithBundler(t, 'local-deep-require')
  })

  test(`[bundler: ${bundler}] Can require local files in the parent directories`, async (t) => {
    await zipNodeWithBundler(t, 'local-parent-require')
  })

  test(`[bundler: ${bundler}] Ignore missing critters dependency for Next.js 10`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-next10-critters')
  })

  test(`[bundler: ${bundler}] Ignore missing critters dependency for Next.js exact version 10.0.5`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-next10-critters-exact')
  })

  test(`[bundler: ${bundler}] Ignore missing critters dependency for Next.js with range ^10.0.5`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-next10-critters-10.0.5-range')
  })

  test(`[bundler: ${bundler}] Ignore missing critters dependency for Next.js with version='latest'`, async (t) => {
    await zipNodeWithBundler(t, 'node-module-next10-critters-latest')
  })

  // Need to create symlinks dynamically because they sometimes get lost when
  // committed on Windows
  if (platform !== 'win32') {
    test(`[bundler: ${bundler}] Can require symlinks`, async (t) => {
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
        await zipNodeWithBundler(t, 'symlinks', { fixtureDir })
      } finally {
        await pUnlink(symlinkFile)
      }
    })
  }

  test(`[bundler: ${bundler}] Can target a directory with a main file with the same name`, async (t) => {
    await zipNodeWithBundler(t, 'directory-handler')
  })

  test(`[bundler: ${bundler}] Can target a directory with an index.js file`, async (t) => {
    const { files, tmpDir } = await zipFixture(t, 'index-handler')
    await unzipFiles(files)
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    t.true(require(`${tmpDir}/function.js`))
  })

  test(`[bundler: ${bundler}] Keeps non-required files inside the target directory`, async (t) => {
    const { tmpDir } = await zipNodeWithBundler(t, 'keep-dir-files')
    t.true(await pathExists(`${tmpDir}/function.js`))
  })

  test(`[bundler: ${bundler}] Ignores non-required node_modules inside the target directory`, async (t) => {
    const { tmpDir } = await zipNodeWithBundler(t, 'ignore-dir-node-modules')
    t.false(await pathExists(`${tmpDir}/src/node_modules`))
  })

  test(`[bundler: ${bundler}] Ignores deep non-required node_modules inside the target directory`, async (t) => {
    const { tmpDir } = await zipNodeWithBundler(t, 'ignore-deep-dir-node-modules')
    t.false(await pathExists(`${tmpDir}/src/deep/node_modules`))
  })

  test(`[bundler: ${bundler}] Works with many dependencies`, async (t) => {
    await zipNodeWithBundler(t, 'many-dependencies')
  })

  test(`[bundler: ${bundler}] Works with many function files`, async (t) => {
    await zipNodeWithBundler(t, 'many-functions', { length: TEST_FUNCTIONS_LENGTH })
  })

  const TEST_FUNCTIONS_LENGTH = 6

  test(`[bundler: ${bundler}] Produces deterministic checksums`, async (t) => {
    const [checksumOne, checksumTwo] = await Promise.all([getZipChecksum(t), getZipChecksum(t)])
    t.is(checksumOne, checksumTwo)
  })

  test(`[bundler: ${bundler}] Throws when the source folder does not exist`, async (t) => {
    await t.throwsAsync(zipNodeWithBundler(t, 'does-not-exist'), /Functions folder does not exist/)
  })

  test(`[bundler: ${bundler}] Works even if destination folder does not exist`, async (t) => {
    await zipNodeWithBundler(t, 'simple')
  })

  test(`[bundler: ${bundler}] Do not consider node_modules as a function file`, async (t) => {
    await zipNodeWithBundler(t, 'ignore-node-modules')
  })

  test(`[bundler: ${bundler}] Ignore directories without a main file`, async (t) => {
    await zipNodeWithBundler(t, 'ignore-directories')
  })

  test(`[bundler: ${bundler}] Remove useless files`, async (t) => {
    const { tmpDir } = await zipNodeWithBundler(t, 'useless')
    t.false(await pathExists(`${tmpDir}/src/Desktop.ini`))
  })

  test(`[bundler: ${bundler}] Works on empty directories`, async (t) => {
    await zipNodeWithBundler(t, 'empty', { length: 0 })
  })

  test(`[bundler: ${bundler}] Works when no package.json is present`, async (t) => {
    const fixtureDir = await tmpName({ prefix: `zip-it-test-bundler-${bundler}` })
    await cpy('**', `${fixtureDir}/no-package-json`, { cwd: `${FIXTURES_DIR}/no-package-json`, parents: true })
    await zipNodeWithBundler(t, 'no-package-json', { length: 1, fixtureDir })
  })

  test(`[bundler: ${bundler}] Copies already zipped files`, async (t) => {
    const tmpDir = await tmpName({ prefix: `zip-it-test-bundler-${bundler}` })
    const { files } = await zipCheckFunctions(t, 'keep-zip', { tmpDir })

    t.true(files.every(({ runtime }) => runtime === 'js'))
    t.true(
      (await Promise.all(files.map(async ({ path }) => (await pReadFile(path, 'utf8')).trim() === 'test'))).every(
        Boolean,
      ),
    )
  })

  test(`[bundler: ${bundler}] Zips Go function files`, async (t) => {
    const { files, tmpDir } = await zipFixture(t, 'go-simple', { length: 1, opts: { zipGo: true } })

    t.true(files.every(({ runtime }) => runtime === 'go'))

    await unzipFiles(files)

    const unzippedFile = `${tmpDir}/test`
    t.true(await pathExists(unzippedFile))

    // The library we use for unzipping does not keep executable permissions.
    // https://github.com/cthackers/adm-zip/issues/86
    // However `chmod()` is not cross-platform
    if (platform === 'linux') {
      await pChmod(unzippedFile, EXECUTABLE_PERMISSION)

      const { stdout } = await execa(unzippedFile)
      t.is(stdout, 'test')
    }

    const tcFile = `${tmpDir}/netlify-toolchain`
    t.true(await pathExists(tcFile))
    const tc = (await pReadFile(tcFile, 'utf8')).trim()
    t.is(tc, '{"runtime":"go"}')
  })

  test(`[bundler: ${bundler}] Can skip zipping Go function files`, async (t) => {
    const { files } = await zipFixture(t, 'go-simple', { length: 1 })

    t.true(files.every(({ runtime }) => runtime === 'go'))
    t.true(
      (await Promise.all(files.map(async ({ path }) => !path.endsWith('.zip') && (await pathExists(path))))).every(
        Boolean,
      ),
    )
  })

  test(`[bundler: ${bundler}] Ignore unsupported programming languages`, async (t) => {
    await zipFixture(t, 'unsupported', { length: 0 })
  })

  test(`[bundler: ${bundler}] Can reduce parallelism`, async (t) => {
    await zipNodeWithBundler(t, 'simple', { length: 1, opts: { parallelLimit: 1 } })
  })

  test(`[bundler: ${bundler}] Can use zipFunction()`, async (t) => {
    const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
    const { runtime } = await zipFunction(`${FIXTURES_DIR}/simple/function.js`, tmpDir)
    t.is(runtime, 'js')
  })

  test(`[bundler: ${bundler}] Can list function main files with listFunctions()`, async (t) => {
    const fixtureDir = `${FIXTURES_DIR}/list`
    const functions = await listFunctions(fixtureDir)
    t.deepEqual(
      functions,
      [
        { name: 'four', mainFile: 'four.js/four.js.js', runtime: 'js', extension: '.js' },
        { name: 'one', mainFile: 'one/index.js', runtime: 'js', extension: '.js' },
        { name: 'test', mainFile: 'test', runtime: 'go', extension: '' },
        { name: 'test', mainFile: 'test.js', runtime: 'js', extension: '.js' },
        { name: 'test', mainFile: 'test.zip', runtime: 'js', extension: '.zip' },
        { name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.js' },
      ].map(normalizeFiles.bind(null, fixtureDir)),
    )
  })

  test(`[bundler: ${bundler}] Can list all function files with listFunctionsFiles()`, async (t) => {
    const fixtureDir = `${FIXTURES_DIR}/list`
    const functions = await listFunctionsFiles(fixtureDir)
    t.deepEqual(
      functions,
      [
        {
          name: 'four',
          mainFile: 'four.js/four.js.js',
          runtime: 'js',
          extension: '.js',
          srcFile: 'four.js/four.js.js',
        },
        { name: 'one', mainFile: 'one/index.js', runtime: 'js', extension: '.js', srcFile: 'one/index.js' },
        { name: 'test', mainFile: 'test', runtime: 'go', extension: '', srcFile: 'test' },
        { name: 'test', mainFile: 'test.js', runtime: 'js', extension: '.js', srcFile: 'test.js' },
        { name: 'test', mainFile: 'test.zip', runtime: 'js', extension: '.zip', srcFile: 'test.zip' },
        { name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.json', srcFile: 'two/three.json' },
        { name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.js', srcFile: 'two/two.js' },
      ].map(normalizeFiles.bind(null, fixtureDir)),
    )
  })

  test(`[bundler: ${bundler}] Zips Rust function files`, async (t) => {
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
})

// Legacy bundler tests.
test('[bundler: legacy] Zips node modules', async (t) => {
  await zipNode(t, 'node-module', { bundler: 'legacy' })
})

test('[bundler: legacy] Include most files from node modules', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included', { bundler: 'legacy' })
  const [mapExists, htmlExists] = await Promise.all([
    pathExists(`${tmpDir}/src/node_modules/test/test.map`),
    pathExists(`${tmpDir}/src/node_modules/test/test.html`),
  ])
  t.false(mapExists)
  t.true(htmlExists)
})

test('[bundler: legacy] Throws on missing critters dependency for Next.js 9', async (t) => {
  await t.throwsAsync(zipNode(t, 'node-module-next9-critters', { bundler: 'legacy' }))
})

test('[bundler: legacy] Includes specific Next.js dependencies when using next-on-netlify', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-next-on-netlify', { bundler: 'legacy' })
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

test('[bundler: legacy] Includes all Next.js dependencies when not using next-on-netlify', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-next', { bundler: 'legacy' })
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

// esbuild bundler tests.
test('[bundler: esbuild] Inlines node modules in the bundle', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', { bundler: 'esbuild' })
  const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

  t.false(requires.includes('test'))
  t.false(await pathExists(`${tmpDir}/src/node_modules/test`))
})

test('[bundler: esbuild] Does not inline node modules and includes them in a `node_modules` directory if they are defined in `externalModules`', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
    bundler: 'esbuild',
    opts: { externalModules: ['test'] },
  })
  const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

  t.true(requires.includes('test'))
  t.true(await pathExists(`${tmpDir}/src/node_modules/test`))
})

test('[bundler: esbuild] Does not inline node modules and excludes them from the bundle if they are defined in `ignoredModules`', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
    bundler: 'esbuild',
    opts: { ignoredModules: ['test'] },
  })
  const requires = await getRequires({ filePath: resolve(tmpDir, 'function.js') })

  t.true(requires.includes('test'))
  t.false(await pathExists(`${tmpDir}/src/node_modules/test`))
})

test('[bundler: esbuild] Include most files from node modules present in `externalModules`', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included', {
    bundler: 'esbuild',
    opts: { externalModules: ['test'] },
  })
  const [mapExists, htmlExists] = await Promise.all([
    pathExists(`${tmpDir}/src/node_modules/test/test.map`),
    pathExists(`${tmpDir}/src/node_modules/test/test.html`),
  ])
  t.false(mapExists)
  t.true(htmlExists)
})

test('[bundler: esbuild] Does not throw if one of the modules defined in `externalModules` does not exist', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included-try-catch', {
    bundler: 'esbuild',
    opts: { externalModules: ['i-do-not-exist'] },
  })

  t.false(await pathExists(`${tmpDir}/src/node_modules/i-do-not-exist`))
})
