import cjs from 'cjs-module'
import esm from 'esm-module'

import { name as helper1 } from './lib/helper1.ts'
import { name as helper2 } from './lib/helper2.js'
import { name as helper3 } from './lib/helper3'
import { name as helper4 } from './lib/helper4.js'
import { name as helper5 } from './lib/helper5.mjs'

export default async (req: Request) => Response.json({ cjs, esm, helper1, helper2, helper3, helper4, helper5 })
