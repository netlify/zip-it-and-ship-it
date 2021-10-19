#!/usr/bin/env node
import { exit } from 'process'

import yargs from 'yargs'

import { zipFunctions } from './main'
import { ARCHIVE_FORMAT_NONE, ARCHIVE_FORMAT_ZIP } from './utils/consts'

// CLI entry point
const runCli = async function () {
  // @ts-expect-error soon
  const { destFolder, srcFolder, ...options } = parseArgs()

  try {
    // @ts-expect-error soon
    const zipped = await zipFunctions(srcFolder, destFolder, options)
    console.log(JSON.stringify(zipped, null, 2))
  } catch (error) {
    console.error(error.toString())
    exit(1)
  }
}

const parseArgs = function () {
  return yargs
    .command('* <srcFolder> <destFolder>', 'Create ZIP archives from a directory')
    .options(OPTIONS)
    .usage(USAGE)
    .strict()
    .parse()
}

const OPTIONS = {
  'archive-format': {
    string: true,
    choices: [ARCHIVE_FORMAT_NONE, ARCHIVE_FORMAT_ZIP],
    default: ARCHIVE_FORMAT_ZIP,
    describe: 'Format of the archive created for each function',
  },
  config: {
    default: {},
    describe:
      'An object matching glob-like expressions to objects containing configuration properties. Whenever a function name matches one of the expressions, it inherits the configuration properties',
  },
  manifest: {
    string: true,
    describe: 'If a manifest file is to be created, specifies its path',
  },
  'parallel-limit': {
    number: true,
    describe: 'Maximum number of Functions to bundle at the same time',
  },
}

const USAGE = `$0 [OPTIONS...] FUNCTIONS_DIRECTORY OUTPUT_DIRECTORY

Zip all function files inside FUNCTIONS_DIRECTORY so that they can be uploaded
to AWS Lambda.`

runCli()
