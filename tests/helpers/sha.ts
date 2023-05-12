import { createHash } from 'crypto'
import { createReadStream } from 'fs'

import getStream from 'get-stream'

// Retrieve the SHA1 checksum of a file.
// Does it in streaming mode, for best performance.
export const computeSha1 = async function (filePath: string): Promise<string> {
  const fileStream = createReadStream(filePath)
  const hashStream = createHash('sha1')
  hashStream.setEncoding('hex')

  const sha1Checksum = await getStream(fileStream.pipe(hashStream))

  fileStream.destroy()
  hashStream.destroy()

  return sha1Checksum
}
