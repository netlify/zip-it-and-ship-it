import cjs from 'cjs-module'
import esm from 'esm-module'

import { name as helper1 } from './lib/helper1.js'
import { name as helper2 } from './lib/helper2.js'
import { name as helper3 } from './lib/helper3.js'
import { name as helper4 } from './lib/helper4.js'
import { name as helper5 } from './lib/helper5.mjs'
import { name as helper6 } from './lib/helper6.js'

export default async (req: Request) => Response.json({ cjs, esm, helper1, helper2, helper3, helper4, helper5, helper6 })
