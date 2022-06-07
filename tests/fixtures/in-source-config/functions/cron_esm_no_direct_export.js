import { schedule } from '@netlify/functions'

const handler = schedule('@daily', async () => {
  // function handler
})

export { handler }
