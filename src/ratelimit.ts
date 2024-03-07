export enum RatelimitAlgorithm {
  SlidingWindow = 'sliding_window',
}

export enum RatelimitAggregator {
  Domain = 'domain',
  IP = 'ip',
}

export enum RatelimitAction {
  Limit = 'rate_limit',
  Rewrite = 'rewrite',
}

interface SlidingWindow {
  windowLimit: number
  windowSize: number
}

export type RewriteActionConfig = SlidingWindow & {
  to: string
}

interface RatelimitConfig {
  action?: RatelimitAction
  aggregateBy?: RatelimitAggregator | RatelimitAggregator[]
  algorithm?: RatelimitAlgorithm
}

export type Ratelimit = RatelimitConfig & (SlidingWindow | RewriteActionConfig)
