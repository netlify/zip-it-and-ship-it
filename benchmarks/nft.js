import process from 'process'

import { zipFunctions } from '../dist/main.js'

import { timeFunction, FIXTURES_DIR } from './helpers/main.js'

const BENCHMARK_OUTPUT = 'benchmarks/output'
const RUNS = 3

const runBenchmarks = async function () {
  const largeDepsNft = await timeFunction(
    () =>
      zipFunctions(FIXTURES_DIR, BENCHMARK_OUTPUT, {
        config: { '*': { nodeBundler: 'nft' } },
      }),
    RUNS,
  )

  console.log(`${largeDepsNft}ms`)
}

try {
  await runBenchmarks()
  process.stderr.write('NFT benchmark finished\n')
} catch (error) {
  console.error(error)
}
