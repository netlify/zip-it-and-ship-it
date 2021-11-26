// eslint-disable-next-line node/no-unsupported-features/es-syntax
import { schedule as somethingElse } from '@netlify/functions'

const str: string = 'hello'

// eslint-disable-next-line node/no-unsupported-features/es-syntax
export const handler = somethingElse('@daily', () => {
  console.log(str)
})
