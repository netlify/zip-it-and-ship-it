const path = require("path");
const glob = require("glob");
const cp = require("child_process");
const parallelLimit = require("run-parallel-limit");
const series = require("run-series");

module.exports = async function installFunctionDeps(src) {
  const fns = functionGlobber(src)

  const hasNpm = await verifyInstaller('npm')
  const installCommand = (hasNpm) ? 'npm i' : 'yarn'

  return new Promise((resolve, reject) => {
    if (fns.length === 0) return resolve()

    const jobs = fns.map(fnPath => {
      return cb => {
        series([cb => install(installCommand, fnPath, cb)], cb);
      }
    })

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

async function install(command, functionDir, cb) {
  cp.exec(command, { cwd: functionDir }, cb);
}
