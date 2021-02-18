const { getPackageJson } = require('./package_json')

const getPackageJsonIfAvailable = async (srcDir) => {
  try {
    const packageJson = await getPackageJson(srcDir)

    return packageJson
  } catch (_) {
    return {}
  }
}

const getModulesForNextJs = ({ dependencies }) => {
  const externalModules = dependencies.next ? ['critters', 'nanoid'] : []
  const ignoredModules = []

  return {
    externalModules,
    ignoredModules,
  }
}

const getExternalAndIgnoredModulesFromSpecialCases = async ({ srcDir }) => {
  const { dependencies = {} } = await getPackageJsonIfAvailable(srcDir)
  const { externalModules, ignoredModules } = getModulesForNextJs({ dependencies })

  return {
    externalModules,
    ignoredModules,
  }
}

module.exports = { getExternalAndIgnoredModulesFromSpecialCases }
