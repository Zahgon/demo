/**
 * Schema-driven response serialization.
 *
 * Routes declare a response schema per status code. The payload returned by a
 * handler is rendered through that schema instead of being passed to
 * `JSON.stringify` directly, so that a route never leaks a column the schema
 * does not declare and always emits the same shape for the same schema.
 *
 * The rules below are observable on the wire and are therefore part of the
 * contract, not implementation details:
 *
 *   - properties absent from the schema are dropped;
 *   - declared required properties are emitted first, in declaration order,
 *     followed by the optional ones, also in declaration order;
 *   - a numeric property whose value is `null` is emitted as `0`;
 *   - a property whose value is `undefined` is omitted entirely;
 *   - a `Date` in a string position is emitted as an ISO-8601 timestamp;
 *   - a schema that declares no type is passed through untouched.
 */

type JsonSchema = Record<string, unknown>

function isSchema (value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Required properties keep their declaration order and come first; optional
 * ones follow, also in declaration order.
 */
function orderedKeys (schema: JsonSchema): string[] {
  const properties = schema.properties
  if (!isSchema(properties)) {
    return []
  }

  const required = Array.isArray(schema.required) ? schema.required : []
  const keys = Object.keys(properties)

  return [
    ...keys.filter((key) => required.includes(key)),
    ...keys.filter((key) => !required.includes(key))
  ]
}

function passthrough (value: unknown): string {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? 'null' : serialized
}

/**
 * Picks the branch of an `anyOf` that the value belongs to. Literal unions are
 * matched on their constant, everything else on its JSON type.
 */
function selectBranch (branches: unknown[], value: unknown): unknown {
  return branches.find((branch) => {
    if (!isSchema(branch)) {
      return false
    }

    if (branch.const !== undefined) {
      return branch.const === value
    }

    switch (branch.type) {
      case 'string':
        return typeof value === 'string'
      case 'integer':
      case 'number':
        return typeof value === 'number'
      case 'boolean':
        return typeof value === 'boolean'
      case 'null':
        return value === null
      case 'array':
        return Array.isArray(value)
      case 'object':
        return isRecord(value)
      default:
        return true
    }
  })
}

function serializeString (value: unknown): string {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString())
  }

  if (value === null || value === undefined) {
    return '""'
  }

  return JSON.stringify(String(value))
}

function serializeNumber (value: unknown): string {
  if (value === null || value === undefined) {
    return '0'
  }

  const asNumber = Number(value)
  return Number.isFinite(asNumber) ? String(asNumber) : '0'
}

function serializeObject (schema: JsonSchema, value: unknown): string {
  if (!isRecord(value)) {
    return passthrough(value)
  }

  const properties = schema.properties
  if (!isSchema(properties)) {
    return '{}'
  }

  const members: string[] = []

  for (const key of orderedKeys(schema)) {
    const propertyValue = (value as Record<string, unknown>)[key]

    if (propertyValue === undefined) {
      continue
    }

    members.push(`${JSON.stringify(key)}:${serialize(properties[key], propertyValue)}`)
  }

  return `{${members.join(',')}}`
}

function serializeArray (schema: JsonSchema, value: unknown): string {
  if (!Array.isArray(value)) {
    return passthrough(value)
  }

  return `[${value.map((item) => serialize(schema.items, item)).join(',')}]`
}

export function serialize (schema: unknown, value: unknown): string {
  if (!isSchema(schema)) {
    return passthrough(value)
  }

  if (Array.isArray(schema.anyOf)) {
    const branch = selectBranch(schema.anyOf, value)
    return branch === undefined ? passthrough(value) : serialize(branch, value)
  }

  switch (schema.type) {
    case 'object':
      return serializeObject(schema, value)
    case 'array':
      return serializeArray(schema, value)
    case 'string':
      return serializeString(value)
    case 'integer':
    case 'number':
      return serializeNumber(value)
    case 'boolean':
      return String(value === null || value === undefined ? false : Boolean(value))
    case 'null':
      return 'null'
    default:
      return passthrough(value)
  }
}
