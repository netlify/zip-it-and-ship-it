// eslint-disable-next-line node/no-unsupported-features/es-syntax
import { cron } from '@netlify/functions'

// eslint-disable-next-line node/no-unsupported-features/es-syntax
export const handler = cron('@daily', () => {
  // function handler
})
