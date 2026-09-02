import { type Request, type Response } from 'express'

/**
 * The application's not-found reply. The source framework reaches it from two
 * places: a URL that matched no route at all, and a route that matched but
 * could not produce the resource -- a missing static file, for instance. Only
 * the first of those is rate limited, so the limiter lives at the call sites.
 */
export function notFoundHandler (request: Request, reply: Response): void {
  request.log.warn(
    {
      request: {
        method: request.method,
        url: request.url,
        query: request.query,
        params: request.params
      }
    },
    'Resource not found'
  )

  reply.status(404).send({ message: 'Not Found' })
}
