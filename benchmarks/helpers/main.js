import { performance, PerformanceObserver } from 'perf_hooks'
import { fileURLToPath } from 'url'

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url))

export const timeFunction = async (func, runs = 1) => {
  const finishedRuns = new Map()

  const observer = new PerformanceObserver((list) => {
    const [entry] = list.getEntries()

    finishedRuns.set(entry.name, entry.duration)
  })

  observer.observe({ entryTypes: ['measure'] })

  await Promise.all(
    Array.from({ length: runs }).map(async (_, index) => {
      performance.mark(`run-${index}-start`)

      await func(index)

      performance.measure(`run-${index}`, `run-${index}-start`)
    }),
  )

  const durations = [...finishedRuns.values()]
  const average = durations.reduce((acc, duration) => duration + acc, 0) / runs

  return average
}
