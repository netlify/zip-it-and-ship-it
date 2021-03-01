const { getPackageJson } = require('./package_json')

const EXTERNAL_MODULES = ['@prisma/client']
const IGNORED_MODULES = []

const getPackageJsonIfAvailable = async (srcDir) => {
  try {
    const packageJson = await getPackageJson(srcDir)

    return packageJson
  } catch (_) {
    return {}
  }
}

const getModulesForNextJs = ({ dependencies, devDependencies }) => {
  const allDependencies = { ...dependencies, ...devDependencies }
  const externalModules = allDependencies.next ? ['critters', 'nanoid'] : []
  const ignoredModules = []

  return {
    externalModules,
    ignoredModules,
  }
}

const getExternalAndIgnoredModulesFromSpecialCases = async ({ srcDir }) => {
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

module.exports = { getExternalAndIgnoredModulesFromSpecialCases }
