import { type NextFunction, type Request, type Response } from 'express'
import { rateLimit, type AugmentedRequest } from 'express-rate-limit'
import createError from 'http-errors'
import { type AppInstance } from '../../lib/instance.js'
import { setGlobalRateLimit } from '../../lib/route.js'

export interface RateLimitRoute {
  method: string;
  path: string;
}

export interface RateLimitOptions {
  max: number;
  timeWindow: number | string;
  route?: RateLimitRoute;
}

declare global {
  namespace Express {
    interface Application {
      rateLimit: (options: RateLimitOptions) => import('express').RequestHandler;
      /** The application wide limiter, for the routes that are not declared through `route()`. */
      rateLimitGlobal: import('express').RequestHandler;
    }
  }
}

const TIME_UNITS: Record<string, number> = {
  millisecond: 1,
  milliseconds: 1,
  ms: 1,
  second: 1000,
  seconds: 1000,
  s: 1000,
  minute: 60000,
  minutes: 60000,
  m: 60000,
  hour: 3600000,
  hours: 3600000,
  h: 3600000
}

export function parseTimeWindow (timeWindow: number | string): number {
  if (typeof timeWindow === 'number') {
    return timeWindow
  }

  const match = /^\s*(\d+)\s*([a-z]+)\s*$/i.exec(timeWindow)

  /* c8 ignore start */
  if (match === null || !(match[2].toLowerCase() in TIME_UNITS)) {
    throw new Error(`Unable to parse the time window "${timeWindow}"`)
  }
  /* c8 ignore stop */

  return Number(match[1]) * TIME_UNITS[match[2].toLowerCase()]
}

/**
 * Renders a duration the way the rate limiter advertises it in the
 * "Rate limit exceeded, retry in ..." message.
 */
export function toReadableTime (windowMs: number): string {
  const seconds = Math.ceil(windowMs / 1000)

  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60
    return `${minutes} minute${minutes > 1 ? 's' : ''}`
  }

  return `${seconds} second${seconds > 1 ? 's' : ''}`
}

function setRateLimitHeaders (reply: Response, limit: number, remaining: number, resetSeconds: number): void {
  reply.setHeader('x-ratelimit-limit', limit)
  reply.setHeader('x-ratelimit-remaining', remaining)
  reply.setHeader('x-ratelimit-reset', resetSeconds)
}

function createLimiter (options: RateLimitOptions) {
  const windowMs = parseTimeWindow(options.timeWindow)
  const readableTime = toReadableTime(windowMs)
  const retryAfter = Math.ceil(windowMs / 1000)

  return rateLimit({
    windowMs,
    limit: options.max,
    // The headers are written by hand so that `x-ratelimit-reset` keeps
    // holding the remaining seconds instead of a unix timestamp.
    standardHeaders: false,
    legacyHeaders: false,
    handler: (_request, reply, next) => {
      setRateLimitHeaders(reply, options.max, 0, retryAfter)
      reply.setHeader('retry-after', retryAfter)
      next(createError(429, `Rate limit exceeded, retry in ${readableTime}`))
    },
    // `express-rate-limit` v8 refuses to start when it detects the counter
    // could be shared between tests; the in-memory store is the intended one.
    validate: { trustProxy: false, xForwardedForHeader: false }
  })
}

/**
 * A low-overhead rate limiter for the whole application, plus a factory so
 * that single routes can define a stricter limit.
 *
 * @see {@link https://github.com/express-rate-limit/express-rate-limit}
 */
export default function rateLimitPlugin (app: AppInstance): void {
  // A route declaring its own limit replaces the application wide one for that
  // route instead of adding to it, so both counters never see the same request.
  const overrides: RateLimitRoute[] = []

  app.rateLimit = (options: RateLimitOptions) => {
    const limiter = createLimiter(options)
    const windowMs = parseTimeWindow(options.timeWindow)

    if (options.route !== undefined) {
      overrides.push(options.route)
    }

    return (request: Request, reply: Response, next: NextFunction) => {
      limiter(request, reply, (err?: unknown) => {
        /* c8 ignore next 3 */
        if (err !== undefined && err !== null) {
          next(err)
          return
        }

        const info = (request as AugmentedRequest).rateLimit

        /* c8 ignore next 3 */
        if (info === undefined) {
          next()
          return
        }

        /* c8 ignore next */
        const resetTime = info.resetTime === undefined ? Date.now() + windowMs : info.resetTime.getTime()

        setRateLimitHeaders(
          reply,
          info.limit,
          info.remaining,
          Math.ceil((resetTime - Date.now()) / 1000)
        )
        next()
      })
    }
  }

  const globalLimiter = app.rateLimit({
    max: app.config.RATE_LIMIT_MAX,
    timeWindow: '1 minute'
  })

  app.rateLimitGlobal = (request: Request, reply: Response, next: NextFunction) => {
    // `request.path` is relative to whichever router the limiter is running in,
    // so the override is matched against the whole path the route was declared with.
    const path = request.originalUrl.split('?', 1)[0]

    if (overrides.some((route) => route.method === request.method && route.path === path)) {
      next()
      return
    }

    globalLimiter(request, reply, next)
  }

  // The source limiter is attached per route as each route is registered, never
  // ahead of the router: an unmatched URL and a request refused by a hook that
  // runs before the route are left uncounted and unstamped.
  setGlobalRateLimit(app.rateLimitGlobal)
}
