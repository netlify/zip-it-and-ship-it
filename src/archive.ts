import { Buffer } from 'buffer'
import { createWriteStream, Stats, readlinkSync } from 'fs'
import { Writable } from 'stream'
import { promisify } from 'util'

import archiver, { Archiver } from 'archiver'
import endOfStream from 'end-of-stream'

type ArchiveFormat = 'none' | 'zip'

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
  if (stat.isSymbolicLink()) {
    const linkContent = readlinkSync(file)
    archive.symlink(name, linkContent, stat.mode)
  } else {
    archive.file(file, {
      name,
      mode: stat.mode,
      // Ensure sha256 stability regardless of mtime
      date: new Date(0),
      stats: stat,
    })
  }
}

// Add new file content to zip
const addZipContent = function (archive: Archiver, content: Buffer | string, name: string): void {
  archive.append(content, { name, date: new Date(0) })
}

// End zipping files
const endZip = async function (archive: Archiver, output: Writable): Promise<void> {
  archive.finalize()
  await pEndOfStream(output)
}

export { startZip, addZipFile, addZipContent, endZip }
export type { ArchiveFormat }

export { Archiver as ZipArchive } from 'archiver'
