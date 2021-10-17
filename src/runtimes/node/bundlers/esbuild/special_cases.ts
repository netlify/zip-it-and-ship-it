import { getPackageJson, PackageJson } from '../../utils/package_json'

const EXTERNAL_MODULES = ['@prisma/client']
const IGNORED_MODULES = ['aws-sdk']

const getPackageJsonIfAvailable = async (srcDir: string): Promise<PackageJson> => {
  try {
    const packageJson = await getPackageJson(srcDir)

    return packageJson
  } catch (_) {
    return {}
  }
}

const getModulesForNextJs = ({ dependencies, devDependencies }: PackageJson) => {
  const allDependencies = { ...dependencies, ...devDependencies }
  const externalModules = allDependencies.next ? ['critters', 'nanoid'] : []
  const ignoredModules: string[] = []

  return {
    externalModules,
    ignoredModules,
  }
}

const getExternalAndIgnoredModulesFromSpecialCases = async ({ srcDir }: { srcDir: string }) => {
  const { dependencies = {}, devDependencies = {} } = await getPackageJsonIfAvailable(srcDir)
  const { externalModules: nextJsExternalModules, ignoredModules: nextJsIgnoredModules } = getModulesForNextJs({
    dependencies,
    devDependencies,
  })
  const externalModules = [...EXTERNAL_MODULES, ...nextJsExternalModules]
  const ignoredModules = [...IGNORED_MODULES, ...nextJsIgnoredModules]

  return {
    externalModules,
    ignoredModules,
  }
}

export { getExternalAndIgnoredModulesFromSpecialCases }
