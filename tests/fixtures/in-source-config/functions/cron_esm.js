// eslint-disable-next-line node/no-unsupported-features/es-syntax
import { schedule } from '@netlify/functions'

// eslint-disable-next-line node/no-unsupported-features/es-syntax
export const handler = schedule('@daily', () => {
  // function handler
})
