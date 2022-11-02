import { join, relative } from 'path'

import { findUp } from 'find-up'

const AUTO_PLUGINS_DIR = '.netlify/plugins/'

export const createAliases = (
  paths: string[],
  pluginsModulesPath: string | undefined,
  aliases: Map<string, string>,
  basePath: string,
) => {
  paths.forEach((path) => {
    if (pluginsModulesPath === undefined || !path.startsWith(pluginsModulesPath)) {
      return
    }

    const relativePath = relative(pluginsModulesPath, path)

    aliases.set(path, join(basePath, 'node_modules', relativePath))
  })
}

export const getPluginsModulesPath = (srcDir: string): Promise<string | undefined> =>
  findUp(`${AUTO_PLUGINS_DIR}node_modules`, { cwd: srcDir, type: 'directory' })
