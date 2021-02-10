#!/usr/bin/env node
const { env, exit } = require('process')

const yargs = require('yargs')

const zipIt = require('./main')

// CLI entry point
const runCli = async function () {
  const { destFolder, externalModules, parallelLimit, srcFolder, useEsbuild, zipGo } = parseArgs()

  try {
    const zipped = await zipIt.zipFunctions(srcFolder, destFolder, {
      externalModules,
      parallelLimit,
      useEsbuild,
      zipGo,
    })
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
  'parallel-limit': {
    number: true,
    describe: 'Maximum number of Functions to bundle at the same time',
  },
  'use-esbuild': {
    boolean: true,
    default: Boolean(env.NETLIFY_EXPERIMENTAL_ESBUILD),
    describe: 'Whether to use esbuild to bundle JavaScript functions',
    hidden: true,
  },
  'external-modules': {
    array: true,
    default: (env.NETLIFY_EXPERIMENTAL_EXTERNAL_MODULES || '').split(','),
    describe: 'List of Node modules to keep out of the bundle',
    hidden: true,
  },
}

const USAGE = `$0 [OPTIONS...] FUNCTIONS_DIRECTORY OUTPUT_DIRECTORY

Zip all function files inside FUNCTIONS_DIRECTORY so that they can be uploaded
to AWS Lambda.`

runCli()
