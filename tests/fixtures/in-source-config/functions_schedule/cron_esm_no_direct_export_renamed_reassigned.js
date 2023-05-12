import { schedule } from '@netlify/functions'

const handler = async () => {
  // function handler
}

const _handler = schedule('@daily', handler)
export { _handler as handler }
