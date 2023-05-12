// eslint-disable-next-line n/no-unsupported-features/es-syntax
import { schedule } from '@netlify/functions'
import { schedule as schedule2 } from '@netlify/functions'

export const handler = schedule2('@daily', () => {})
