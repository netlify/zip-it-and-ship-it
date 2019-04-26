const path = require("path");
const glob = require("glob");
const cp = require("child_process");
const parallelLimit = require("run-parallel-limit");
const series = require("run-series");

module.exports = function installFunctionDeps(src) {
  const fns = functionGlobber(src)
  return new Promise((resolve, reject) => {
    if (fns.length === 0) return resolve()

    const jobs = fns.map(fnPath => {
      return cb => {
        series([cb => install(fnPath, cb)], cb);
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

function install(functionDir, cb) {
  cp.exec("npm i", { cwd: functionDir }, cb);
}
