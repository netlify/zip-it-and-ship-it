const { readFile, chmod, symlink, unlink, rename } = require('fs')
const { tmpdir } = require('os')
const { normalize } = require('path')
const { platform } = require('process')
const { promisify } = require('util')

const test = require('ava')
const cpy = require('cpy')
const del = require('del')
const execa = require('execa')
const pathExists = require('path-exists')
const { dir: getTmpDir, tmpName } = require('tmp-promise')

const { zipFunction, listFunctions, listFunctionsFiles } = require('..')

const { zipNode, zipFixture, unzipFiles, zipCheckFunctions, FIXTURES_DIR } = require('./helpers/main')
const { computeSha1 } = require('./helpers/sha')

const pReadFile = promisify(readFile)
const pChmod = promisify(chmod)
const pSymlink = promisify(symlink)
const pUnlink = promisify(unlink)
const pRename = promisify(rename)

test.after(async () => {
  await del(`${tmpdir()}/zip-it-test*`, { force: true })
})

test('Zips Node.js function files', async (t) => {
  const { files } = await zipNode(t, 'simple')
  t.true(files.every(({ runtime }) => runtime === 'js'))
})

test('Zips node modules', async (t) => {
  await zipNode(t, 'node-module')
})

test('Can require node modules', async (t) => {
  await zipNode(t, 'local-node-module')
})

test('Can require scoped node modules', async (t) => {
  await zipNode(t, 'node-module-scope')
})

test('Can require node modules nested files', async (t) => {
  await zipNode(t, 'node-module-path')
})

test('Can require dynamically generated node modules', async (t) => {
  await zipNode(t, 'side-module')
})

test('Ignore some excluded node modules', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-excluded')
  t.false(await pathExists(`${tmpDir}/src/node_modules/aws-sdk`))
})

test('Ignore TypeScript types', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-typescript-types')
  t.false(await pathExists(`${tmpDir}/src/node_modules/@types/node`))
})

test('Include most files from node modules', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-included')
  const [mapExists, htmlExists] = await Promise.all([
    pathExists(`${tmpDir}/src/node_modules/test/test.map`),
    pathExists(`${tmpDir}/src/node_modules/test/test.html`),
  ])
  t.false(mapExists)
  t.true(htmlExists)
})

test('Includes specific Next.js dependencies when using next-on-netlify', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-next-on-netlify')
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

test('Includes all Next.js dependencies when not using next-on-netlify', async (t) => {
  const { tmpDir } = await zipNode(t, 'node-module-next')
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

test('Throws on runtime errors', async (t) => {
  await t.throwsAsync(zipNode(t, 'node-module-error'))
})

test('Throws on missing dependencies', async (t) => {
  await t.throwsAsync(zipNode(t, 'node-module-missing'))
})

test('Throws on missing dependencies with no optionalDependencies', async (t) => {
  await t.throwsAsync(zipNode(t, 'node-module-missing-package'))
})

test('Throws on missing conditional dependencies', async (t) => {
  await t.throwsAsync(zipNode(t, 'node-module-missing-conditional'))
})

test("Throws on missing dependencies' dependencies", async (t) => {
  await t.throwsAsync(zipNode(t, 'node-module-missing-deep'))
})

test('Ignore missing optional dependencies', async (t) => {
  await zipNode(t, 'node-module-missing-optional')
})

test('Ignore modules conditional dependencies', async (t) => {
  await zipNode(t, 'node-module-deep-conditional')
})

test('Ignore missing optional peer dependencies', async (t) => {
  await zipNode(t, 'node-module-peer-optional')
})

test('Throws on missing optional peer dependencies with no peer dependencies', async (t) => {
  await t.throwsAsync(zipNode(t, 'node-module-peer-optional-none'))
})

test('Throws on missing non-optional peer dependencies', async (t) => {
  await t.throwsAsync(zipNode(t, 'node-module-peer-not-optional'))
})

test('Throws on missing critters dependency for Next.js 9', async (t) => {
  await t.throwsAsync(zipNode(t, 'node-module-next9-critters'))
})

test('Ignore missing critters dependency for Next.js 10', async (t) => {
  await zipNode(t, 'node-module-next10-critters')
})

test('Ignore missing critters dependency for Next.js exact version 10.0.5', async (t) => {
  await zipNode(t, 'node-module-next10-critters-exact')
})

test('Resolves dependencies from .netlify/plugins/node_modules', async (t) => {
  await zipNode(t, 'node-module-next-image')
})

// We persist `package.json` as `package.json.txt` in git. Otherwise ESLint
// tries to load when linting sibling JavaScript files. In this test, we
// temporarily rename it to an actual `package.json`.
test('Throws on invalid package.json', async (t) => {
  const invalidPackageJsonDir = `${FIXTURES_DIR}/invalid-package-json`
  const srcPackageJson = `${invalidPackageJsonDir}/package.json.txt`
  const distPackageJson = `${invalidPackageJsonDir}/package.json`

  await pRename(srcPackageJson, distPackageJson)
  try {
    await t.throwsAsync(zipNode(t, 'invalid-package-json'), /invalid JSON/)
  } finally {
    await pRename(distPackageJson, srcPackageJson)
  }
})

test('Ignore invalid require()', async (t) => {
  await zipNode(t, 'invalid-require')
})

test('Can require local files', async (t) => {
  await zipNode(t, 'local-require')
})

test('Can require local files deeply', async (t) => {
  await zipNode(t, 'local-deep-require')
})

test('Can require local files in the parent directories', async (t) => {
  await zipNode(t, 'local-parent-require')
})

// Need to create symlinks dynamically because they sometimes get lost when
// committed on Windows
if (platform !== 'win32') {
  test('Can require symlinks', async (t) => {
    const symlinkDir = `${FIXTURES_DIR}/symlinks/function`
    const symlinkFile = `${symlinkDir}/file.js`
    const targetFile = `${symlinkDir}/target.js`

    if (!(await pathExists(symlinkFile))) {
      await pSymlink(targetFile, symlinkFile)
    }

    try {
      await zipNode(t, 'symlinks')
    } finally {
      await pUnlink(symlinkFile)
    }
  })
}

test('Can target a directory with a main file with the same name', async (t) => {
  await zipNode(t, 'directory-handler')
})

test('Can target a directory with an index.js file', async (t) => {
  const { files, tmpDir } = await zipFixture(t, 'index-handler')
  await unzipFiles(files)
  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  t.true(require(`${tmpDir}/function.js`))
})

test('Keeps non-required files inside the target directory', async (t) => {
  const { tmpDir } = await zipNode(t, 'keep-dir-files')
  t.true(await pathExists(`${tmpDir}/function.js`))
})

test('Ignores non-required node_modules inside the target directory', async (t) => {
  const { tmpDir } = await zipNode(t, 'ignore-dir-node-modules')
  t.false(await pathExists(`${tmpDir}/src/node_modules`))
})

test('Ignores deep non-required node_modules inside the target directory', async (t) => {
  const { tmpDir } = await zipNode(t, 'ignore-deep-dir-node-modules')
  t.false(await pathExists(`${tmpDir}/src/deep/node_modules`))
})

test('Works with many dependencies', async (t) => {
  await zipNode(t, 'many-dependencies')
})

test('Works with many function files', async (t) => {
  await zipNode(t, 'many-functions', { length: TEST_FUNCTIONS_LENGTH })
})

const TEST_FUNCTIONS_LENGTH = 6

test('Produces deterministic checksums', async (t) => {
  const [checksumOne, checksumTwo] = await Promise.all([getZipChecksum(t), getZipChecksum(t)])
  t.is(checksumOne, checksumTwo)
})

const getZipChecksum = async function (t) {
  const {
    files: [{ path }],
  } = await zipFixture(t, 'many-dependencies')
  const sha1sum = computeSha1(path)
  return sha1sum
}

test('Throws when the source folder does not exist', async (t) => {
  await t.throwsAsync(zipNode(t, 'does-not-exist'), /Functions folder does not exist/)
})

test('Works even if destination folder does not exist', async (t) => {
  await zipNode(t, 'simple')
})

test('Do not consider node_modules as a function file', async (t) => {
  await zipNode(t, 'ignore-node-modules')
})

test('Ignore directories without a main file', async (t) => {
  await zipNode(t, 'ignore-directories')
})

test('Remove useless files', async (t) => {
  const { tmpDir } = await zipNode(t, 'useless')
  t.false(await pathExists(`${tmpDir}/src/Desktop.ini`))
})

test('Works on empty directories', async (t) => {
  await zipNode(t, 'empty', { length: 0 })
})

test('Works when no package.json is present', async (t) => {
  const fixtureDir = await tmpName({ prefix: 'zip-it-test' })
  await cpy('**', `${fixtureDir}/no-package-json`, { cwd: `${FIXTURES_DIR}/no-package-json`, parents: true })
  await zipNode(t, 'no-package-json', { length: 1, fixtureDir })
})

test('Copies already zipped files', async (t) => {
  const tmpDir = await tmpName({ prefix: 'zip-it-test' })
  const { files } = await zipCheckFunctions(t, 'keep-zip', { tmpDir })

  t.true(files.every(({ runtime }) => runtime === 'js'))
  t.true(
    (await Promise.all(files.map(async ({ path }) => (await pReadFile(path, 'utf8')).trim() === 'test'))).every(
      Boolean,
    ),
  )
})

test('Zips Go function files', async (t) => {
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

test('Can skip zipping Go function files', async (t) => {
  const { files } = await zipFixture(t, 'go-simple', { length: 1 })

  t.true(files.every(({ runtime }) => runtime === 'go'))
  t.true(
    (await Promise.all(files.map(async ({ path }) => !path.endsWith('.zip') && (await pathExists(path))))).every(
      Boolean,
    ),
  )
})

test('Ignore unsupported programming languages', async (t) => {
  await zipFixture(t, 'unsupported', { length: 0 })
})

test('Can reduce parallelism', async (t) => {
  await zipNode(t, 'simple', { length: 1, opts: { parallelLimit: 1 } })
})

test('Can use zipFunction()', async (t) => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const { runtime } = await zipFunction(`${FIXTURES_DIR}/simple/function.js`, tmpDir)
  t.is(runtime, 'js')
})

const normalizeFiles = function (fixtureDir, { name, mainFile, runtime, extension, srcFile }) {
  const mainFileA = normalize(`${fixtureDir}/${mainFile}`)
  const srcFileA = srcFile === undefined ? {} : { srcFile: normalize(`${fixtureDir}/${srcFile}`) }
  return { name, mainFile: mainFileA, runtime, extension, ...srcFileA }
}

test('Can list function main files with listFunctions()', async (t) => {
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

test('Can list all function files with listFunctionsFiles()', async (t) => {
  const fixtureDir = `${FIXTURES_DIR}/list`
  const functions = await listFunctionsFiles(fixtureDir)
  t.deepEqual(
    functions,
    [
      { name: 'four', mainFile: 'four.js/four.js.js', runtime: 'js', extension: '.js', srcFile: 'four.js/four.js.js' },
      { name: 'one', mainFile: 'one/index.js', runtime: 'js', extension: '.js', srcFile: 'one/index.js' },
      { name: 'test', mainFile: 'test', runtime: 'go', extension: '', srcFile: 'test' },
      { name: 'test', mainFile: 'test.js', runtime: 'js', extension: '.js', srcFile: 'test.js' },
      { name: 'test', mainFile: 'test.zip', runtime: 'js', extension: '.zip', srcFile: 'test.zip' },
      { name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.json', srcFile: 'two/three.json' },
      { name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.js', srcFile: 'two/two.js' },
    ].map(normalizeFiles.bind(null, fixtureDir)),
  )
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

const EXECUTABLE_PERMISSION = 0o755
