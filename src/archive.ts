import { Buffer } from 'buffer'
import { createWriteStream, Stats } from 'fs'
import { Writable } from 'stream'
import { promisify } from 'util'

import archiver, { Archiver } from 'archiver'
import endOfStream from 'end-of-stream'

const pEndOfStream = promisify(endOfStream)

// Start zipping files
const startZip = function (destPath: string): { archive: Archiver; output: Writable } {
  const output = createWriteStream(destPath)
  const archive = archiver('zip')
  archive.pipe(output)
  return { archive, output }
}

// Add new file to zip
const addZipFile = function (archive: Archiver, file: string, name: string, stat: Stats): void {
  // Ensure sha256 stability regardless of mtime
  archive.file(file, { name, mode: stat.mode, date: new Date(0), stats: stat })
}

// Add new file content to zip
const addZipContent = function (archive: Archiver, content: Buffer, name: string): void {
  archive.append(content, { name, date: new Date(0) })
}

// End zipping files
const endZip = async function (archive: Archiver, output: Writable): Promise<void> {
  archive.finalize()
  await pEndOfStream(output)
}

export { startZip, addZipFile, addZipContent, endZip }
export type { Archiver as ZipArchive }
