const { join } = require('path')

const { zipFunctions } = require('..')

const { timeFunction } = require('./helpers/main')

const BENCHMARK_OUTPUT = 'benchmarks/output'

const run = async function () {
  const func = join(__dirname, 'fixtures')

  const largeDepsZisi = await timeFunction(
    () =>
      zipFunctions(func, BENCHMARK_OUTPUT, {
        config: { '*': { nodeBundler: 'zisi' } },
      }),
    3,
  )
  const largeDepsEsbuild = await timeFunction(
    () =>
      zipFunctions(func, BENCHMARK_OUTPUT, {
        config: { '*': { nodeBundler: 'esbuild' } },
      }),
    3,
  )

  const output = { metrics: { largeDepsZisi, largeDepsEsbuild } }

  console.log(JSON.stringify(output))
}

run()
