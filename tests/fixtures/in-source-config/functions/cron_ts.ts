// eslint-disable-next-line node/no-unsupported-features/es-syntax
import { cron } from '@netlify/functions'

const str: string = 'hello'

// eslint-disable-next-line node/no-unsupported-features/es-syntax
export const handler = cron('@daily', () => {
  console.log(str)
})
