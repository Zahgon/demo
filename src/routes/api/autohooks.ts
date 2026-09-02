import { NextFunction, Request, Response } from 'express'
import { AppInstance } from '../../lib/instance.js'
import { AppRouter } from '../../lib/route.js'

export default async function (_app: AppInstance, target: AppRouter) {
  target.router.use((request: Request, reply: Response, next: NextFunction) => {
    if (request.originalUrl.startsWith('/api/auth/login')) {
      next()
      return
    }

    if (!request.session.user) {
      reply.unauthorized('You must be authenticated to access this route.')
    }

    next()
  })
}
