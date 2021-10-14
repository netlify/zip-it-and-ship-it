import findUp from 'find-up'

const AUTO_PLUGINS_DIR = '.netlify/plugins/'

const getPluginsModulesPath = (srcDir: string): Promise<string | undefined> =>
  findUp(`${AUTO_PLUGINS_DIR}node_modules`, { cwd: srcDir, type: 'directory' })

export { getPluginsModulesPath }
