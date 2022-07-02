import { promises as fs } from 'fs'

import { build } from '@netlify/esbuild'
import del from 'del'
import { tmpName } from 'tmp-promise'

import type { ModuleFormat } from '../utils/module_format.js'

const getCompatCode = (importPath: string, format: ModuleFormat) => {
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
  const contents = getCompatCode(importPath, format)

  await fs.writeFile(tmpPath, contents)

  const { outputFiles } = await build({
    bundle: true,
    entryPoints: [tmpPath],
    external: [importPath],
    format,
    logLevel: 'warning',
    platform: 'node',
    write: false,
  })

  await del(tmpPath, { force: true })

  return outputFiles[0].text
}

export { getRuntimeLayer }
