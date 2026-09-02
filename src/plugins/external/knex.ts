import knex, { type Knex } from 'knex'
import { type AppInstance } from '../../lib/instance.js'

declare global {
  namespace Express {
    interface Application {
      knex: Knex
    }
  }
}

export const autoConfig = (app: AppInstance): Knex.Config => {
  return {
    client: 'mysql2',
    connection: {
      host: app.config.MYSQL_HOST,
      user: app.config.MYSQL_USER,
      password: app.config.MYSQL_PASSWORD,
      database: app.config.MYSQL_DATABASE,
      port: Number(app.config.MYSQL_PORT)
    },
    pool: { min: 2, max: 10 }
  }
}

/**
 * SQL query builder
 *
 * @see {@link https://knexjs.org/}
 */
export default function knexPlugin (app: AppInstance): void {
  app.knex = knex(autoConfig(app))

  app.addCloseHook(async () => {
    await app.knex.destroy()
  })
}
