import { hrtime } from 'process'

const NANOSECS_TO_SECS = 1e9
const NANOSECS_TO_MSECS = 1e6

export const startTimer = function () {
  return hrtime()
}

// returns the time in nanoseconds
export const endTimer = function ([startSecs, startNsecs]: [number, number]) {
  const [endSecs, endNsecs] = hrtime()
  const durationNs = (endSecs - startSecs) * NANOSECS_TO_SECS + endNsecs - startNsecs

  return durationNs
}

export const roundTimerToMillisecs = function (durationNs: number) {
  return Math.round(durationNs / NANOSECS_TO_MSECS)
}
