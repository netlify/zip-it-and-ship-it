// eslint-disable-next-line n/no-unsupported-features/es-syntax
import { schedule } from '@netlify/functions'

const str: string = 'hello'

// eslint-disable-next-line n/no-unsupported-features/es-syntax
export const handler = schedule('@daily', () => {
  console.log(str)
})
