import { join } from 'path'
import process from 'process'

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

try {
  await runBenchmarks()
  process.stderr.write('ESBuild benchmark finished\n')
} catch (error) {
  console.error(error)
}
