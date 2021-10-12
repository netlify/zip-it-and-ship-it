import pkgDir from 'pkg-dir'

interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  files?: string[]
  gypfile?: boolean
  binary?: boolean
}

// Retrieve the `package.json` of a specific project or module
const getPackageJson = async function (srcDir: string): Promise<PackageJson> {
  const packageRoot = await pkgDir(srcDir)

  if (packageRoot === undefined) {
    return {}
  }

  const packageJsonPath = `${packageRoot}/package.json`
  try {
    // The path depends on the user's build, i.e. must be dynamic
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    return require(packageJsonPath)
  } catch (error) {
    throw new Error(`${packageJsonPath} is invalid JSON: ${error.message}`)
  }
}

export { getPackageJson, PackageJson }
