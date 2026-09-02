import express from 'express'
import createError from 'http-errors'
import { NextFunction, Request, Response } from 'express'
import { AppInstance } from './lib/instance.js'
import { createRouter, setBodyParser } from './lib/route.js'
import { notFoundHandler } from './lib/not-found.js'

import env from './plugins/external/env.js'
import cors from './plugins/external/cors.js'
import helmet from './plugins/external/helmet.js'
import rateLimit from './plugins/external/rate-limit.js'
import sensible from './plugins/external/sensible.js'
import session from './plugins/external/session.js'
import staticPlugin from './plugins/external/static.js'
import knex from './plugins/external/knex.js'
import multipart from './plugins/external/multipart.js'
import underPressure from './plugins/external/under-pressure.js'
import swagger from './plugins/external/swagger.js'

import fileManager from './plugins/app/file-manager.js'
import passwordManager from './plugins/app/password-manager.js'
import authorization from './plugins/app/authorization.js'
import tasksFileManager from './plugins/app/tasks/tasks-file-manager.js'
import tasksRepository from './plugins/app/tasks/tasks-repository.js'
import usersRepository from './plugins/app/users/users-repository.js'

import homeRoutes from './routes/home.js'
import apiHooks from './routes/api/autohooks.js'
import apiRoutes from './routes/api/index.js'
import authRoutes from './routes/api/auth/index.js'
import tasksRoutes from './routes/api/tasks/index.js'
import usersRoutes from './routes/api/users/index.js'

export interface AppOptions {
  skipOverride?: boolean
}

/**
 * The JSON body parser reproduces the source framework's content-type gate: a body is
 * only parsed when the request declares JSON, so an undeclared body stays undefined and
 * fails schema validation instead of being silently accepted.
 */
function jsonBodyParser (): (request: Request, reply: Response, next: NextFunction) => void {
  const parse = express.json({ limit: '1mb' })

  return function (request, reply, next) {
    // A body with no declared content-type has no parser to claim it, which the
    // source framework reports as 415 rather than as a failed body validation.
    if (request.headers['content-type'] === undefined && Number(request.headers['content-length'] ?? 0) > 0) {
      next(createError(415, 'Unsupported Media Type'))
      return
    }

    parse(request, reply, (err?: unknown) => {
      if (err) {
        next(createError(400, "Body is not valid JSON but content-type is set to 'application/json'"))
        return
      }

      next()
    })
  }
}

export default async function serviceApp (app: AppInstance, opts: AppOptions = {}) {
  delete opts.skipOverride // This option only serves testing purpose

  // This loads all external plugins defined in plugins/external
  // those should be registered first as your application plugins might depend on them
  await env(app)
  await cors(app)
  await helmet(app)
  await rateLimit(app)
  await sensible(app)
  await session(app)
  await staticPlugin(app)
  await knex(app)
  await multipart(app)
  await underPressure(app)
  await swagger(app)

  // The parser is handed to the route lifecycle instead of being mounted ahead
  // of routing, because in the source framework a body is only parsed once a
  // route has matched and its onRequest hooks have run.
  setBodyParser(jsonBodyParser())

  // This loads all plugins defined in plugins/app
  // those should be support plugins that are reused
  // through your application
  await fileManager(app)
  await passwordManager(app)
  await authorization(app)
  await tasksFileManager(app)
  tasksRepository(app)
  await usersRepository(app)

  // This loads all plugins defined in routes
  await homeRoutes(app)

  const api = createRouter('/api', app.routeRegistry)
  await apiHooks(app, api)
  await apiRoutes(app, api)

  const auth = createRouter('/api/auth', app.routeRegistry)
  await authRoutes(app, auth)
  api.router.use('/auth', auth.router)

  const tasks = createRouter('/api/tasks', app.routeRegistry)
  await tasksRoutes(app, tasks)
  api.router.use('/tasks', tasks.router)

  const users = createRouter('/api/users', app.routeRegistry)
  await usersRoutes(app, users)
  api.router.use('/users', users.router)

  app.use('/api', api.router)

  // An attacker could search for valid URLs if your 404 error handling is not rate limited.
  app.use(app.rateLimit({ max: 3, timeWindow: 500 }), notFoundHandler)

  app.use(function (err: createError.HttpError, request: Request, reply: Response, _next: NextFunction) {
    app.log.error(
      {
        err,
        request: {
          method: request.method,
          url: request.url,
          query: request.query,
          params: request.params
        }
      },
      'Unhandled error occurred'
    )

    reply.status(err.statusCode ?? 500)

    let message = 'Internal Server Error'

    if (err.statusCode && err.statusCode < 500) {
      message = err.message
    }

    reply.send({ message })
  })
}
