import { Type } from 'typebox'
import { CredentialsSchema } from '../../../schemas/auth.js'
import { AppInstance } from '../../../lib/instance.js'
import { AppRouter, route } from '../../../lib/route.js'

export default async function (app: AppInstance, target: AppRouter) {
  const { usersRepository, passwordManager } = app

  route(target, {
    method: 'post',
    url: '/login',
    schema: {
      body: CredentialsSchema,
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.Optional(Type.String())
        }),
        401: Type.Object({
          message: Type.String()
        })
      },
      tags: ['Authentication']
    },
    handler: async function (request, reply) {
      const { email, password } = request.body

      return app.knex.transaction(async (trx) => {
        const user = await usersRepository.findByEmail(email, trx)

        if (user) {
          const isPasswordValid = await passwordManager.compare(
            password,
            user.password
          )
          if (isPasswordValid) {
            const roles = await usersRepository.findUserRolesByEmail(email, trx)

            request.session.user = {
              id: user.id,
              email: user.email,
              username: user.username,
              roles: roles.map((role) => role.name)
            }

            await new Promise<void>((resolve, reject) => {
              request.session.save((err) => {
                /* c8 ignore start */
                if (err) {
                  reject(err)
                  return
                }
                /* c8 ignore stop */
                resolve()
              })
            })

            return { success: true }
          }
        }

        reply.status(401)

        return { message: 'Invalid email or password.' }
      })
    }
  })
}
