// eslint-disable-next-line node/no-unsupported-features/es-syntax
import { cron as somethingElse } from '@netlify/functions'

// eslint-disable-next-line node/no-unsupported-features/es-syntax
export const handler = somethingElse('@daily', () => {
  // function handler
})
