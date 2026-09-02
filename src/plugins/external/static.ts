import path from 'node:path'
import fs from 'node:fs'
import express from 'express'
import { type AppInstance } from '../../lib/instance.js'
import { notFoundHandler } from '../../lib/not-found.js'

export const autoConfig = (app: AppInstance) => {
  const dirPath = path.join(import.meta.dirname, '../../..', app.config.UPLOAD_DIRNAME)

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath)
  }

  return {
    root: dirPath,
    prefix: `/${app.config.UPLOAD_DIRNAME}`
  }
}

/**
 * This plugins allows to serve static files.
 *
 * @see {@link https://expressjs.com/en/starter/static-files.html}
 */
export default function staticPlugin (app: AppInstance): void {
  const { root, prefix } = autoConfig(app)

  // The static mount is a route of its own: it is counted by the application
  // wide limiter, and a file it cannot find answers the not-found reply
  // directly instead of falling through to the rate limited 404 of an
  // unmatched URL.
  app.use(prefix, app.rateLimitGlobal, express.static(root), notFoundHandler)
}
