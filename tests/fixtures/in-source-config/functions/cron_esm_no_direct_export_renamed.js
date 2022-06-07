import { schedule } from '@netlify/functions'

const _handler = schedule('@daily', async () => {
  // function handler
})
export { _handler as handler }
