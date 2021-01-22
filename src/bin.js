#!/usr/bin/env node
const { exit } = require('process')

const yargs = require('yargs')

const zipIt = require('./main')

// CLI entry point
const runCli = async function () {
  const { srcFolder, destFolder, zipGo } = parseArgs()

  try {
    const zipped = await zipIt.zipFunctions(srcFolder, destFolder, { zipGo })
    console.log(JSON.stringify(zipped, null, 2))
  } catch (error) {
    console.error(error.toString())
    exit(1)
  }
}

const parseArgs = function () {
  return yargs.command('* <srcFolder> <destFolder>').options(OPTIONS).usage(USAGE).strict().parse()
}

const OPTIONS = {
  'zip-go': {
    boolean: true,
    default: false,
    describe: 'Whether Go binaries should be zipped or copied as is',
  },
}

const USAGE = `$0 [OPTIONS...] FUNCTIONS_DIRECTORY OUTPUT_DIRECTORY

Zip all function files inside FUNCTIONS_DIRECTORY so that they can be uploaded
to AWS Lambda.`

runCli()
