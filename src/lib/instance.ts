import express, { type Express } from 'express'
import type { Server } from 'node:http'
import type { Logger } from 'pino'
import { RouteRegistry } from './openapi.js'

export type AppInstance = Express

export type CloseHook = () => Promise<void> | void

declare global {
  namespace Express {
    interface Application {
      log: Logger
      routeRegistry: RouteRegistry
      server: Server | null
      /** Runs on shutdown, in reverse registration order. */
      addCloseHook: (hook: CloseHook) => void
      close: () => Promise<void>
    }

    interface Request {
      log: Logger
    }

    interface Response {
      /** Alias of `status`, kept so route handlers read as before. */
      code: (statusCode: number) => import('express').Response
    }
  }
}

/**
 * Creates the application instance every plugin decorates.
 *
 * `x-powered-by` and the automatic entity tag are switched off so that a
 * response carries exactly the headers the application sets, and the query
 * string is parsed flat: `?a=1&a=2` yields an array, `?a[b]=1` a plain key.
 */
export function createInstance (log: Logger): AppInstance {
  const app = express()
  const closeHooks: CloseHook[] = []

  app.disable('x-powered-by')
  app.disable('etag')
  app.set('query parser', 'simple')

  app.log = log
  app.routeRegistry = new RouteRegistry()
  app.server = null

  app.addCloseHook = (hook: CloseHook): void => {
    closeHooks.push(hook)
  }

  app.close = async (): Promise<void> => {
    const server = app.server

    if (server !== null) {
      app.server = null
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err !== undefined && err !== null) {
            reject(err)
            return
          }
          resolve()
        })
        // Idle keep-alive sockets would otherwise hold the server open.
        server.closeAllConnections()
      })
    }

    for (const hook of [...closeHooks].reverse()) {
      await hook()
    }
  }

  app.use((request, _reply, next) => {
    request.log = log
    next()
  })

  return app
}
