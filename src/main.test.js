const { readFile, chmod, symlink, unlink } = require('fs')
const { tmpdir } = require('os')
const { normalize } = require('path')
const { platform } = require('process')

const test = require('ava')
const cpy = require('cpy')
const del = require('del')
const execa = require('execa')
const pathExists = require('path-exists')
const { dir: getTmpDir, tmpName } = require('tmp-promise')
const promisify = require('util.promisify')

const { zipFunction, listFunctions } = require('..')

const { zipNode, zipFixture, unzipFiles, zipCheckFunctions, FIXTURES_DIR } = require('./helpers/main.js')

const pReadFile = promisify(readFile)
const pChmod = promisify(chmod)
const pSymlink = promisify(symlink)
const pUnlink = promisify(unlink)

test.after(async () => {
  await del(`${tmpdir()}/zip-it-test*`, { force: true })
})

test('Zips Node.js function files', async t => {
  const { files } = await zipNode(t, 'simple')
  t.true(files.every(({ runtime }) => runtime === 'js'))
})

test('Zips node modules', async t => {
  await zipNode(t, 'node-module')
})

test('Can require node modules', async t => {
  await zipNode(t, 'local-node-module')
})

test('Can require scoped node modules', async t => {
  await zipNode(t, 'node-module-scope')
})

test('Can require node modules nested files', async t => {
  await zipNode(t, 'node-module-path')
})

test('Can require dynamically generated node modules', async t => {
  await zipNode(t, 'side-module')
})

test('Ignore some excluded node modules', async t => {
  const { tmpDir } = await zipNode(t, 'node-module-excluded')
  t.false(await pathExists(`${tmpDir}/src/node_modules/aws-sdk`))
})

test('Ignore TypeScript types', async t => {
  const { tmpDir } = await zipNode(t, 'node-module-typescript-types')
  t.false(await pathExists(`${tmpDir}/src/node_modules/@types/node`))
})

test('Include most files from node modules', async t => {
  const { tmpDir } = await zipNode(t, 'node-module-included')
  const [mapExists, htmlExists] = await Promise.all([
    pathExists(`${tmpDir}/src/node_modules/test/test.map`),
    pathExists(`${tmpDir}/src/node_modules/test/test.html`)
  ])
  t.false(mapExists)
  t.true(htmlExists)
})

test('Throws on runtime errors', async t => {
  await t.throwsAsync(zipNode(t, 'node-module-error'))
})

test('Throws on missing dependencies', async t => {
  await t.throwsAsync(zipNode(t, 'node-module-missing'))
})

test('Throws on missing dependencies with no optionalDependencies', async t => {
  await t.throwsAsync(zipNode(t, 'node-module-missing-package'))
})

test('Throws on missing conditional dependencies', async t => {
  await t.throwsAsync(zipNode(t, 'node-module-missing-conditional'))
})

test("Throws on missing dependencies' dependencies", async t => {
  await t.throwsAsync(zipNode(t, 'node-module-missing-deep'))
})

test('Ignore missing optional dependencies', async t => {
  await zipNode(t, 'node-module-missing-optional')
})

test('Ignore modules conditional dependencies', async t => {
  await zipNode(t, 'node-module-deep-conditional')
})

test('Ignore missing optional peer dependencies', async t => {
  await zipNode(t, 'node-module-peer-optional')
})

test('Throws on missing optional peer dependencies with no peer dependencies', async t => {
  await t.throwsAsync(zipNode(t, 'node-module-peer-optional-none'))
})

test('Throws on missing non-optional peer dependencies', async t => {
  await t.throwsAsync(zipNode(t, 'node-module-peer-not-optional'))
})

test('Ignore invalid require()', async t => {
  await zipNode(t, 'invalid-require')
})

test('Can require local files', async t => {
  await zipNode(t, 'local-require')
})

test('Can require local files deeply', async t => {
  await zipNode(t, 'local-deep-require')
})

test('Can require local files in the parent directories', async t => {
  await zipNode(t, 'local-parent-require')
})

// Need to create symlinks dynamically because they sometimes get lost when
// committed on Windows
if (platform !== 'win32') {
  test('Can require symlinks', async t => {
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

test('Can target a directory with a main file with the same name', async t => {
  await zipNode(t, 'directory-handler')
})

test('Can target a directory with an index.js file', async t => {
  const { files, tmpDir } = await zipFixture(t, 'index-handler')
  await unzipFiles(files)
  t.true(require(`${tmpDir}/function.js`))
})

test('Keeps non-required files inside the target directory', async t => {
  const { tmpDir } = await zipNode(t, 'keep-dir-files')
  t.true(await pathExists(`${tmpDir}/function.js`))
})

test('Ignores non-required node_modules inside the target directory', async t => {
  const { tmpDir } = await zipNode(t, 'ignore-dir-node-modules')
  t.false(await pathExists(`${tmpDir}/src/node_modules`))
})

test('Ignores deep non-required node_modules inside the target directory', async t => {
  const { tmpDir } = await zipNode(t, 'ignore-deep-dir-node-modules')
  t.false(await pathExists(`${tmpDir}/src/deep/node_modules`))
})

test('Works with many dependencies', async t => {
  await zipNode(t, 'many-dependencies')
})

test('Works with many function files', async t => {
  await zipNode(t, 'many-functions', 6)
})

test('Throws when the source folder does not exist', async t => {
  await t.throwsAsync(zipNode(t, 'does-not-exist'), /Functions folder does not exist/)
})

test('Works even if destination folder does not exist', async t => {
  await zipNode(t, 'simple')
})

test('Do not consider node_modules as a function file', async t => {
  await zipNode(t, 'ignore-node-modules')
})

test('Ignore directories without a main file', async t => {
  await zipNode(t, 'ignore-directories')
})

test('Remove useless files', async t => {
  const { tmpDir } = await zipNode(t, 'useless')
  t.false(await pathExists(`${tmpDir}/src/Desktop.ini`))
})

test('Works on empty directories', async t => {
  await zipNode(t, 'empty', 0)
})

test('Works when no package.json is present', async t => {
  const tmpDir = await tmpName({ prefix: 'zip-it-test' })
  await cpy('**', `${tmpDir}/no-package-json`, { cwd: `${FIXTURES_DIR}/no-package-json`, parents: true })
  await zipNode(t, 'no-package-json', 1, {}, tmpDir)
})

test('Copies already zipped files', async t => {
  const tmpDir = await tmpName({ prefix: 'zip-it-test' })
  const { files } = await zipCheckFunctions(t, 'keep-zip', tmpDir)

  t.true(files.every(({ runtime }) => runtime === 'js'))
  t.true(
    (await Promise.all(files.map(async ({ path }) => (await pReadFile(path, 'utf8')).trim() === 'test'))).every(Boolean)
  )
})

test('Zips Go function files', async t => {
  const { files, tmpDir } = await zipFixture(t, 'go-simple', 1, { zipGo: true })

  t.true(files.every(({ runtime }) => runtime === 'go'))

  await unzipFiles(files)

  const unzippedFile = `${tmpDir}/test`

  await pathExists(unzippedFile)

  // The library we use for unzipping does not keep executable permissions.
  // https://github.com/cthackers/adm-zip/issues/86
  // However `chmod()` is not cross-platform
  if (platform === 'linux') {
    await pChmod(unzippedFile, 0o755)

    const { stdout } = await execa(unzippedFile)
    t.is(stdout, 'test')
  }
})

test('Can skip zipping Go function files', async t => {
  const { files } = await zipFixture(t, 'go-simple', 1)

  t.true(files.every(({ runtime }) => runtime === 'go'))
  t.true(
    (await Promise.all(files.map(async ({ path }) => !path.endsWith('.zip') && (await pathExists(path))))).every(
      Boolean
    )
  )
})

test('Ignore unsupported programming languages', async t => {
  await zipFixture(t, 'unsupported', 0)
})

test('Can reduce parallelism', async t => {
  await zipNode(t, 'simple', 1, { parallelLimit: 1 })
})

test('Can use zipFunction()', async t => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const { runtime } = await zipFunction(`${FIXTURES_DIR}/simple/function.js`, tmpDir)
  t.is(runtime, 'js')
})

const normalizeFiles = function(fixtureDir, { mainFile, runtime, extension, srcFiles }) {
  const mainFileA = normalize(`${fixtureDir}/${mainFile}`)
  const srcFilesA = srcFiles.map(file => normalize(`${fixtureDir}/${file}`))
  return { mainFile: mainFileA, runtime, extension, srcFiles: srcFilesA }
}

test('Can list function file with listFunctions()', async t => {
  const fixtureDir = `${FIXTURES_DIR}/list`
  const functions = await listFunctions(fixtureDir)
  t.deepEqual(
    functions,
    [
      { mainFile: 'one/index.js', runtime: 'js', extension: '.js', srcFiles: ['one/index.js'] },
      { mainFile: 'test', runtime: 'go', extension: '', srcFiles: ['test'] },
      { mainFile: 'test.js', runtime: 'js', extension: '.js', srcFiles: ['test.js'] },
      { mainFile: 'test.zip', runtime: 'js', extension: '.zip', srcFiles: ['test.zip'] },
      { mainFile: 'two/two.js', runtime: 'js', extension: '.js', srcFiles: ['two/three.js', 'two/two.js'] }
    ].map(normalizeFiles.bind(null, fixtureDir))
  )
})
