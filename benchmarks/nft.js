const { join } = require('path')

const { zipFunctions } = require('../dist/main')

const { timeFunction } = require('./helpers/main')

const BENCHMARK_OUTPUT = 'benchmarks/output'
const RUNS = 3

const runBenchmarks = async function () {
  const func = join(__dirname, 'fixtures')

  const largeDepsNft = await timeFunction(
    () =>
      zipFunctions(func, BENCHMARK_OUTPUT, {
        config: { '*': { nodeBundler: 'nft' } },
      }),
    RUNS,
  )

  console.log(`${largeDepsNft}ms`)
}

runBenchmarks()
