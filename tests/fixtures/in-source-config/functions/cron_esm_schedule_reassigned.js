import { schedule } from '@netlify/functions'

const SCHEDULE = '@daily'

export const handler = schedule(SCHEDULE, async () => {
  // function handler
})
