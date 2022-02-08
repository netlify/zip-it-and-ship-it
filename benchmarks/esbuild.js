const { join } = require('path')

const { zipFunctions } = require('..')

const { timeFunction, FIXTURES_DIR } = require('./helpers/main')

const BENCHMARK_OUTPUT = 'benchmarks/output'
const RUNS = 3

const runBenchmarks = async function () {
  const largeDepsEsbuild = await timeFunction(
    (run) =>
      zipFunctions(FIXTURES_DIR, join(BENCHMARK_OUTPUT, `run-${run}`), {
        config: { '*': { nodeBundler: 'esbuild' } },
      }),
    RUNS,
  )

  console.log(`${largeDepsEsbuild}ms`)
}

runBenchmarks()
