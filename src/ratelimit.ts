export enum RatelimitAlgorithm {
  SlidingWindow = 'sliding_window',
}

type SlidingWindow = {
  windowSize: number
  windowLimit: number
}

type RatelimitConfig = {
  algorithm: RatelimitAlgorithm
}

export type Ratelimit = RatelimitConfig & SlidingWindow
