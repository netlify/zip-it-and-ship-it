const path = require("path");
const glob = require("glob");
const cp = require("child_process");
const parallelLimit = require("run-parallel-limit");
const fs = require("fs");

module.exports = async function installFunctionDeps(src, opts) {
  opts = Object.assign({
    logFn: (msg) => {/* noop */}
  }, opts)

  const { logFn } = opts

  const hasNpm = await verifyInstaller('npm')
  const hasYarn = await verifyInstaller('yarn')
  if (!hasNpm) throw new Error("zip-it-and-ship-it: Missing required npm command")

  const fns = functionGlobber(src)

  opts.logFn(fns.length ? `Found ${fns.length} function package.json files... Installing dependencies` : "No function package.json files found... Skipping dependency installs")

  return new Promise((resolve, reject) => {
    if (fns.length === 0) return resolve([])

    const jobs = fns.map(fnPath => cb => install(fnPath, { hasYarn, logFn }, cb))

    parallelLimit(jobs, 5, (error, data) => {
      if (error) {
        return reject(error)
      }
      return resolve(data)
    })
  })
}

function functionGlobber(baseDir) {
  const globStr = path.join(baseDir, "*/package.json")
  const functions = glob.sync(globStr)
  return functions.map(fnFolder => {
    return fnFolder.substring(0, fnFolder.indexOf("package.json"))
  })
}

function verifyInstaller(type) {
  if (type !== 'npm' && type !== 'yarn') {
    throw new Error('Must check npm or yarn')
  }
  return new Promise((resolve, reject) => {
    cp.exec(`which ${type}`, (error, stdout, stderr) => {
      // swallow errors if "which xyz" fails
      if (error || stderr || stdout.match((/not found/))) {
        return resolve(false)
      }
      // we have it
      return resolve(true)
    })
  })
}

function install(functionDir, opts, cb) {
  opts = Object.assign({
    hasYarn: false,
    logFn: (msg) => {/* noop */}
  }, opts)

  const { hasYarn, logFn } = opts

  if (hasYarn) {
    fs.access(path.join(functionDir, "yarn.lock"), fs.constants.F_OK, handleYarnTest)
  } else {
    runInstallCommand("npm i", cb)
  }

  function handleYarnTest (err) {
    // If there is a yarn lock file and we have yarn, try to use yarn
    let command = err ? "npm i" : "yarn"
    runInstallCommand(command, cb)
  }

  function runInstallCommand (command, cb) {
    logFn(`Installing dependencies for "${path.basename(functionDir)}" with ${command.split(' ')[0]}`)
    cp.exec(command, { cwd: functionDir }, (err, data) => {
      logFn(`Finished installing dependencies for ${path.basename(functionDir)}`)
      cb(err, data)
    });
  }
}
