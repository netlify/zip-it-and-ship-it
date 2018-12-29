const path = require("path");
const fs = require("fs");
const glob = require("glob");
const precinct = require("precinct");
const resolve = require("resolve");
const readPkgUp = require("read-pkg-up");
const requirePackageName = require("require-package-name");
const alwaysIgnored = new Set(["aws-sdk"]);

function ignoreMissing(dependency, optional) {
  return alwaysIgnored.has(dependency) || (optional && dependency in optional);
}

function getDependencies(filename, basedir) {
  const servicePath = basedir;

  const filePaths = new Set();
  const modulePaths = new Set();

  const modulesToProcess = [];
  const localFilesToProcess = [filename];

  function handle(name, basedir, optionalDependencies) {
    const moduleName = requirePackageName(name.replace(/\\/, "/"));

    if (alwaysIgnored.has(moduleName)) {
      return;
    }

    try {
      const pathToModule = resolve.sync(path.join(moduleName, "package.json"), {
        basedir
      });
      const pkg = readPkgUp.sync({ cwd: pathToModule });

      if (pkg) {
        modulesToProcess.push(pkg);
      }
    } catch (e) {
      if (e.code === "MODULE_NOT_FOUND") {
        if (ignoreMissing(moduleName, optionalDependencies)) {
          serverless.cli.log(
            `WARNING missing optional dependency: ${moduleName}`
          );
          return null;
        }
        try {
          // this resolves the requested import also against any set up NODE_PATH extensions, etc.
          const resolved = require.resolve(name);
          localFilesToProcess.push(resolved);
          return;
        } catch (e) {
          throw new Error(`Could not find ${moduleName}`);
        }
      }
      throw e;
    }
  }

  while (localFilesToProcess.length) {
    const currentLocalFile = localFilesToProcess.pop();

    if (filePaths.has(currentLocalFile)) {
      continue;
    }

    filePaths.add(currentLocalFile);
    precinct
      .paperwork(currentLocalFile, { includeCore: false })
      .forEach(dependency => {
        if (dependency.indexOf(".") === 0) {
          const abs = resolve.sync(dependency, {
            basedir: path.dirname(currentLocalFile)
          });
          localFilesToProcess.push(abs);
        } else {
          handle(dependency, servicePath);
        }
      });
  }

  while (modulesToProcess.length) {
    const currentModule = modulesToProcess.pop();
    const currentModulePath = path.join(currentModule.path, "..");

    if (modulePaths.has(currentModulePath)) {
      continue;
    }

    modulePaths.add(currentModulePath);

    const packageJson = currentModule.pkg;

    ["dependencies", "peerDependencies", "optionalDependencies"].forEach(
      key => {
        const dependencies = packageJson[key];

        if (dependencies) {
          Object.keys(dependencies).forEach(dependency => {
            handle(
              dependency,
              currentModulePath,
              packageJson.optionalDependencies
            );
          });
        }
      }
    );
  }

  modulePaths.forEach(modulePath => {
    const moduleFilePaths = glob.sync(path.join(modulePath, "**"), {
      nodir: true,
      ignore: path.join(modulePath, "node_modules", "**"),
      absolute: true
    });

    moduleFilePaths.forEach(moduleFilePath => {
      filePaths.add(moduleFilePath);
    });
  });

  return Array.from(filePaths);
}

function findModuleDir(dir) {
  let basedir = dir;
  while (!fs.existsSync(path.join(basedir, "package.json"))) {
    const newBasedir = path.dirname(basedir);
    if (newBasedir === basedir) {
      return null;
    }
    basedir = newBasedir;
  }
  return basedir;
}

module.exports = { getDependencies, findModuleDir };
