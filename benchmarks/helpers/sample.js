const fs = require('fs')
const { join } = require('path')
const { cwd } = require('process')
const { promisify } = require('util')

const pStat = promisify(fs.stat)

const SAMPLE_TEST_BODY_LENGTH = 3000
const SAMPLE_TEST_FILENAME_LENGTH = 30

const generateRandomString = (length) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const string = Array.from({ length })
    .map(() => characters.charAt(Math.floor(Math.random() * characters.length)))
    .join('')

  return string
}

const runSampleTest = async () => {
  const filename = generateRandomString(SAMPLE_TEST_FILENAME_LENGTH)

  try {
    await pStat(join(cwd(), filename))
  } catch (_) {}

  generateRandomString(SAMPLE_TEST_BODY_LENGTH)
}

module.exports = { runSampleTest }
