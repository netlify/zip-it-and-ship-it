import { glob } from '../../../../utils/matching.js'

// We use all the files published by the Node.js except some that are not needed
export const getPublishedFiles = async function (modulePath: string): Promise<string[]> {
  const ignore = getIgnoredFiles(modulePath)
  const publishedFiles = await glob(`${modulePath}/**`, {
    ignore,
    nodir: true,
    absolute: true,
    dot: true,
  })

  return publishedFiles
}

const getIgnoredFiles = function (modulePath: string): string[] {
  return IGNORED_FILES.map((ignoreFile) => `${modulePath}/${ignoreFile}`)
}

// To make the zip archive smaller, we remove those.
const IGNORED_FILES = [
  'node_modules/**',
  '.npmignore',
  'package-lock.json',
  'yarn.lock',
  '*.log',
  '*.lock',
  '*~',
  '*.map',
  '*.ts',
  '*.patch',
]
