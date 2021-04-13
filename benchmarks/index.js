const { join } = require('path')

const { zipFunctions } = require('..')

const { timeFunction } = require('./helpers/main')
const { runSampleTest } = require('./helpers/sample')

const BENCHMARK_OUTPUT = 'benchmarks/output'
const RUNS = 3

const runBenchmarks = async function () {
  const func = join(__dirname, 'fixtures')

  // eslint-disable-next-line no-magic-numbers
  const sample = await timeFunction(() => runSampleTest(), RUNS * 1000)
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

  const output = { metrics: { sample, largeDepsZisi, largeDepsEsbuild } }

  console.log(JSON.stringify(output))
}

runBenchmarks()
