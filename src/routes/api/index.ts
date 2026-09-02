import { AppInstance } from '../../lib/instance.js'
import { AppRouter, route } from '../../lib/route.js'

export default async function (_app: AppInstance, target: AppRouter) {
  route(target, {
    method: 'get',
    url: '/',
    handler: ({ session, protocol, hostname }) => {
      return {
        message:
          `Hello ${session.user.username}! See documentation at ${protocol}://${hostname}/documentation`
      }
    }
  })
}
