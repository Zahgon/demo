import { Type } from 'typebox'
import { UpdateCredentialsSchema } from '../../../schemas/users.js'
import { AppInstance } from '../../../lib/instance.js'
import { AppRouter, route } from '../../../lib/route.js'

export default async function (app: AppInstance, target: AppRouter) {
  const { usersRepository, passwordManager } = app

  route(target, {
    method: 'put',
    url: '/update-password',
    onRequest: app.rateLimit({
      max: 3,
      timeWindow: '1 minute',
      route: { method: 'PUT', path: `${target.prefix}/update-password` }
    }),
    schema: {
      body: UpdateCredentialsSchema,
      response: {
        200: Type.Object({
          message: Type.String()
        }),
        400: Type.Object({
          message: Type.String()
        }),
        401: Type.Object({
          message: Type.String()
        })
      },
      tags: ['Users']
    },
    handler: async function (request, reply) {
      const { newPassword, currentPassword } = request.body
      const { email } = request.session.user

      const user = await usersRepository.findByEmail(email)

      if (!user) {
        return reply.status(401).send({ message: 'User does not exist.' })
      }

      const isPasswordValid = await passwordManager.compare(
        currentPassword,
        user.password
      )

      if (!isPasswordValid) {
        return reply.status(401).send({ message: 'Invalid current password.' })
      }

      if (newPassword === currentPassword) {
        reply.status(400)
        return { message: 'New password cannot be the same as the current password.' }
      }

      const hashedPassword = await passwordManager.hash(newPassword)
      await usersRepository.updatePassword(email, hashedPassword)

      return { message: 'Password updated successfully' }
    }
  })
}
