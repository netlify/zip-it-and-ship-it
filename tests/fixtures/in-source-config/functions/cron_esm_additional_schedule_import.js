import { schedule as nfySchedule } from '@netlify/functions'
import { schedule } from '../node_modules/@netlify/functions/index.js'
// make sure cron expression is found/doesn't error if `schedule` is also imported from another source

schedule()

export const handler = nfySchedule('@daily', () => {
  // function handler
})
