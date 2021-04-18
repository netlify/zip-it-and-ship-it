const { join } = require('path')

const { zipFunctions } = require('..')

const { timeFunction } = require('./helpers/main')

const BENCHMARK_OUTPUT = 'benchmarks/output'
const RUNS = 3

const runBenchmarks = async function () {
  const func = join(__dirname, 'fixtures')

  const largeDepsEsbuild = await timeFunction(
    (run) =>
      zipFunctions(func, join(BENCHMARK_OUTPUT, `run-${run}`), {
        config: { '*': { nodeBundler: 'esbuild' } },
      }),
    RUNS,
  )

  console.log(`${largeDepsEsbuild}ms`)
}

runBenchmarks()
