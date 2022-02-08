import { performance, PerformanceObserver } from 'perf_hooks'
import { fileURLToPath } from 'url'

export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url))

export const timeFunction = (func, runs = 1) =>
  new Promise((resolve) => {
    const finishedRuns = new Map()

    const observer = new PerformanceObserver((list) => {
      const [entry] = list.getEntries()

      finishedRuns.set(entry.name, entry.duration)

      if (finishedRuns.size === runs) {
        const durations = [...finishedRuns.values()]
        const average = durations.reduce((acc, duration) => duration + acc, 0) / runs

        resolve(average)
      }
    })

    observer.observe({ entryTypes: ['measure'] })

    Array.from({ length: runs }).forEach(async (_, index) => {
      performance.mark(`run-${index}-start`)

      await func(index)

      performance.measure(`run-${index}`, `run-${index}-start`)
    })
  })
