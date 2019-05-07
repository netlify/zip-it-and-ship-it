const installFunctionDeps = require("./install-deps");
const { zipFunctions } = require("./zip");

function installAndZipFunctions(srcFolder, destFolder, opts) {
  opts = Object.assign(
    {
      "skipInstall": false,
      "logFn": (msg) => {/* noop */}
    },
    opts
  );

  const installPromise = opts.skipDeps ? (new Promise((resolve) => {
    opts.logFn('Skipping function dependency installs')
    resolve()
  })) : installFunctionDeps(srcFolder, opts)

  return installPromise.then(() => zipFunctions(srcFolder, destFolder, opts))
}

exports.installAndZipFunctions = installAndZipFunctions
