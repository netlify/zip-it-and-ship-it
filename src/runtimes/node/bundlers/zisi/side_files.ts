import { getPublishedFiles } from './published'

// Some modules generate source files on `postinstall` that are not located
// inside the module's directory itself.
const getSideFiles = async function (modulePath: string, moduleName: string): Promise<string[]> {
  const sideFiles = SIDE_FILES[moduleName]
  if (sideFiles === undefined) {
    return []
  }

  return await getPublishedFiles(`${modulePath}/${sideFiles}`)
}

const SIDE_FILES: Record<string, string> = {
  '@prisma/client': '../../.prisma',
}

export { getSideFiles }
