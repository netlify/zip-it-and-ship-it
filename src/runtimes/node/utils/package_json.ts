import pkgDir from 'pkg-dir'

interface PackageJson {
  name?: string
  version?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  files?: string[]
  gypfile?: boolean
  binary?: boolean
  type?: string
}

const sanitiseFiles = (files: unknown): string[] | undefined => {
  if (!Array.isArray(files)) {
    return undefined
  }

  return files.filter((file) => typeof file === 'string')
}

const sanitisePackageJson = (packageJson: Record<string, unknown>): PackageJson => ({
  ...packageJson,
  files: sanitiseFiles(packageJson.files),
})

// Retrieve the `package.json` of a specific project or module
const getPackageJson = async function (srcDir: string): Promise<PackageJson> {
  const packageRoot = await pkgDir(srcDir)

  if (packageRoot === undefined) {
    return {}
  }

  const packageJsonPath = `${packageRoot}/package.json`
  try {
    // The path depends on the user's build, i.e. must be dynamic
    // eslint-disable-next-line import/no-dynamic-require, node/global-require, @typescript-eslint/no-var-requires
    const packageJson = require(packageJsonPath)
    return sanitisePackageJson(packageJson)
  } catch (error) {
    throw new Error(`${packageJsonPath} is invalid JSON: ${error.message}`)
  }
}

export { getPackageJson, PackageJson, sanitisePackageJson }
