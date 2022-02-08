import { join } from 'path'

import { zipFunctions } from '../dist/main.js'

import { timeFunction, FIXTURES_DIR } from './helpers/main.js'

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
