const path = require('path')
const fs = require('fs')

const glob = require('glob')
const archiver = require('archiver')
const elfTools = require('elf-tools')
const pAll = require('p-all')
const commonPathPrefix = require('common-path-prefix')

const { getDependencies, findModuleDir, findHandler } = require('./finders')

class Zip {
  constructor(path) {
    this.output = fs.createWriteStream(path)
    this.archive = archiver('zip', { level: 9 })
    this.archive.pipe(this.output)
  }

  addLocalFile(path, data) {
    this.archive.file(path, data)
  }

  finalize() {
    return new Promise((resolve, reject) => {
      this.output.on('end', resolve)
      this.output.on('close', resolve)
      this.output.on('finish', resolve)
      this.output.on('error', reject)
      this.archive.finalize()
    })
  }
}

function filesForFunctionZip(functionPath) {
  const filesToBundle = new Set()
  if (fs.lstatSync(functionPath).isDirectory()) {
    const moduledir = findModuleDir(functionPath)
    const ignoreArgs = [moduledir, 'node_modules', '**'].filter(segment => segment != null)
    glob
      .sync(path.join(functionPath, '**'), {
        nodir: true,
        ignore: path.join(...ignoreArgs),
        absolute: true
      })
      .forEach(file => filesToBundle.add(file))
    if (moduledir) {
      let handler = null
      const namedHandler = path.join(functionPath, `${path.basename(functionPath)}.js`)
      const indexHandler = path.join(functionPath, 'index.js')
      if (fs.existsSync(namedHandler)) {
        handler = namedHandler
      } else if (fs.existsSync(indexHandler)) {
        handler = indexHandler
      } else {
        throw ('Failed to find handler for ', functionPath)
      }

      getDependencies(handler, moduledir).forEach(file => filesToBundle.add(file))
    }
  } else {
    filesToBundle.add(functionPath)
    const moduledir = findModuleDir(path.dirname(functionPath))
    if (moduledir) {
      getDependencies(functionPath, moduledir).forEach(file => filesToBundle.add(file))
    }
  }
  return filesToBundle
}

function isGoExe(file) {
  try {
    const buf = fs.readFileSync(file)
    const elf = elfTools.parse(buf)
    return elf.sections.find(s => s.header.name === '.note.go.buildid')
  } catch (e) {
    return false
  }
}

function zipGoExe(file, zipPath) {
  const zip = new Zip(zipPath)
  const stat = fs.lstatSync(file)
  zip.addLocalFile(file, {
    name: path.basename(file),
    mode: stat.mode,
    date: new Date(0), // Ensure sha256 stability regardless of mtime
    stats: stat
  })
  return zip.finalize()
}

function addEntryFile(functionPath, commonPrefix, zip) {
  const mainFile = fs.lstatSync(functionPath).isDirectory()
    ? `${functionPath}/${path.basename(functionPath)}.js`
    : functionPath
  const entryFile = path.basename(mainFile)
  const mainPath = mainFile.replace(commonPrefix, 'src/')
  const content = Buffer.from(`module.exports = require('./${mainPath}')`)
  zip.archive.append(content, { name: entryFile, date: new Date(0) })
}

function zipJs(functionPath, zipPath) {
  const zip = new Zip(zipPath)

  const files = filesForFunctionZip(functionPath)
  const commonPrefix = commonPathPrefix([...files])

  addEntryFile(functionPath, commonPrefix, zip)

  files.forEach(file => {
    const entryPath = file.replace(commonPrefix, 'src/')
    const stat = fs.lstatSync(file)
    zip.addLocalFile(file, {
      name: entryPath,
      mode: stat.mode,
      date: new Date(0), // Ensure sha256 stability regardless of mtime
      stats: stat
    })
  })
  return zip.finalize()
}

function zipFunction(functionPath, destFolder, options) {
  if (path.basename(functionPath) === 'node_modules') {
    return Promise.resolve(null)
  }
  const zipPath = path.join(destFolder, path.basename(functionPath).replace(/\.(js|zip)$/, '') + '.zip')
  if (path.extname(functionPath) === '.zip') {
    fs.copyFileSync(functionPath, zipPath)
    return Promise.resolve({
      path: zipPath,
      runtime: 'js'
    })
  }
  const ds = fs.lstatSync(functionPath)
  if (ds.isDirectory() || path.extname(functionPath) === '.js') {
    if (!findHandler(functionPath)) {
      return Promise.resolve(null)
    }
    return zipJs(functionPath, zipPath).then(() => {
      return {
        path: zipPath,
        runtime: 'js'
      }
    })
  }
  if (isGoExe(functionPath)) {
    if (options && options.skipGo) {
      const goPath = path.join(destFolder, path.basename(functionPath))
      fs.copyFileSync(functionPath, goPath)
      return Promise.resolve({
        path: goPath,
        runtime: 'go'
      })
    }

    return zipGoExe(functionPath, zipPath).then(() => {
      return {
        path: zipPath,
        runtime: 'go'
      }
    })
  }
  return Promise.resolve(null)
}

function zipFunctions(srcFolder, destFolder, options) {
  options = Object.assign(
    {
      parallelLimit: 5
    },
    options
  )
  return pAll(
    fs
      .readdirSync(srcFolder)
      .map(file => () => zipFunction(path.resolve(path.join(srcFolder, file)), destFolder, options)),
    { concurrency: options.parallelLimit }
  ).then(zipped => zipped.filter(e => e))
}

module.exports = {
  getDependencies,
  filesForFunctionZip,
  zipFunction,
  zipFunctions
}
