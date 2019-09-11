const path = require("path");
const fs = require("fs");
const glob = require("glob");
const archiver = require("archiver");
const elfTools = require("elf-tools");
const { getDependencies, findModuleDir, findHandler } = require("./finders");
const pAll = require("p-all");
const getRelativePath = require('relative');

class Zip {
  constructor(path) {
    this.output = fs.createWriteStream(path);
    this.archive = archiver("zip", { level: 9 });
    this.archive.pipe(this.output);
  }

  addLocalFile(path, data) {
    if (Buffer.isBuffer(path)) {
      this.archive.append(path, data);
    } else {
      this.archive.file(path, data);
    }
  }

  finalize() {
    return new Promise((resolve, reject) => {
      this.output.on("end", resolve);
      this.output.on("close", resolve);
      this.output.on("finish", resolve);
      this.output.on("error", reject);
      this.archive.finalize();
    });
  }
}

function filesForFunctionZip(functionPath) {
  const filesToBundle = new Set();
  if (fs.lstatSync(functionPath).isDirectory()) {
    const moduledir = findModuleDir(functionPath);
    const ignoreArgs = [moduledir, "node_modules", "**"].filter(
      segment => segment != null
    );
    glob
      .sync(path.join(functionPath, "**"), {
        nodir: true,
        ignore: path.join(...ignoreArgs),
        absolute: true
      })
      .forEach(file => filesToBundle.add(file));
    if (moduledir) {
      let handler = null;
      const namedHandler = path.join(
        functionPath,
        `${path.basename(functionPath)}.js`
      );
      const indexHandler = path.join(functionPath, "index.js");
      if (fs.existsSync(namedHandler)) {
        handler = namedHandler;
      } else if (fs.existsSync(indexHandler)) {
        handler = indexHandler;
      } else {
        throw ("Failed to find handler for ", functionPath);
      }

      getDependencies(handler, moduledir).forEach(file =>
        filesToBundle.add(file)
      );
    }
  } else {
    filesToBundle.add(functionPath);
    const moduledir = findModuleDir(path.dirname(functionPath));
    if (moduledir) {
      getDependencies(functionPath, moduledir).forEach(file =>
        filesToBundle.add(file)
      );
    }
  }
  return filesToBundle;
}

function isGoExe(file) {
  try {
    const buf = fs.readFileSync(file);
    const elf = elfTools.parse(buf);
    return elf.sections.find(s => s.header.name === ".note.go.buildid");
  } catch (e) {
    return false;
  }
}

function zipEntryPath(file, basedir, moduledir) {
  const parentDir = path.dirname(moduledir)
  return file
    .replace(basedir, "")
    .replace(moduledir, "")
    .replace(parentDir, "")
    .replace(/^\//, "");
}

function zipGoExe(file, zipPath) {
  const zip = new Zip(zipPath);
  const stat = fs.lstatSync(file);
  zip.addLocalFile(file, {
    name: path.basename(file),
    mode: stat.mode,
    date: new Date(0), // Ensure sha256 stability regardless of mtime
    stats: stat
  });
  return zip.finalize();
}

function zipJs(functionPath, zipPath) {
  const zip = new Zip(zipPath);
  let basedir = functionPath;
  if (fs.lstatSync(functionPath).isFile()) {
    basedir = path.dirname(basedir);
  }
  const moduledir = findModuleDir(basedir);

  const requireRegex = /require\(['|"](.*)['|"]\)/gm
  const parensRegex = /\(([^)]+)\)/
  const parentPathRegex = /(\.\.\/)+/

  let mappings = {}
  const processedPaths = []
  let originalEntry
  let originalDirectory
  filesForFunctionZip(functionPath).forEach(file => {
    if (!originalEntry) {
      originalEntry = file
    }
    if (!originalDirectory) {
      originalDirectory = path.dirname(file)
    }
    let entryPath = zipEntryPath(file, basedir, moduledir);
    if (inNodeModules(file)) {
      const stat = fs.lstatSync(file);
      zip.addLocalFile(file, {
        name: entryPath,
        mode: stat.mode,
        date: new Date(0), // Ensure sha256 stability regardless of mtime
        stats: stat
      });
    } else {
      // Find and Fix relative paths parent paths
      const rawContent = fs.readFileSync(file, 'utf-8')
      const requireStatements = rawContent.match(requireRegex)

      // If mapping found, use modifed entryPath as file name
      if (mappings[file]) {
        // console.log('Map match on', file)
        // console.log('Entry before', entryPath)
        entryPath = mappings[file].entryPath
        // console.log('Entry after', entryPath)
      }

      let content = rawContent
      if (requireStatements) {
        requireStatements.forEach((statement) => {
          // console.log('require statment', statement)
          const [, requirePath] = statement.match(parensRegex)

          const modulePath = getOriginalPath(requirePath, file)
          const fileInFolder = isPathInside(modulePath, originalDirectory)
          // const isParentPath = requirePath.match(parentPathRegex)

          /* If file in function folder or is a node module */
          if (fileInFolder || inNodeModules(modulePath)) {
            processedPaths.push(requirePath)
          } else {
          /* If require paths are in parent/sibling directories we will need to fix code paths */
            console.log(`Including ${requirePath} from parent paths for ${file}`)
            let newPath = requirePath.replace(parentPathRegex, './')

            // https://github.com/jonschlinkert/relative
            const relPath = getRelativePath(originalEntry, modulePath)
            const relativeIncludePath = removeFileExtension(relPath)
            // console.log('Relative Path', relPath)

            // const count = relPath.match(/\.\.\//g)
            // console.log('count', count.length)
            const originalRequirePath = removeFileExtension(removeQuotes(requirePath))

            if (originalRequirePath !== relativeIncludePath) {
              const updatedEntry = formatEntryPoint(requirePath)
              console.log(`Map ${modulePath} to ${updatedEntry}`)
              mappings[modulePath] = {
                file: file,
                entryPath: updatedEntry
              }
              // newPath = removeQuotes(requirePath)
            }

            /* if relvative path clashes, we need to shift & update file names */
            if (processedPaths.includes(newPath)) {
              const end = newPath.replace(/['|"]$/g, '')
              const postFix = prettyPath(modulePath, moduledir)
              const updatedPath = (end.match(/^'/)) ? `${end}-${postFix}'` : `${end}-${postFix}"`
              console.log(`Duplicate path detected at "${newPath}". Shifting path to ${updatedPath}`)
              // Map new entry point for file
              mappings[modulePath] = {
                file: file,
                entryPath: formatEntryPoint(updatedPath)
              }
              newPath = updatedPath
            }

            processedPaths.push(newPath)

            const fixedRelativePath = `require(${newPath})`
            // console.log('fixedPath', fixedRelativePath)
            const replaceRegex = new RegExp(`require\\(${requirePath}\\)`, 'gm')
            // console.log('replaceRegex', replaceRegex)
            content = content.replace(replaceRegex, fixedRelativePath)
          }
          // console.log('processedPaths', processedPaths)
        })
      }

      const stat = fs.lstatSync(file);
      zip.addLocalFile(Buffer.from(content), {
        name: entryPath,
        mode: stat.mode,
        date: new Date(0), // Ensure sha256 stability regardless of mtime
        stats: stat
      });
    }
  });
  return zip.finalize();
}

function formatEntryPoint(reqPath) {
  const entry = reqPath
    // remove leading ./
    .replace(/^\.\//, '')
    // Remove file extension
    .replace(/\.js$/, '')
  return `${removeQuotes(entry)}.js`
}

function inNodeModules(filePath) {
  return filePath.match(/\/node_modules\//)
}

function removeFileExtension(str) {
  return str.replace(/\.js$/, '')
}

function isPathInside(childPath, parentPath) {
	childPath = path.resolve(childPath);
	parentPath = path.resolve(parentPath);

	if (process.platform === 'win32') {
		childPath = childPath.toLowerCase();
		parentPath = parentPath.toLowerCase();
	}

	if (childPath === parentPath) {
		return false;
	}

	childPath += path.sep;
	parentPath += path.sep;

	return childPath.startsWith(parentPath);
}

function prettyPath(filePath, moduledir) {
  return filePath
    // Remove base dir from path
    .replace(moduledir, '')
    // remove leading slash
    .replace(/^\//, '')
    // replace slashes with dashes
    .replace(/\//g, '-')
    // replace trailing file type
    .replace(/\.js$/, '')
}

function removeQuotes(str) {
  return str.replace(/['|"]/g, '')
}

function getOriginalPath(requirePath, file) {
  const cleanp = removeQuotes(requirePath)
  // Path ./whatever
  if (cleanp.match(/^\./)) {
    return require.resolve(path.join(path.dirname(file), cleanp))
  }
  // node module path
  return require.resolve(cleanp)
}

function zipFunction(functionPath, destFolder, options) {
  if (path.basename(functionPath) === "node_modules") {
    return Promise.resolve(null);
  }
  const zipPath = path.join(
    destFolder,
    path.basename(functionPath).replace(/\.(js|zip)$/, "") + ".zip"
  );
  if (path.extname(functionPath) === ".zip") {
    fs.copyFileSync(functionPath, zipPath);
    return Promise.resolve({
      path: zipPath,
      runtime: "js"
    });
  }
  const ds = fs.lstatSync(functionPath);
  if (ds.isDirectory() || path.extname(functionPath) === ".js") {
    if (!findHandler(functionPath)) {
      return Promise.resolve(null);
    }
    return zipJs(functionPath, zipPath).then(() => {
      return {
        path: zipPath,
        runtime: "js"
      };
    });
  }
  if (isGoExe(functionPath)) {
    if (options && options.skipGo) {
      const goPath = path.join(destFolder, path.basename(functionPath));
      fs.copyFileSync(functionPath, goPath);
      return Promise.resolve({
        path: goPath,
        runtime: "go"
      });
    }

    return zipGoExe(functionPath, zipPath).then(() => {
      return {
        path: zipPath,
        runtime: "go"
      };
    });
  }
  return Promise.resolve(null);
}

function zipFunctions(srcFolder, destFolder, options) {
  options = Object.assign(
    {
      parallelLimit: 5
    },
    options
  );
  return pAll(
    fs
      .readdirSync(srcFolder)
      .map(file => () =>
        zipFunction(
          path.resolve(path.join(srcFolder, file)),
          destFolder,
          options
        )
      ),
    { concurrency: options.parallelLimit }
  ).then(zipped => zipped.filter(e => e));
}

module.exports = {
  getDependencies,
  filesForFunctionZip,
  zipFunction,
  zipFunctions
};
