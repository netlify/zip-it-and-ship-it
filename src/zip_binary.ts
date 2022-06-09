import type { Stats } from 'fs'

import { startZip, addZipFile, addZipContent, endZip } from './archive.js'
import { Runtime } from './runtimes/runtime.js'

// Zip a binary function file
export const zipBinary = async function ({
  destPath,
  filename,
  runtime,
  srcPath,
  stat,
}: {
  destPath: string
  filename: string
  runtime: Runtime
  srcPath: string
  stat: Stats
}) {
  const { archive, output } = startZip(destPath)

  addZipFile(archive, srcPath, filename, stat)
  addZipContent(archive, JSON.stringify({ runtime: runtime.name }), 'netlify-toolchain')
  await endZip(archive, output)
}
