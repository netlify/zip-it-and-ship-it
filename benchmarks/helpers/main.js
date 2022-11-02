/* eslint-disable max-statements */
import assert from 'assert'
import { performance, PerformanceObserver } from 'perf_hooks'
import { fileURLToPath } from 'url'

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url))

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export const timeFunction = async (func, runs = 1) => {
  const finishedRuns = new Map()

  performance.clearMarks()
  performance.clearMeasures()

  const observer = new PerformanceObserver((list) => {
    const [entry] = list.getEntries()

    finishedRuns.set(entry.name, entry.duration)
  })

  observer.observe({ entryTypes: ['measure'] })

  for (let index = 0; index < runs; index++) {
    performance.mark(`run-${index}-start`)

    await func(index)

    performance.measure(`run-${index}`, `run-${index}-start`)
  }

  // wait for PerformanceObserver to gather all data
  await sleep(100)

  const durations = [...finishedRuns.values()]

  observer.disconnect()

  assert(durations.length === runs, 'Not all runs produced timings')

  const average = durations.reduce((acc, duration) => duration + acc, 0) / runs

  return average
}
