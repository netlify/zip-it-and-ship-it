const { join } = require('path')

const { zipFunctions } = require('..')

const { timeFunction } = require('./helpers/main')

const BENCHMARK_OUTPUT = 'benchmarks/output'
const RUNS = 3

const runBenchmarks = async function () {
  const func = join(__dirname, 'fixtures')

  const largeDepsZisi = await timeFunction(
    () =>
      zipFunctions(func, BENCHMARK_OUTPUT, {
        config: { '*': { nodeBundler: 'zisi' } },
      }),
    RUNS,
  )
  const largeDepsEsbuild = await timeFunction(
    (run) =>
      zipFunctions(func, join(BENCHMARK_OUTPUT, `run-${run}`), {
        config: { '*': { nodeBundler: 'esbuild' } },
      }),
    RUNS,
  )

  const output = { metrics: { largeDepsZisi, largeDepsEsbuild } }

  console.log(JSON.stringify(output))
}

runBenchmarks()
