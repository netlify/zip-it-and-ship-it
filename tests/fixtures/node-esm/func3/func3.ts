import { getExtension } from './importer'

export const handler = () => {
  return getExtension('foo.js') === '.js'
}
