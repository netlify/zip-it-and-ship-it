import { getPackageJsonIfAvailable, PackageJson } from '../../utils/package_json'

const EXTERNAL_MODULES = ['@prisma/client']
const IGNORED_MODULES = ['aws-sdk']

const getModulesForNextJs = ({ dependencies, devDependencies }: PackageJson) => {
  const allDependencies = { ...dependencies, ...devDependencies }
  const externalModules = allDependencies.next ? ['critters', 'nanoid'] : []
  const ignoredModules: string[] = []

  return {
    externalModules,
    ignoredModules,
  }
}

export const getExternalAndIgnoredModulesFromSpecialCases = async ({ srcDir }: { srcDir: string }) => {
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
