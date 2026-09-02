import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express'
import createError from 'http-errors'
import { createValidator, formatErrors, type Validate } from './validation.js'
import { serialize } from './serializer.js'
import type { RouteRegistry } from './openapi.js'

const ajv = createValidator()

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export interface RouteSchema {
  tags?: string[]
  consumes?: string[]
  body?: unknown
  querystring?: unknown
  params?: unknown
  response?: Record<number, unknown>
}

export interface RouteOptions {
  method: HttpMethod
  url: string
  schema?: RouteSchema
  onRequest?: RequestHandler | RequestHandler[]
  preHandler?: RequestHandler | RequestHandler[]
  handler: (request: Request, reply: Response) => unknown
}

export interface AppRouter {
  router: Router
  prefix: string
  registry: RouteRegistry
}

export function createRouter (prefix: string, registry: RouteRegistry): AppRouter {
  return { router: Router({ mergeParams: true }), prefix, registry }
}

let globalRateLimit: RequestHandler | null = null
let bodyParser: RequestHandler | null = null

/**
 * Installs the application wide rate limiter. The source framework hangs it off
 * every route as the route is registered, so a request that never reaches a
 * route -- an unknown URL, or one a hook refused before the route ran -- is
 * neither counted against the budget nor stamped with the x-ratelimit-* headers.
 */
export function setGlobalRateLimit (handler: RequestHandler | null): void {
  globalRateLimit = handler
}

/**
 * Installs the body parser. Parsing belongs to a route's own lifecycle in the
 * source framework: it happens after the route matched and after its onRequest
 * hooks, which is what makes an unparseable body count against the rate limit
 * while an unknown URL does not.
 */
export function setBodyParser (handler: RequestHandler | null): void {
  bodyParser = handler
}

function applyGlobalRateLimit (request: Request, reply: Response, next: NextFunction): void {
  if (globalRateLimit === null) {
    next()
    return
  }

  globalRateLimit(request, reply, next)
}

function applyBodyParser (request: Request, reply: Response, next: NextFunction): void {
  /* c8 ignore next 4 */
  if (bodyParser === null) {
    next()
    return
  }

  bodyParser(request, reply, next)
}

function compile (schema: unknown): Validate | null {
  if (schema === undefined || schema === null) {
    return null
  }

  return ajv.compile(schema as object)
}

/**
 * Validates the request against the schemas the route declares. Validation
 * rewrites what it inspects: values are coerced to the declared type, declared
 * defaults are filled in and undeclared members are dropped.
 */
function validationMiddleware (schema: RouteSchema | undefined): RequestHandler | null {
  if (schema === undefined) {
    return null
  }

  const validateParams = compile(schema.params)
  const validateBody = compile(schema.body)
  const validateQuery = compile(schema.querystring)

  if (validateParams === null && validateBody === null && validateQuery === null) {
    return null
  }

  return function validate (request: Request, _reply: Response, next: NextFunction): void {
    if (validateParams !== null && !validateParams(request.params)) {
      next(createError(400, formatErrors('params', validateParams.errors)))
      return
    }

    if (validateBody !== null && !validateBody(request.body)) {
      next(createError(400, formatErrors('body', validateBody.errors)))
      return
    }

    if (validateQuery !== null) {
      // `req.query` is a lazily parsed accessor, so the coerced result is
      // installed as an own property for the handler to read.
      const query: unknown = { ...request.query }

      if (!validateQuery(query)) {
        next(createError(400, formatErrors('querystring', validateQuery.errors)))
        return
      }

      Object.defineProperty(request, 'query', {
        value: query,
        configurable: true,
        writable: true,
        enumerable: true
      })
    }

    next()
  }
}

/** Writes the payload through the response schema declared for the status code. */
export function send (reply: Response, payload: unknown, response?: Record<number, unknown>): void {
  if (payload === undefined || reply.statusCode === 204 || reply.statusCode === 304) {
    reply.end()
    return
  }

  const schema = response?.[reply.statusCode]
  const body = serialize(schema, payload)

  reply.setHeader('content-type', 'application/json; charset=utf-8')
  reply.setHeader('content-length', Buffer.byteLength(body))
  reply.end(body)
}

function handlerMiddleware (options: RouteOptions): RequestHandler {
  const response = options.schema?.response

  return function invoke (request: Request, reply: Response, next: NextFunction): void {
    // A preHandler that already answered ends the lifecycle: the handler must
    // not run, so its side effects never happen behind an authorization refusal.
    if (reply.writableEnded || reply.headersSent) {
      return
    }

    Promise.resolve(options.handler(request, reply)).then(
      (payload) => {
        if (reply.writableEnded || reply.headersSent) {
          return
        }

        send(reply, payload, response)
      },
      next
    )
  }
}

function toArray (handlers: RequestHandler | RequestHandler[] | undefined): RequestHandler[] {
  if (handlers === undefined) {
    return []
  }

  return Array.isArray(handlers) ? handlers : [handlers]
}

export function route (target: AppRouter, options: RouteOptions): void {
  const chain: RequestHandler[] = []

  chain.push(applyGlobalRateLimit)
  chain.push(...toArray(options.onRequest))
  chain.push(applyBodyParser)

  const validate = validationMiddleware(options.schema)
  if (validate !== null) {
    chain.push(validate)
  }

  chain.push(...toArray(options.preHandler))
  chain.push(handlerMiddleware(options))

  target.router[options.method](options.url, ...chain)

  target.registry.add({
    method: options.method,
    path: `${target.prefix}${options.url}`,
    tags: options.schema?.tags,
    consumes: options.schema?.consumes,
    body: options.schema?.body,
    querystring: options.schema?.querystring,
    params: options.schema?.params,
    response: options.schema?.response
  })
}
