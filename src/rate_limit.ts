export enum RateLimitAlgorithm {
  SlidingWindow = 'sliding_window',
}

export enum RateLimitAggregator {
  Domain = 'domain',
  IP = 'ip',
}

export enum RateLimitAction {
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

interface RateLimitConfig {
  action?: RateLimitAction
  aggregateBy?: RateLimitAggregator | RateLimitAggregator[]
  algorithm?: RateLimitAlgorithm
}

export type RateLimit = RateLimitConfig & (SlidingWindow | RewriteActionConfig)
