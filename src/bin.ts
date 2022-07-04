#!/usr/bin/env node
import { argv, exit } from 'process'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import type { ArchiveFormat } from './archive.js'
import { zipFunctions } from './main.js'

declare global {
  // eslint-disable-next-line no-var
  var ZISI_CLI: boolean
}

// CLI entry point
const runCli = async function () {
  // @ts-expect-error TODO: `destFolder` and  `srcFolder` are not being passed
  // back from `parseArgs()`.
  const { destFolder, srcFolder, ...options } = parseArgs()

  try {
    global.ZISI_CLI = true
    // @ts-expect-error TODO: `options` is not getting the right types.
    const zipped = await zipFunctions(srcFolder, destFolder, options)

    console.log(JSON.stringify(zipped, null, 2))
  } catch (error) {
    console.error(error.toString())
    exit(1)
  }
}

const parseArgs = function () {
  return yargs(hideBin(argv))
    .command('* <srcFolder> <destFolder>', 'Create ZIP archives from a directory')
    .options(OPTIONS)
    .usage(USAGE)
    .strict()
    .parse()
}

const archiveFormats: ArchiveFormat[] = ['none', 'zip']
const defaultArchiveFormat: ArchiveFormat = 'zip'

const OPTIONS = {
  'archive-format': {
    string: true,
    choices: archiveFormats,
    default: defaultArchiveFormat,
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
