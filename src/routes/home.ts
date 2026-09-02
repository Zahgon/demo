import { Type } from 'typebox'
import { AppInstance } from '../lib/instance.js'
import { createRouter, route } from '../lib/route.js'

export default async function (app: AppInstance) {
  const target = createRouter('', app.routeRegistry)

  route(target, {
    method: 'get',
    url: '/',
    schema: {
      response: {
        200: Type.Object({
          message: Type.String()
        })
      }
    },
    handler: async function () {
      return { message: 'Welcome to the official fastify demo!' }
    }
  })

  app.use(target.router)
}
