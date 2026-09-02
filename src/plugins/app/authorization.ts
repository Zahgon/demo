import { Request, Response } from 'express'
import { AppInstance } from '../../lib/instance.js'

declare global {
  namespace Express {
    export interface Request {
      verifyAccess: (reply: import('express').Response, role: string) => void;
      isModerator: (reply: import('express').Response) => Promise<void>;
      isAdmin: (reply: import('express').Response) => Promise<void>;
    }
  }
}

function verifyAccess (this: Request, reply: Response, role: string) {
  if (!this.session.user.roles.includes(role)) {
    reply.status(403).set('content-type', 'text/plain; charset=utf-8').send('You are not authorized to access this resource.')
  }
}

async function isModerator (this: Request, reply: Response) {
  this.verifyAccess(reply, 'moderator')
}

async function isAdmin (this: Request, reply: Response) {
  this.verifyAccess(reply, 'admin')
}

/**
 * The decorators are attached on every request so they are
 * available to the outer scope, as the route handlers do
 *
 * @see {@link https://expressjs.com/en/guide/using-middleware.html}
 */
export default async function (app: AppInstance) {
  app.use((request, _reply, next) => {
    request.verifyAccess = verifyAccess
    request.isModerator = isModerator
    request.isAdmin = isAdmin
    next()
  })
}
