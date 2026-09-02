import { it } from 'node:test'
import assert from 'node:assert'
import { autoConfig, loadEnv } from '../../src/plugins/external/env.js'

it('UPLOAD_DIRNAME should not contain ..', async (t) => {
  const { schema: { type, properties: { UPLOAD_DIRNAME } } } = autoConfig

  const failPath = ['/../', '../', '/..']
  for (let i = 0; i < failPath.length; i++) {
    await assert.rejects(async () => {
      loadEnv({}, { type, properties: { UPLOAD_DIRNAME: { ...UPLOAD_DIRNAME, default: failPath[i] } } })
    }, { message: `env/UPLOAD_DIRNAME must match pattern "${UPLOAD_DIRNAME.pattern}"` })
  }
})

it('UPLOAD_DIRNAME.default should be a valid dirname', async (t) => {
  const { schema: { type, properties: { UPLOAD_DIRNAME } } } = autoConfig

  await assert.doesNotReject(async () => {
    loadEnv({}, { type, properties: { UPLOAD_DIRNAME: { ...UPLOAD_DIRNAME, default: UPLOAD_DIRNAME.default } } })
  })
})
