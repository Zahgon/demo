import assert from 'node:assert'
import http from 'node:http'
import { once } from 'node:events'
import { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { TestContext } from 'node:test'
import pino from 'pino'
import serviceApp from '../src/app.js'
import { AppInstance, createInstance } from '../src/lib/instance.js'

declare global {
  namespace Express {
    interface Application {
      login: typeof login;
      injectWithLogin: typeof injectWithLogin;
      inject: typeof inject;
    }
  }
}

export interface InjectOptions {
  method?: string;
  url: string;
  query?: Record<string, string>;
  payload?: unknown;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

export interface InjectCookie {
  name: string;
  value: string;
}

export interface InjectResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  rawPayload: Buffer;
  payload: string;
  body: string;
  cookies: InjectCookie[];
  json: <T = unknown>() => T;
}

// Fill in this config with all the configurations
// needed for testing the application
export function config () {
  return {
    skipOverride: true // Register our application with fastify-plugin
  }
}

export function expectValidationError (res: InjectResponse, expectedMessage: string) {
  assert.strictEqual(res.statusCode, 400)
  const { message } = JSON.parse(res.payload)
  assert.strictEqual(message, expectedMessage)
}

function parseSetCookie (values: string[]): InjectCookie[] {
  return values.map((value) => {
    const [pair] = value.split(';')
    const index = pair.indexOf('=')

    return {
      name: pair.slice(0, index).trim(),
      value: decodeURIComponent(pair.slice(index + 1).trim())
    }
  })
}

function isStream (payload: unknown): payload is Readable {
  return typeof payload === 'object' && payload !== null && typeof (payload as Readable).pipe === 'function'
}

/**
 * Drives the packaged application over a real socket so every assertion sees
 * the bytes the server actually writes, not an in-process representation.
 */
export async function inject (this: AppInstance, opts: InjectOptions): Promise<InjectResponse> {
  const address = this.server.address() as AddressInfo
  const headers: Record<string, string> = { ...opts.headers }

  if (opts.cookies) {
    headers.cookie = Object.entries(opts.cookies)
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join('; ')
  }

  let payload = opts.payload

  if (payload !== undefined && !isStream(payload) && !Buffer.isBuffer(payload) && typeof payload !== 'string') {
    payload = JSON.stringify(payload)
    headers['content-type'] = headers['content-type'] ?? 'application/json'
  }

  let path = opts.url

  if (opts.query) {
    const search = new URLSearchParams(opts.query).toString()
    path += (path.includes('?') ? '&' : '?') + search
  }

  const request = http.request({
    host: address.address,
    port: address.port,
    method: opts.method ?? 'GET',
    path,
    headers
  })

  if (isStream(payload)) {
    payload.pipe(request)
  } else {
    request.end(payload as string | Buffer | undefined)
  }

  const [response] = await once(request, 'response') as [http.IncomingMessage]
  const chunks: Buffer[] = []

  for await (const chunk of response) {
    chunks.push(chunk as Buffer)
  }

  const rawPayload = Buffer.concat(chunks)
  const body = rawPayload.toString()

  return {
    statusCode: response.statusCode as number,
    headers: response.headers,
    rawPayload,
    payload: body,
    body,
    cookies: parseSetCookie(response.headers['set-cookie'] ?? []),
    json: <T = unknown>() => JSON.parse(body) as T
  }
}

async function login (this: AppInstance, email: string) {
  const res = await this.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      email,
      password: 'Password123$'
    }
  })

  const cookie = res.cookies.find(
    (c) => c.name === this.config.COOKIE_NAME
  )

  if (!cookie) {
    throw new Error('Failed to retrieve session cookie.')
  }

  return cookie.value
}

async function injectWithLogin (
  this: AppInstance,
  email: string,
  opts: InjectOptions
) {
  const cookieValue = await this.login(email)

  opts.cookies = {
    ...opts.cookies,
    [this.config.COOKIE_NAME]: cookieValue
  }

  return this.inject({
    ...opts
  })
}

// automatically build and tear down our instance
export async function build (t?: TestContext) {
  const app = createInstance(pino({ level: process.env.LOG_LEVEL ?? 'silent' }))

  await serviceApp(app, config())

  // Listen on an ephemeral port so assertions run against the real server
  const server = app.listen(0)
  await once(server, 'listening')
  app.server = server

  // This is after start, so we can't decorate the instance using `.decorate`
  app.login = login
  app.injectWithLogin = injectWithLogin
  app.inject = inject

  // If we pass the test contest, it will close the app after we are done
  if (t) {
    t.after(() => app.close())
  }

  return app
}
