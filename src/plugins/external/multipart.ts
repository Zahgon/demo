import { type Readable } from 'node:stream'
import busboy from 'busboy'
import createError from 'http-errors'
import { type AppInstance } from '../../lib/instance.js'

export interface MultipartFile {
  fieldname: string
  filename: string
  encoding: string
  mimetype: string
  file: Readable & { truncated: boolean }
}

declare global {
  namespace Express {
    interface Request {
      file: () => Promise<MultipartFile | undefined>
    }
  }
}

export const autoConfig = {
  limits: {
    fieldNameSize: 100, // Max field name size in bytes
    fieldSize: 100, // Max field value size in bytes
    fields: 10, // Max number of non-file fields
    fileSize: 1 * 1024 * 1024, // Max file size in bytes (5 MB)
    files: 1, // Max number of file fields
    parts: 1000 // Max number of parts
  }
}

/**
 * This plugins allows to parse the multipart content-type
 *
 * @see {@link https://github.com/mscdex/busboy}
 */
export default function multipart (app: AppInstance): void {
  app.use((request, reply, next) => {
    request.file = async () => {
      const contentType = request.headers['content-type']

      if (typeof contentType !== 'string' || !contentType.toLowerCase().startsWith('multipart/')) {
        throw createError(406, 'the request is not multipart')
      }

      return await new Promise<MultipartFile | undefined>((resolve, reject) => {
        const parser = busboy({ headers: request.headers, limits: autoConfig.limits })
        let settled = false
        let bytesSeen = 0

        request.on('data', (chunk: Buffer) => {
          bytesSeen += chunk.length
        })

        const drain = () => {
          request.unpipe(parser)
          request.resume()
        }

        reply.on('close', drain)

        parser.on('file', (fieldname, file, info) => {
          /* c8 ignore next */
          if (settled) return
          settled = true
          resolve({
            fieldname,
            filename: info.filename,
            encoding: info.encoding,
            mimetype: info.mimeType,
            file: file as Readable & { truncated: boolean }
          })
        })

        parser.on('close', () => {
          if (settled) return
          settled = true
          resolve(undefined)
        })

        // A request whose body ends before any part is parsed reports "no file"
        // rather than a parse failure, so a body-less upload reaches the route.
        parser.on('error', (err: Error) => {
          if (settled) return
          settled = true

          if (bytesSeen === 0) {
            resolve(undefined)
            return
          }

          /* c8 ignore next */
          reject(err)
        })

        request.pipe(parser)
      })
    }

    next()
  })
}
