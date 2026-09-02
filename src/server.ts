// This file is here only to show you how to proceed if you would
// like to run your application as a standalone executable.
//
// You can launch it with the command `npm run standalone`
import pino, { LoggerOptions } from 'pino'

// Import library to exit the process, gracefully (if possible)
import closeWithGrace from 'close-with-grace'

import { createInstance } from './lib/instance.js'

// Import your application as a normal plugin.
import serviceApp from './app.js'

/**
 * Do not use NODE_ENV to determine what logger (or any env related feature) to use
 * @see {@link https://www.youtube.com/watch?v=HMM7GJC5E2o}
 */
function getLoggerOptions (): LoggerOptions {
  // Only if the program is running in an interactive terminal
  if (process.stdout.isTTY) {
    return {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    }
  }

  return { level: process.env.LOG_LEVEL ?? 'silent' }
}

const app = createInstance(pino(getLoggerOptions()))

async function init () {
  // Register your application as a normal plugin.
  await serviceApp(app)

  closeWithGrace(
    { delay: process.env.FASTIFY_CLOSE_GRACE_DELAY ?? 500 },
    async ({ err }) => {
      if (err != null) {
        app.log.error(err)
      }

      await app.close()
    }
  )

  try {
    // Start listening.
    const server = app.listen(process.env.PORT ?? 3000)

    // Apply recommended timeouts to prevent slow or idle clients from holding connections open
    server.setTimeout(120_000)
    server.requestTimeout = 60_000
    server.keepAliveTimeout = 10_000
    server.headersTimeout = 15_000

    app.server = server
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

init()
