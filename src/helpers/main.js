/* eslint-disable node/no-unpublished-require */
const { join } = require('path')

const AdmZip = require('adm-zip')
const { dir: getTmpDir } = require('tmp-promise')
const promisify = require('util.promisify')

const { zipFunctions } = require('../..')

const FIXTURES_DIR = join(__dirname, '..', 'fixtures')

const zipNode = async function(t, fixture, length, opts, fixtureDir) {
  const { files, tmpDir } = await zipFixture(t, fixture, length, opts, fixtureDir)
  await requireExtractedFiles(t, files)
  return { files, tmpDir }
}

const zipFixture = async function(t, fixture, length, opts, fixtureDir) {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const { files } = await zipCheckFunctions(t, fixture, tmpDir, length, opts, fixtureDir)
  return { files, tmpDir }
}

const zipCheckFunctions = async function(t, fixture, tmpDir, length = 1, opts, fixtureDir = FIXTURES_DIR) {
  const files = await zipFunctions(`${fixtureDir}/${fixture}`, tmpDir, opts)

  t.true(Array.isArray(files))
  t.is(files.length, length)

  return { files, tmpDir }
}

const requireExtractedFiles = async function(t, files) {
  await unzipFiles(files)

  const jsFiles = files.map(replaceUnzipPath).map(require)
  t.true(jsFiles.every(Boolean))
}

const unzipFiles = async function(files) {
  await Promise.all(files.map(unzipFile))
}

const unzipFile = async function({ path }) {
  const zip = new AdmZip(path)
  const pExtractAll = promisify(zip.extractAllToAsync.bind(zip))
  await pExtractAll(`${path}/..`, false)
}

const replaceUnzipPath = function({ path }) {
  return path.replace('.zip', '.js')
}

module.exports = {
  zipNode,
  zipFixture,
  unzipFiles,
  zipCheckFunctions,
  FIXTURES_DIR
}
