const { startZip, addZipFile, addZipContent, endZip } = require('./archive')

// Zip a binary function file
const zipBinary = async function ({ srcPath, destPath, filename, stat, runtime }) {
  const { archive, output } = startZip(destPath)
  addZipFile(archive, srcPath, filename, stat)
  addZipContent(archive, JSON.stringify({ runtime: runtime.name }), 'netlify-toolchain')
  await endZip(archive, output)
}

module.exports = { zipBinary }
