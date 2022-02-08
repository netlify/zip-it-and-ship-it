
const { zipFunctions } = require('../dist/main')

const { timeFunction, FIXTURES_DIR } = require('./helpers/main')

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

runBenchmarks()
