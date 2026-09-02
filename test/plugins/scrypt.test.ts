import { test } from 'node:test'
import { pino } from 'pino'
import scryptPlugin from '../../src/plugins/app/password-manager.js'
import { createInstance } from '../../src/lib/instance.js'
import assert from 'node:assert'

test('scrypt works standalone', async t => {
  const app = createInstance(pino({ level: process.env.LOG_LEVEL ?? 'silent' }))

  t.after(() => app.close())

  await scryptPlugin(app)

  const password = 'test_password'
  const { passwordManager } = app
  const hash = await passwordManager.hash(password)
  assert.ok(typeof hash === 'string')

  const isValid = await passwordManager.compare(password, hash)
  assert.ok(isValid, 'compare should return true for correct password')

  const isInvalid = await passwordManager.compare('wrong_password', hash)
  assert.ok(!isInvalid, 'compare should return false for incorrect password')

  await assert.rejects(
    () => passwordManager.compare(password, 'malformed_hash'),
    'compare should throw an error for malformed hash'
  )
})
