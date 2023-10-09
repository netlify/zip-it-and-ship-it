import cjs from 'cjs-module'

import { name as helper1 } from './lib/helper1.ts'
import { name as helper2 } from './lib/helper2.js'
import { name as helper3 } from './lib/helper3'
import { name as helper4 } from './lib/helper4.js'
import { name as helper5 } from './lib/helper5.mjs'

export default async () => {
  // We're in CJS, so importing a ESM package must use a dynamic import.
  const { default: esm } = await import('esm-module')

  return Response.json({ cjs, esm, helper1, helper2, helper3, helper4, helper5 })
}
