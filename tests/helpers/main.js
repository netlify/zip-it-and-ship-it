const { dirname, join, resolve } = require('path')
const { env } = require('process')
const { promisify } = require('util')

const AdmZip = require('adm-zip')
const { dir: getTmpDir } = require('tmp-promise')

const { zipFunctions } = require('../..')
const { listImports } = require('../../dist/runtimes/node/bundlers/zisi/list_imports')

const FIXTURES_DIR = join(__dirname, '..', 'fixtures')

const zipNode = async function (t, fixture, { length, fixtureDir, opts } = {}) {
  const { files, tmpDir } = await zipFixture(t, fixture, {
    length,
    fixtureDir,
    opts,
  })
  const { archiveFormat } = opts || {}

  if (archiveFormat === undefined || archiveFormat === 'zip') {
    await requireExtractedFiles(t, files)
  }

  return { files, tmpDir }
}

const zipFixture = async function (t, fixture, { length, fixtureDir, opts = {} } = {}) {
  const { config = {} } = opts
  const bundlerString = (config['*'] && config['*'].nodeBundler) || 'default'
  const { path: tmpDir } = await getTmpDir({
    prefix: `zip-it-test-bundler-${bundlerString}`,
  })

  if (env.ZISI_KEEP_TEMP_DIRS !== undefined) {
    console.log(tmpDir)
  }

  const { files } = await zipCheckFunctions(t, fixture, { length, fixtureDir, tmpDir, opts })
  return { files, tmpDir }
}

const zipCheckFunctions = async function (t, fixture, { length = 1, fixtureDir = FIXTURES_DIR, tmpDir, opts } = {}) {
  const srcFolders = Array.isArray(fixture)
    ? fixture.map((srcFolder) => `${fixtureDir}/${srcFolder}`)
    : `${fixtureDir}/${fixture}`
  const files = await zipFunctions(srcFolders, tmpDir, opts)

  t.true(Array.isArray(files))
  t.is(files.length, length)

  return { files, tmpDir }
}

const requireExtractedFiles = async function (t, files) {
  await unzipFiles(files)

  const jsFiles = files.map(replaceUnzipPath).map(require)
  t.true(jsFiles.every(Boolean))
}

const unzipFiles = async function (files, targetPathGenerator) {
  await Promise.all(files.map(({ path }) => unzipFile({ path, targetPathGenerator })))
}

const unzipFile = async function ({ path, targetPathGenerator }) {
  const zip = new AdmZip(path)
  const pExtractAll = promisify(zip.extractAllToAsync.bind(zip))
  const targetPath = targetPathGenerator ? targetPathGenerator(path) : `${path}/..`
  await pExtractAll(targetPath, false)
}

const replaceUnzipPath = function ({ path }) {
  return path.replace('.zip', '.js')
}

// Returns a list of paths included using `require` calls. Relative requires
// will be traversed recursively up to a depth defined by `depth`. All the
// required paths — relative or not — will be returned in a flattened array.
const getRequires = async function ({ depth = Number.POSITIVE_INFINITY, filePath }, currentDepth = 1) {
  const requires = await listImports({ path: filePath })

  if (currentDepth >= depth) {
    return requires
  }

  const basePath = dirname(filePath)
  const childRequires = requires.reduce((result, requirePath) => {
    if (!requirePath.startsWith('.')) {
      return result
    }

    const fullRequirePath = resolve(basePath, requirePath)

    return [...result, ...getRequires({ depth, filePath: fullRequirePath }, currentDepth + 1)]
  }, [])

  return [...requires, ...childRequires]
}

module.exports = {
  getRequires,
  zipNode,
  zipFixture,
  unzipFiles,
  zipCheckFunctions,
  FIXTURES_DIR,
}
