import cjs from 'cjs-module'
import esm from 'esm-module'

export default async (req: Request) => Response.json({ cjs, esm })
