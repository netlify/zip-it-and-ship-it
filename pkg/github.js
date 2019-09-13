const execa = require('execa')

const { getTargets } = require('./targets.js')

// Upload as GitHub assets
const createGitHubRelease = async function() {
  const archivePaths = getTargets()
    .map(getArchivePath)
    .join(',')

  await execa.command(`gh-release -a ${archivePaths}`)
}

const getArchivePath = function({ archivePath }) {
  return archivePath
}

createGitHubRelease()
