import { Type } from 'typebox'
import {
  TaskSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  TaskStatusEnum,
  QueryTaskPaginationSchema,
  TaskPaginationResultSchema
} from '../../../schemas/tasks.js'
import path from 'node:path'
import { stringify } from 'csv-stringify'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import type { AppInstance } from '../../../lib/instance.js'
import { route, type AppRouter } from '../../../lib/route.js'
import type { TaskQuery, UpdateTask } from '../../../plugins/app/tasks/tasks-repository.js'

interface IdParams {
  id: number
}

interface FilenameParams {
  filename: string
}

export default async function (app: AppInstance, target: AppRouter) {
  const { tasksRepository, tasksFileManager } = app

  route(target, {
    method: 'get',
    url: '/',
    schema: {
      querystring: QueryTaskPaginationSchema,
      response: {
        200: TaskPaginationResultSchema
      },
      tags: ['Tasks']
    },
    handler: async function (request) {
      return tasksRepository.paginate(request.query as unknown as TaskQuery)
    }
  })

  route(target, {
    method: 'get',
    url: '/:id',
    schema: {
      params: Type.Object({
        id: Type.Number()
      }),
      response: {
        200: TaskSchema,
        404: Type.Object({ message: Type.String() })
      },
      tags: ['Tasks']
    },
    handler: async function (request, reply) {
      const { id } = request.params as unknown as IdParams
      const task = await tasksRepository.findById(id)

      if (!task) {
        return reply.notFound('Task not found')
      }

      return task
    }
  })

  route(target, {
    method: 'post',
    url: '/',
    schema: {
      body: CreateTaskSchema,
      response: {
        201: {
          id: Type.Number()
        }
      },
      tags: ['Tasks']
    },
    handler: async function (request, reply) {
      const newTask = {
        ...request.body,
        author_id: request.session.user.id,
        status: TaskStatusEnum.New
      }

      const id = await tasksRepository.create(newTask)

      reply.status(201)

      return { id }
    }
  })

  route(target, {
    method: 'patch',
    url: '/:id',
    schema: {
      params: Type.Object({
        id: Type.Number()
      }),
      body: UpdateTaskSchema,
      response: {
        200: TaskSchema,
        404: Type.Object({ message: Type.String() })
      },
      tags: ['Tasks']
    },
    handler: async function (request, reply) {
      const { id } = request.params as unknown as IdParams
      const updatedTask = await tasksRepository.update(id, request.body as UpdateTask)

      if (!updatedTask) {
        return reply.notFound('Task not found')
      }

      return updatedTask
    }
  })

  route(target, {
    method: 'delete',
    url: '/:id',
    schema: {
      params: Type.Object({
        id: Type.Number()
      }),
      response: {
        204: Type.Null(),
        404: Type.Object({ message: Type.String() })
      },
      tags: ['Tasks']
    },
    preHandler: (request, reply, next) => {
      request.isAdmin(reply).then(() => next(), next)
    },
    handler: async function (request, reply) {
      const { id } = request.params as unknown as IdParams
      const deleted = await tasksRepository.delete(id)
      if (!deleted) {
        return reply.notFound('Task not found')
      }

      return reply.status(204).send(null)
    }
  })

  route(target, {
    method: 'post',
    url: '/:id/assign',
    schema: {
      params: Type.Object({
        id: Type.Number()
      }),
      body: Type.Object({
        userId: Type.Optional(Type.Number())
      }),
      response: {
        200: TaskSchema,
        404: Type.Object({ message: Type.String() })
      },
      tags: ['Tasks']
    },
    preHandler: (request, reply, next) => {
      request.isModerator(reply).then(() => next(), next)
    },
    handler: async function (request, reply) {
      const { id } = request.params as unknown as IdParams

      const task = await tasksRepository.findById(id)
      if (!task) {
        return reply.notFound('Task not found')
      }

      const { userId } = request.body as { userId?: number }
      await tasksRepository.update(id, { assigned_user_id: userId ?? null })

      task.assigned_user_id = userId

      return task
    }
  })

  route(target, {
    method: 'post',
    url: '/:id/upload',
    schema: {
      params: Type.Object({
        id: Type.Number()
      }),
      consumes: ['multipart/form-data'],
      response: {
        200: Type.Object({
          message: Type.String()
        }),
        404: Type.Object({ message: Type.String() }),
        400: Type.Object({ message: Type.String() })
      },
      tags: ['Tasks']
    },
    handler: async function (request, reply) {
      const { id } = request.params as unknown as IdParams

      const file = await request.file()
      if (!file) {
        return reply.notFound('File not found')
      }

      if (file.file.truncated) {
        return reply.badRequest('File size limit exceeded')
      }

      const allowedMimeTypes = ['image/jpeg', 'image/png']
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return reply.badRequest('Invalid file type')
      }

      const existingTask = await tasksRepository.findById(id)
      if (!existingTask) {
        return reply.notFound('Task not found')
      }

      let oldTempFilename: string | undefined
      const oldFilename = existingTask.filename
      if (oldFilename) {
        oldTempFilename = await tasksFileManager.moveOldToTemp(oldFilename)
      }

      return app.knex
        .transaction(async (trx) => {
          const newFilename = `${id}_${file.filename}`
          await tasksRepository.update(id, { filename: newFilename }, trx)

          await tasksFileManager.upload(newFilename, file)

          return { message: 'File uploaded successfully' }
        })
        .catch(async (err) => {
          if (oldFilename && oldTempFilename) {
            await tasksFileManager.moveTempToOld(oldTempFilename, oldFilename)
          }

          throw err
        })
    }
  })

  route(target, {
    method: 'get',
    url: '/:filename/image',
    schema: {
      params: Type.Object({
        filename: Type.String()
      }),
      response: {
        200: { type: 'string', contentMediaType: 'image/*' },
        404: Type.Object({ message: Type.String() })
      },
      tags: ['Tasks']
    },
    handler: async function (request, reply) {
      const { filename } = request.params as unknown as FilenameParams

      const task = await tasksRepository.findByFilename(filename)
      if (!task) {
        return reply.notFound(`No task has filename "${filename}"`)
      }

      const root = path.resolve(
        app.config.UPLOAD_DIRNAME,
        app.config.UPLOAD_TASKS_DIRNAME
      )

      await new Promise<void>((resolve, reject) => {
        reply.sendFile(task.filename as string, { root }, (err) => {
          /* c8 ignore next */
          if (err) { reject(err); return }
          resolve()
        })
      })
    }
  })

  route(target, {
    method: 'delete',
    url: '/:filename/image',
    schema: {
      params: Type.Object({
        filename: Type.String()
      }),
      response: {
        204: Type.Null(),
        404: Type.Object({ message: Type.String() })
      },
      tags: ['Tasks']
    },
    handler: async function (request, reply) {
      const { filename } = request.params as unknown as FilenameParams

      return app.knex
        .transaction(async (trx) => {
          const hasBeenUpdated = await tasksRepository.deleteFilename(filename, null, trx)

          if (!hasBeenUpdated) {
            return reply.notFound(`No task has filename "${filename}"`)
          }

          await tasksFileManager.delete(filename)

          reply.status(204)

          return { message: 'File deleted successfully' }
        })
    }
  })

  route(target, {
    method: 'get',
    url: '/download/csv',
    schema: {
      response: {
        200: Type.Unknown({ type: 'string', contentMediaType: 'application/gzip' }),
        400: Type.Object({ message: Type.String() })
      },
      tags: ['Tasks']
    },
    handler: async function (request, reply) {
      const queryStream = tasksRepository.createStream()

      const csvTransform = stringify({
        header: true,
        columns: undefined
      })

      reply.header('Content-Type', 'application/gzip')
      reply.header(
        'Content-Disposition',
      `attachment; filename="${encodeURIComponent('tasks.csv.gz')}"`
      )

      await pipeline(queryStream, csvTransform, createGzip(), reply)
    }
  })
}
