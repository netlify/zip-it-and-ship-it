#!/usr/bin/env node
const { exit } = require('process')

const yargs = require('yargs')

const zipIt = require('..')

// CLI entry point
const runCli = async function() {
  const { srcFolder, destFolder, zipGo = false, skipGo = !zipGo } = parseArgs()

  try {
    const zipped = await zipIt.zipFunctions(srcFolder, destFolder, { skipGo })
    console.log(JSON.stringify(zipped, null, 2))
  } catch (error) {
    console.error(error.toString())
    exit(1)
  }
}

const parseArgs = function() {
  return yargs
    .command('* <srcFolder> <destFolder>')
    .options(OPTIONS)
    .usage(USAGE)
    .strict()
    .parse()
}

const OPTIONS = {
  'skip-go': {
    boolean: true,
    describe: 'Whether Go binaries should be copied as is or zipped'
  },
  // TODO: deprecated. Remove on the next major release
  'zip-go': {
    boolean: true,
    describe: 'Whether Go binaries should be zipped or copied as is'
  }
}

const USAGE = `$0 [OPTIONS...] FUNCTIONS_DIRECTORY OUTPUT_DIRECTORY

Zip all function files inside FUNCTIONS_DIRECTORY so that they can be uploaded
to AWS Lambda.`

runCli()
