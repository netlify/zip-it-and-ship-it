import { promises as fs } from 'fs'
import { basename, join } from 'path'

import { findUp, findUpStop, pathExists } from 'find-up'

import type { RuntimeCache } from '../../../utils/cache.js'
import { cachedReadFile } from '../../../utils/fs.js'

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
  type?: 'module' | 'commonjs'
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
        return findUpStop
      }

      const path = join(directory, 'package.json')
      const hasPackageJson = await pathExists(path)

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
  const result = await getClosestPackageJson(srcDir)

  return result?.contents ?? {}
}

export const getPackageJsonIfAvailable = async (srcDir: string): Promise<PackageJson> => {
  try {
    const packageJson = await getPackageJson(srcDir)

    return packageJson
  } catch {
    return {}
  }
}

export const readPackageJson = async (path: string) => {
  try {
    // The path depends on the user's build, i.e. must be dynamic
    const packageJson = JSON.parse(await fs.readFile(path, 'utf8'))

    return sanitizePackageJson(packageJson)
  } catch (error) {
    throw new Error(`${path} is invalid JSON: ${error.message}`)
  }
}

const sanitizeFiles = (files: unknown): string[] | undefined => {
  if (!Array.isArray(files)) {
    return undefined
  }

  return files.filter((file) => typeof file === 'string')
}

export const sanitizePackageJson = (packageJson: Record<string, unknown>): PackageJson => ({
  ...packageJson,
  files: sanitizeFiles(packageJson.files),
})

export const getPackageJSONWithType = async (path: string, type: string, cache: RuntimeCache) => {
  const file = await cachedReadFile(cache.fileCache, path)
  const packageJson: PackageJson = JSON.parse(file)
  const patchedPackageJson = {
    ...packageJson,
    type,
  }

  return patchedPackageJson
}
