import { promises as fs } from 'fs'
import { basename, join } from 'path'

import findUp from 'find-up'
import pkgDir from 'pkg-dir'

export interface PackageJson {
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

export interface PackageJsonFile {
  contents: PackageJson
  path: string
}

export const getClosestPackageJson = async (resolveDir: string): Promise<PackageJsonFile | null> => {
  const packageJsonPath = await findUp(
    async (directory) => {
      // We stop traversing if we're about to leave the boundaries of any
      // node_modules directory.
      if (basename(directory) === 'node_modules') {
        return findUp.stop
      }

      const path = join(directory, 'package.json')
      const hasPackageJson = await findUp.exists(path)

      return hasPackageJson ? path : undefined
    },
    { cwd: resolveDir },
  )

  if (packageJsonPath === undefined) {
    return null
  }

  const packageJson = await readPackageJson(packageJsonPath)

  return {
    contents: packageJson,
    path: packageJsonPath,
  }
}

// Retrieve the `package.json` of a specific project or module
export const getPackageJson = async function (srcDir: string): Promise<PackageJson> {
  const packageRoot = await pkgDir(srcDir)

  if (packageRoot === undefined) {
    return {}
  }

  return readPackageJson(`${packageRoot}/package.json`)
}

export const getPackageJsonIfAvailable = async (srcDir: string): Promise<PackageJson> => {
  try {
    const packageJson = await getPackageJson(srcDir)

    return packageJson
  } catch {
    return {}
  }
}

const readPackageJson = async (path: string) => {
  try {
    // The path depends on the user's build, i.e. must be dynamic
    const packageJson = JSON.parse(await fs.readFile(path, 'utf8'))
    return sanitisePackageJson(packageJson)
  } catch (error) {
    throw new Error(`${path} is invalid JSON: ${error.message}`)
  }
}

const sanitiseFiles = (files: unknown): string[] | undefined => {
  if (!Array.isArray(files)) {
    return undefined
  }

  return files.filter((file) => typeof file === 'string')
}

export const sanitisePackageJson = (packageJson: Record<string, unknown>): PackageJson => ({
  ...packageJson,
  files: sanitiseFiles(packageJson.files),
})
