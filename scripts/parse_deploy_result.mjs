import { readFileSync } from 'node:fs'
import { argv } from 'node:process'

let data

try {
  data = readFileSync(argv[2])
} catch (error) {
  console.error('Could not read deploy result:')

  throw error
}

try {
  const { deploy_url: deployURL, logs } = JSON.parse(data)

  console.log(`deploy_log_url=${logs}`)
  console.log(`deploy_url=${deployURL}`)
} catch (error) {
  console.log(data)

  throw error
}
