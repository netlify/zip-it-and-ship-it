const { readFile, writeFile } = require('fs')
const { relative, resolve } = require('path')
const { promisify } = require('util')

const pReadFile = promisify(readFile)
const pWriteFile = promisify(writeFile)

const PATH_FORMAT_ABSOLUTE = 'absolute'
const PATH_FORMAT_RELATIVE = 'relative'

const getPathFormat = (configProperty) =>
  configProperty === PATH_FORMAT_ABSOLUTE ? PATH_FORMAT_ABSOLUTE : PATH_FORMAT_RELATIVE

// Takes a path to a sourcemap file and rewrites it to the same location with
// the paths in `sources` transformed based on the value of `pathFormat`.
// - If set to `absolute`, absolute paths will be used;
// - If set to `relative`, the paths will be relative to `srcDir`.
const processSourcemap = async ({ pathFormat: pathFormatConfig, sourcemapPath, srcDir }) => {
  if (!sourcemapPath) {
    return
  }

  const pathFormat = getPathFormat(pathFormatConfig)
  const data = await pReadFile(sourcemapPath, 'utf8')
  const sourcemap = JSON.parse(data)
  console.log('sources:', sourcemap.sources)
  const newSources = sourcemap.sources.map((path) => {
    const absolutePath = resolve(path)

    if (pathFormat === PATH_FORMAT_ABSOLUTE) {
      return absolutePath
    }

    const relativePath = relative(srcDir, absolutePath)

    return relativePath
  })
  console.log('newSources:', newSources)
  const newSourcemap = {
    ...sourcemap,
    sources: newSources,
  }

  await pWriteFile(sourcemapPath, JSON.stringify(newSourcemap))
}

module.exports = { processSourcemap }
