const { createReadStream } = require('fs')
const { createGunzip } = require('zlib')
const { platform } = require('process')

const test = require('ava')
const readdirp = require('readdirp')
const { extract } = require('tar-fs')
const endOfStream = require('end-of-stream')
const del = require('del')
const promisify = require('util.promisify')
const fastGlob = require('fast-glob')
const execa = require('execa')
const isCi = require('is-ci')

const { version } = require('../package.json')

const { build } = require('./build')

const BUILD_DIR = `${__dirname}/../build`

const pEndOfStream = promisify(endOfStream)

test('Should build GitHub assets', async t => {
  // The `pkg` library has issues running properly in CI.
  // https://travis-ci.org/netlify/zip-it-and-ship-it/jobs/584684132
  // There are lots of issues on the `pkg` GitHub repositories related to CI
  // problems. For the moment, this test will have to be useful for local tests
  // only.
  if (isCi) {
    return t.pass()
  }

  await build()

  const files = await readdirp.promise(BUILD_DIR)

  await Promise.all(files.map(unarchive))

  const binaries = await fastGlob(`${BUILD_DIR}/*${OS[platform]}*/*`)

  await Promise.all(binaries.map(binary => fireBinary(t, binary)))

  await del(BUILD_DIR)
})

const unarchive = async function({ fullPath }) {
  const stream = createReadStream(fullPath)
    .pipe(createGunzip())
    .pipe(extract(BUILD_DIR))
  await pEndOfStream(stream)
}

const OS = { linux: 'linux', darwin: 'macos', win32: 'windows' }

const fireBinary = async function(t, binary) {
  const { stdout } = await execa(binary, ['--version'])
  t.is(stdout, version)
}
