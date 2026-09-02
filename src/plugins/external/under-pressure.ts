import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import createError from 'http-errors'
import { type AppInstance } from '../../lib/instance.js'

export interface UnderPressureOptions {
  maxEventLoopDelay: number
  maxHeapUsedBytes: number
  maxRssBytes: number
  maxEventLoopUtilization: number
  message: string
  retryAfter: number
  healthCheck: () => Promise<boolean>
  healthCheckInterval: number
}

export const autoConfig = (app: AppInstance): UnderPressureOptions => {
  return {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 100_000_000,
    maxRssBytes: 1_000_000_000,
    maxEventLoopUtilization: 0.98,
    message: 'The server is under pressure, retry later!',
    retryAfter: 50,
    healthCheck: async () => {
      try {
        await app.knex.raw('SELECT 1')
        return true
        /* c8 ignore start */
      } catch (err) {
        app.log.error(err, 'healthCheck has failed')
        throw new Error('Database connection is not available')
      }
      /* c8 ignore stop */
    },
    healthCheckInterval: 5000
  }
}

/**
 * A plugin for mesuring process load and automatically handle of "Service Unavailable"
 *
 * @see {@link https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions}
 *
 * Video on the topic: Do not thrash the event loop
 * @see {@link https://www.youtube.com/watch?v=VI29mUA8n9w}
 */
export default function underPressure (app: AppInstance): void {
  const options = autoConfig(app)

  const histogram = monitorEventLoopDelay({ resolution: 10 })
  histogram.enable()

  let eventLoopDelay = 0
  let eventLoopUtilization = 0
  let heapUsed = 0
  let rssBytes = 0
  let healthy = true
  let elu = performance.eventLoopUtilization()

  const sample = () => {
    const current = performance.eventLoopUtilization()
    eventLoopUtilization = performance.eventLoopUtilization(current, elu).utilization
    elu = current
    eventLoopDelay = Math.max(0, histogram.mean / 1e6 - 10)
    histogram.reset()

    const memory = process.memoryUsage()
    heapUsed = memory.heapUsed
    rssBytes = memory.rss
  }

  const sampler = setInterval(sample, options.healthCheckInterval)
  sampler.unref()

  const checker = setInterval(() => {
    options.healthCheck().then(
      (result) => {
        healthy = result
      },
      /* c8 ignore next 3 */
      () => {
        healthy = false
      }
    )
  }, options.healthCheckInterval)
  checker.unref()

  app.addCloseHook(async () => {
    clearInterval(sampler)
    clearInterval(checker)
    histogram.disable()
  })

  app.use((_request, reply, next) => {
    /* c8 ignore start */
    if (
      !healthy ||
      eventLoopDelay > options.maxEventLoopDelay ||
      heapUsed > options.maxHeapUsedBytes ||
      rssBytes > options.maxRssBytes ||
      eventLoopUtilization > options.maxEventLoopUtilization
    ) {
      reply.setHeader('retry-after', String(options.retryAfter))
      next(createError(503, options.message))
      return
    }
    /* c8 ignore stop */

    next()
  })
}
