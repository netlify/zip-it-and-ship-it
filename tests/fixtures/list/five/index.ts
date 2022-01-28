// We do not rename to `./util.js` because `@vercel/nft` does not manage to
// find the dependency `util.ts` then, even though using `.js` file extensions
// is the recommended way to use pure ES modules with Typescript.
import { type } from './util'

const obj = { type }

export default obj
