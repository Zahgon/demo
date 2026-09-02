import assert from 'node:assert'
import { describe, it } from 'node:test'
import { build } from '../helper.js'

/**
 * Each test here pins a wire contract that the inherited suite never observes,
 * on a seam where a plausible wrong wiring would still compile and still leave
 * that suite green. They run against a real server, so they see the bytes the
 * application actually writes rather than the ones it intends to.
 */
describe('Migration seams', () => {
  it('serves the API documentation without authentication', async (t) => {
    const app = await build(t)

    const res = await app.inject({ method: 'GET', url: '/api/docs/' })

    assert.strictEqual(res.statusCode, 200)
    assert.match(res.headers['content-type'] as string, /^text\/html/)
  })

  it('exposes an OpenAPI document that hides untagged routes', async (t) => {
    const app = await build(t)

    const res = await app.inject({ method: 'GET', url: '/api/docs/json' })
    const document = res.json()

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(document.openapi, '3.0.3')
    assert.deepStrictEqual(document.info, {
      title: 'Fastify demo API',
      description: 'The official Fastify demo API',
      version: '0.0.0'
    })
    assert.deepStrictEqual(document.components, { schemas: {} })
    assert.deepStrictEqual(Object.keys(document.paths).sort(), [
      '/api/auth/login',
      '/api/tasks/',
      '/api/tasks/download/csv',
      '/api/tasks/{filename}/image',
      '/api/tasks/{id}',
      '/api/tasks/{id}/assign',
      '/api/tasks/{id}/upload',
      '/api/users/update-password'
    ])
    assert.strictEqual(document.paths['/'], undefined)
  })

  it('answers the API root under the /api prefix only', async (t) => {
    const app = await build(t)

    const mounted = await app.injectWithLogin('basic@example.com', { method: 'GET', url: '/api' })
    const unmounted = await app.inject({ method: 'GET', url: '/tasks' })

    assert.strictEqual(mounted.statusCode, 200)
    assert.strictEqual(unmounted.statusCode, 404)
  })

  it('rejects an unknown method on a known path with the not-found envelope', async (t) => {
    const app = await build(t)

    const res = await app.inject({ method: 'POST', url: '/' })

    assert.strictEqual(res.statusCode, 404)
    assert.deepStrictEqual(res.json(), { message: 'Not Found' })
  })

  it('reports an unparseable JSON body without leaking the parser error', async (t) => {
    const app = await build(t)

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: '{"email":',
      headers: { 'content-type': 'application/json' }
    })

    assert.strictEqual(res.statusCode, 400)
    assert.deepStrictEqual(res.json(), {
      message: "Body is not valid JSON but content-type is set to 'application/json'"
    })
  })

  it('sends the authorization failure as plain text rather than JSON', async (t) => {
    const app = await build(t)

    const res = await app.injectWithLogin('basic@example.com', {
      method: 'POST',
      url: '/api/tasks/1/assign',
      payload: {}
    })

    assert.strictEqual(res.statusCode, 403)
    assert.strictEqual(res.headers['content-type'], 'text/plain; charset=utf-8')
    assert.strictEqual(res.payload, 'You are not authorized to access this resource.')
  })

  it('refuses a non-multipart upload before looking the task up', async (t) => {
    const app = await build(t)

    const res = await app.injectWithLogin('basic@example.com', {
      method: 'POST',
      url: '/api/tasks/100000/upload',
      payload: { not: 'multipart' }
    })

    assert.strictEqual(res.statusCode, 406)
    assert.deepStrictEqual(res.json(), { message: 'the request is not multipart' })
  })

  it('applies the security headers to every response', async (t) => {
    const app = await build(t)

    const res = await app.inject({ method: 'GET', url: '/' })

    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff')
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN')
    assert.strictEqual(res.headers['referrer-policy'], 'no-referrer')
    assert.strictEqual(res.headers['x-permitted-cross-domain-policies'], 'none')
    assert.strictEqual(res.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains')
    assert.strictEqual(res.headers['x-powered-by'], undefined)
  })

  it('publishes the remaining rate limit budget as a countdown in seconds', async (t) => {
    const app = await build(t)

    const first = await app.inject({ method: 'GET', url: '/' })
    const second = await app.inject({ method: 'GET', url: '/' })

    const limit = Number(first.headers['x-ratelimit-limit'])
    assert.strictEqual(limit, app.config.RATE_LIMIT_MAX)
    assert.strictEqual(Number(first.headers['x-ratelimit-remaining']), limit - 1)
    assert.strictEqual(Number(second.headers['x-ratelimit-remaining']), limit - 2)
    assert.ok(Number(first.headers['x-ratelimit-reset']) <= 60)
  })
})
