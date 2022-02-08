import { zipFunctions } from '../dist/main.js'

import { timeFunction, FIXTURES_DIR } from './helpers/main.js'

const BENCHMARK_OUTPUT = 'benchmarks/output'
const RUNS = 3

const runBenchmarks = async function () {
  const largeDepsZisi = await timeFunction(
    () =>
      zipFunctions(FIXTURES_DIR, BENCHMARK_OUTPUT, {
        config: { '*': { nodeBundler: 'zisi' } },
      }),
    RUNS,
  )

  console.log(`${largeDepsZisi}ms`)
}

runBenchmarks()
