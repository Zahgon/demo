/**
 * OpenAPI document built from the schemas the routes already declare, so the
 * documentation cannot drift from the validation rules. Routes without a tag
 * are left out of the document.
 */

export interface DocumentedRoute {
  method: string
  path: string
  tags?: string[]
  consumes?: string[]
  body?: unknown
  querystring?: unknown
  params?: unknown
  response?: Record<number, unknown>
}

interface OpenApiOperation {
  tags?: string[]
  parameters?: unknown[]
  requestBody?: unknown
  responses: Record<string, unknown>
}

type JsonSchema = Record<string, unknown>

function isSchema (value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `/api/tasks/:id` is written `/api/tasks/{id}` in an OpenAPI document. */
function toOpenApiPath (path: string): string {
  return path.replace(/:([^/]+)/g, '{$1}')
}

function pathParameters (params: unknown): unknown[] {
  if (!isSchema(params) || !isSchema(params.properties)) {
    return []
  }

  return Object.entries(params.properties).map(([name, schema]) => ({
    schema: isSchema(schema) ? toDocumentedSchema(schema) : { type: 'string' },
    in: 'path',
    name,
    required: true
  }))
}

function queryParameters (querystring: unknown): unknown[] {
  if (!isSchema(querystring) || !isSchema(querystring.properties)) {
    return []
  }

  const required = Array.isArray(querystring.required) ? querystring.required : []

  return Object.entries(querystring.properties).map(([name, schema]) => ({
    schema: toDocumentedSchema(schema),
    in: 'query',
    name,
    required: required.includes(name)
  }))
}

/**
 * A schema literal is documented as a single-value enumeration, and a response
 * typed `null` carries no content at all: both are how the source framework
 * rendered them, and both are invisible to anything but a document diff.
 */
function toDocumentedSchema (schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map(toDocumentedSchema)
  }

  if (!isSchema(schema)) {
    return schema
  }

  const result: JsonSchema = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'const') {
      result.enum = [value]
      continue
    }

    result[key] = toDocumentedSchema(value)
  }

  return result
}

function responses (route: DocumentedRoute): Record<string, unknown> {
  const declared = route.response ?? {}
  const result: Record<string, unknown> = {}

  for (const [statusCode, schema] of Object.entries(declared)) {
    if (isSchema(schema) && schema.type === 'null') {
      result[statusCode] = { description: 'Default Response' }
      continue
    }

    result[statusCode] = {
      description: 'Default Response',
      content: {
        'application/json': { schema: toDocumentedSchema(schema) }
      }
    }
  }

  if (Object.keys(result).length === 0) {
    result['200'] = { description: 'Default Response' }
  }

  return result
}

export interface OpenApiInfo {
  title: string
  description: string
  version: string
}

export interface OpenApiOptions {
  hideUntagged?: boolean
  openapi: {
    info: OpenApiInfo
  }
}

export class RouteRegistry {
  private readonly routes: DocumentedRoute[] = []

  add (route: DocumentedRoute): void {
    this.routes.push(route)
  }

  document (options: OpenApiOptions): Record<string, unknown> {
    const paths: Record<string, Record<string, OpenApiOperation>> = {}

    for (const route of this.routes) {
      // Untagged routes stay out of the public documentation.
      if (options.hideUntagged === true && (route.tags === undefined || route.tags.length === 0)) {
        continue
      }

      const path = toOpenApiPath(route.path)
      const parameters = [...pathParameters(route.params), ...queryParameters(route.querystring)]

      let requestBody: unknown
      if (route.body !== undefined) {
        const contentTypes = route.consumes ?? ['application/json']
        const content: Record<string, unknown> = {}
        for (const contentType of contentTypes) {
          content[contentType] = { schema: toDocumentedSchema(route.body) }
        }
        requestBody = { required: true, content }
      }

      const operation: OpenApiOperation = {
        tags: route.tags,
        ...(requestBody !== undefined ? { requestBody } : {}),
        ...(parameters.length > 0 ? { parameters } : {}),
        responses: responses(route)
      }

      paths[path] = paths[path] ?? {}
      paths[path][route.method] = operation
    }

    return {
      openapi: '3.0.3',
      info: options.openapi.info,
      components: { schemas: {} },
      paths
    }
  }
}
