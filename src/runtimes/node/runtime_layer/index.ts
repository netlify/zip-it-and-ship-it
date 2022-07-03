import { promises as fs } from 'fs'

import { build } from '@netlify/esbuild'
import del from 'del'
import { tmpName } from 'tmp-promise'

import type { ModuleFormat } from '../utils/module_format.js'

const getRawLayer = (importPath: string, format: ModuleFormat) => {
  const compatPath = require.resolve('@netlify/functions')

  if (format === 'cjs') {
    return `
      const { getHandler } = require('${compatPath}')
      const func = require('${importPath}')
      
      module.exports.handler = getHandler(func)
    `
  }

  return `
    import { getHandler } from '${compatPath}'
    import * as func from '${importPath}'

    export const handler = getHandler(func)
  `
}

const getRuntimeLayer = async (importPath: string, format: ModuleFormat) => {
  const postfix = format === 'esm' ? '.mjs' : '.js'
  const tmpPath = await tmpName({ postfix })
  const rawLayer = getRawLayer(importPath, format)

  // Writing the raw (unbundled) layer to a temporary file, so that esbuild
  // can process it.
  await fs.writeFile(tmpPath, rawLayer)

  // Bundling the runtime layer into a single file. It's important to note
  // that we're marking `importPath` as `external`, because we don't want
  // this bundle to include the user code — only the runtime layer.
  const { outputFiles } = await build({
    bundle: true,
    entryPoints: [tmpPath],
    external: [importPath],
    format,
    logLevel: 'error',
    platform: 'node',
    write: false,
  })

  await del(tmpPath, { force: true })

  return outputFiles[0].text
}

export { getRuntimeLayer }
