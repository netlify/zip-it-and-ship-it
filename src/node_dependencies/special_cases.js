const { getPackageJson } = require('./package_json')

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
  const { externalModules, ignoredModules } = getModulesForNextJs({ dependencies, devDependencies })

  return {
    externalModules,
    ignoredModules,
  }
}

module.exports = { getExternalAndIgnoredModulesFromSpecialCases }
