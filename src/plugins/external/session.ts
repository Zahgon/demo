import cookieParser from 'cookie-parser'
import session from 'express-session'
import { type Auth } from '../../schemas/auth.js'
import { type AppInstance } from '../../lib/instance.js'

declare module 'express-session' {
  interface Session {
    user: Auth;
  }
}

/**
 * This plugins enables the use of session.
 *
 * @see {@link https://github.com/expressjs/session}
 */
export default function sessionPlugin (app: AppInstance): void {
  app.use(cookieParser(app.config.COOKIE_SECRET))
  app.use(session({
    secret: app.config.COOKIE_SECRET,
    name: app.config.COOKIE_NAME,
    resave: false,
    // The source session plugin defaults both of these on and the application
    // never overrides them: a session is stored and its cookie sent even when
    // nothing was written to it, and the cookie is re-sent on every response
    // rather than only on the one that created or changed the session.
    saveUninitialized: true,
    rolling: true,
    cookie: {
      secure: app.config.COOKIE_SECURED,
      httpOnly: true,
      maxAge: 1800000
    }
  }))

  // A secure cookie is normally withheld on an insecure connection, but a
  // session that was explicitly saved is still sent, carrying the secure flag.
  app.use((request, reply, next) => {
    const { session } = request
    /* c8 ignore start */
    if (session === undefined) {
      next()
      return
    }
    /* c8 ignore stop */

    const save = session.save.bind(session)

    session.save = function (callback?: (err?: Error) => void) {
      return save((err?: Error) => {
        if (err === undefined || err === null) {
          if (session.cookie.secure === true && !request.secure) {
            reply.cookie(app.config.COOKIE_NAME, request.sessionID, {
              expires: session.cookie.expires ?? undefined,
              httpOnly: session.cookie.httpOnly,
              path: session.cookie.path,
              sameSite: session.cookie.sameSite,
              secure: true,
              signed: true
            })
          }
        }
        callback?.(err)
      })
    }

    next()
  })
}
