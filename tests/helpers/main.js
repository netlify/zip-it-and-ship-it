import { mkdirSync, promises as fs } from 'fs'
import { dirname, resolve } from 'path'
import { env, platform } from 'process'
import { fileURLToPath, pathToFileURL } from 'url'

import execa from 'execa'
import pathExists from 'path-exists'
import { dir as getTmpDir } from 'tmp-promise'

import { zipFunctions } from '../../dist/main.js'
import { listImports } from '../../dist/runtimes/node/bundlers/zisi/list_imports.js'

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url))
export const BINARY_PATH = fileURLToPath(new URL('../../dist/bin.js', import.meta.url))

export const zipNode = async function (t, fixture, { length, fixtureDir, opts } = {}) {
  const { files, tmpDir } = await zipFixture(t, fixture, {
    length,
    fixtureDir,
    opts,
  })
  const { archiveFormat } = opts || {}

  if (archiveFormat === undefined || archiveFormat === 'zip') {
    await requireExtractedFiles(t, files)
  }

  return { files, tmpDir }
}

export const zipFixture = async function (t, fixture, { length, fixtureDir, opts = {} } = {}) {
  const { config = {} } = opts
  const bundlerString = (config['*'] && config['*'].nodeBundler) || 'default'
  const { path: tmpDir } = await getTmpDir({
    prefix: `zip-it-test-bundler-${bundlerString}`,
  })

  if (env.ZISI_KEEP_TEMP_DIRS !== undefined) {
    console.log(tmpDir)
  }

  const { files } = await zipCheckFunctions(t, fixture, { length, fixtureDir, tmpDir, opts })
  return { files, tmpDir }
}

export const zipCheckFunctions = async function (
  t,
  fixture,
  { length = 1, fixtureDir = FIXTURES_DIR, tmpDir, opts } = {},
) {
  const srcFolders = Array.isArray(fixture)
    ? fixture.map((srcFolder) => `${fixtureDir}/${srcFolder}`)
    : `${fixtureDir}/${fixture}`
  const files = await zipFunctions(srcFolders, tmpDir, opts)

  t.true(Array.isArray(files))
  t.is(files.length, length)

  return { files, tmpDir }
}

const requireExtractedFiles = async function (t, files) {
  await unzipFiles(files)

  const jsFiles = await Promise.all(files.map(replaceUnzipPath).map((file) => importFunctionFile(file)))
  t.true(jsFiles.every(Boolean))
}

export const unzipFiles = async function (files, targetPathGenerator) {
  await Promise.all(files.map(({ path }) => unzipFile({ path, targetPathGenerator })))
}

const unzipFile = async function ({ path, targetPathGenerator }) {
  let dest = dirname(path)
  if (targetPathGenerator) {
    dest = resolve(targetPathGenerator(path))
  }

  mkdirSync(dest, { recursive: true })

  if (platform === 'win32') {
    execa.sync('tar', ['-xf', path, '-C', dest])
  } else {
    execa.sync('unzip', ['-o', path, '-d', dest])
  }

  await fixEsmRequire(dest)
}

const replaceUnzipPath = function ({ path }) {
  return path.replace('.zip', '.js')
}

// Netlify Functions are bundled as CommonJS.
// However, the tests are using pure ES modules.
// Therefore, the `package.json` injected in Netlify Functions bundles, when
// done in tests, has `type: "module"`, even though those use CommonJS.
// We fix this by editing that `package.json` when the Functions are being
// unzipped by the test helpers.
const fixEsmRequire = async function (dest) {
  const packageJsonPath = `${dest}/package.json`
  if (!(await pathExists(packageJsonPath))) {
    return
  }

  const packageJsonContents = await fs.readFile(packageJsonPath, 'utf8')

  // Some test fixtures purposely use `type: "module"`. We do not transform that.
  if (!packageJsonContents.includes('@netlify/zip-it-and-ship-it')) {
    return
  }

  const newPackageJsonContents = packageJsonContents.replace('"type": "module"', '"type": "commonjs"')
  await fs.writeFile(packageJsonPath, newPackageJsonContents)
}

// Returns a list of paths included using `require` calls. Relative requires
// will be traversed recursively up to a depth defined by `depth`. All the
// required paths — relative or not — will be returned in a flattened array.
export const getRequires = async function ({ depth = Number.POSITIVE_INFINITY, filePath }, currentDepth = 1) {
  const requires = await listImports({ path: filePath })

  if (currentDepth >= depth) {
    return requires
  }

  const basePath = dirname(filePath)
  const childRequires = requires.reduce((result, requirePath) => {
    if (!requirePath.startsWith('.')) {
      return result
    }

    const fullRequirePath = resolve(basePath, requirePath)

    return [...result, ...getRequires({ depth, filePath: fullRequirePath }, currentDepth + 1)]
  }, [])

  return [...requires, ...childRequires]
}

// Import a file exporting a function.
// Returns `default` exports as is.
export const importFunctionFile = async function (functionPath) {
  const result = await import(pathToFileURL(functionPath))
  return result.default === undefined ? result : result.default
}
