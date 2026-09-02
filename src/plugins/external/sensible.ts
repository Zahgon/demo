import { type NextFunction, type Request, type Response } from 'express'
import createError from 'http-errors'
import { type AppInstance } from '../../lib/instance.js'

declare global {
  namespace Express {
    interface Response {
      badRequest: (message?: string) => never;
      unauthorized: (message?: string) => never;
      notFound: (message?: string) => never;
      notAcceptable: (message?: string) => never;
    }
  }
}

export const autoConfig = {}

/**
 * Adds the `reply.badRequest()` family of helpers. They throw so that the
 * application error handler owns the response, exactly like the Fastify
 * counterpart which sends the error through `reply.send(error)`.
 *
 * @see {@link https://github.com/jshttp/http-errors}
 */
export default function sensible (app: AppInstance): void {
  app.use((_request: Request, reply: Response, next: NextFunction) => {
    reply.badRequest = (message?: string): never => {
      throw createError(400, message ?? 'Bad Request')
    }
    reply.unauthorized = (message?: string): never => {
      throw createError(401, message ?? 'Unauthorized')
    }
    reply.notFound = (message?: string): never => {
      throw createError(404, message ?? 'Not Found')
    }
    reply.notAcceptable = (message?: string): never => {
      throw createError(406, message ?? 'Not Acceptable')
    }
    next()
  })
}
