const { createWriteStream } = require('fs')
const { createGzip } = require('zlib')

const del = require('del')
const { pack } = require('tar-fs')
const endOfStream = require('end-of-stream')
const execa = require('execa')
const promisify = require('util.promisify')

const { getTargets, ROOT_DIR, BUILD_DIR } = require('./targets.js')

const pEndOfStream = promisify(endOfStream)

// Build self-contained binaries for several possible OS and Node.js versions,
// using `pkg`. The binaries are uploaded as GitHub assets.
const build = async function() {
  await del(BUILD_DIR)

  const targets = getTargets()

  await Promise.all(targets.map(buildTarget))
}

const buildTarget = async function({ name, archiveName, archivePath }) {
  const archiveDir = `${BUILD_DIR}/${archiveName}`
  const archiveOutput = `${archiveDir}/${archiveName}/${archiveName}`

  // We are not using `require('pkg')` because it downloads Node.js binaries
  // serially, which is slow
  await execa.command(`pkg ${ROOT_DIR} -t ${name} --output ${archiveOutput}`, {
    preferLocal: true
  })

  await tar({ archiveDir, archivePath })

  await del(archiveDir)
}

const tar = async function({ archiveDir, archivePath }) {
  const stream = pack(archiveDir)
    .pipe(createGzip())
    .pipe(createWriteStream(archivePath))
  await pEndOfStream(stream)
}

module.exports = { build }
