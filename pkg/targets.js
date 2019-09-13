const { version } = require('../package.json')

const REPO_NAME = 'zip-it-and-ship-it'
const ROOT_DIR = `${__dirname}/..`
const BUILD_DIR = `${ROOT_DIR}/build`

// Get all possible targets (Node.js version + OS + CPU) for `pkg`
const getTargets = function() {
  const nestedTargets = NODE_VERSIONS.map(node => OS.map(os => ARCHS.map(arch => getTarget({ node, os, arch }))))
  return [].concat(...[].concat(...nestedTargets))
}

const NODE_VERSIONS = ['node8', 'node10', 'node12']
const OS = ['linux', 'macos', 'windows']
const ARCHS = ['x64']

const getTarget = function({ node, os, arch }) {
  const name = `${node}-${os}-${arch}`
  const archiveName = `${REPO_NAME}_${version}_${name}`
  const archivePath = `${BUILD_DIR}/${archiveName}.tar.gz`
  return { node, os, arch, name, archiveName, archivePath }
}

module.exports = { getTargets, ROOT_DIR, BUILD_DIR }
