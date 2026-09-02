import { it } from 'node:test'
import assert from 'node:assert'
import { once } from 'node:events'
import { pino } from 'pino'
import serviceApp from '../../src/app.js'
import { createInstance } from '../../src/lib/instance.js'
import { config, inject } from '../helper.js'

it('should call errorHandler', async (t) => {
  const app = createInstance(pino({ level: process.env.LOG_LEVEL ?? 'silent' }))

  app.get('/error', () => {
    throw new Error('Kaboom!')
  })

  await serviceApp(app, config())

  const server = app.listen(0)
  await once(server, 'listening')
  app.server = server

  t.after(() => app.close())

  const res = await inject.call(app, {
    method: 'GET',
    url: '/error'
  })

  assert.deepStrictEqual(JSON.parse(res.payload), {
    message: 'Internal Server Error'
  })
})
