import { ReturnType } from 'typebox'
import fs from 'fs'
import { pipeline } from 'node:stream/promises'
import * as crypto from 'node:crypto'
import { MultipartFile } from '../external/multipart.js'
import sanitize from 'sanitize-filename'
import path from 'node:path'
import { AppInstance } from '../../lib/instance.js'

declare global {
  namespace Express {
    export interface Application {
      fileManager: ReturnType<typeof createFileManager>
    }
  }
}

function createFileManager (app: AppInstance) {
  return {
    ensureDir (dir: string) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    },

    async upload (file: MultipartFile, destPath: string) {
      await pipeline(file.file, fs.createWriteStream(destPath))
    },

    /**
     * May fail if `source` and `destination` are on different devices or volumes.
     *
     * In such cases, fallback to a "copy + delete" strategy.
     * @see https://stackoverflow.com/a/29105404
     */
    async move (source: string, destination: string) {
      await fs.promises.rename(source, destination)
    },

    async unlink (filePath: string) {
      try {
        await fs.promises.unlink(filePath)
      } catch (err) {
        if (isErrnoException(err) && err.code === 'ENOENT') {
          app.log.warn(`File path '${filePath}' not found`)
        } else {
          throw err
        }
      }
    },

    // Centralize filename upload sanitization
    safeJoin: (uploadPath: string, filename: string) => path.join(uploadPath, sanitize(filename)),

    randomSuffix () {
      return crypto.randomBytes(8).toString('hex')
    }
  }
}

function isErrnoException (error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export default async function (app: AppInstance) {
  app.fileManager = createFileManager(app)
}
