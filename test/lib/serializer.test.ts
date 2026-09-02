import { describe, it } from 'node:test'
import assert from 'node:assert'
import { serialize } from '../../src/lib/serializer.js'

/**
 * The response serializer is the crux of the migration: Fastify rendered every
 * response through the route's response schema, and nothing in Express does
 * that. These cases pin the rules that are observable on the wire, so a future
 * change that swaps the serializer for `JSON.stringify` fails here instead of
 * silently leaking columns or reordering keys.
 */
describe('Response serializer', () => {
  it('should drop properties the schema does not declare', () => {
    const schema = {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id']
    }

    assert.strictEqual(serialize(schema, { id: 1, total: 4, filename: 'a.png' }), '{"id":1}')
  })

  it('should emit required properties first and optional ones last', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        assigned_user_id: { type: 'integer' },
        name: { type: 'string' }
      },
      required: ['id', 'name']
    }

    assert.strictEqual(
      serialize(schema, { assigned_user_id: 2, name: 'Task', id: 1 }),
      '{"id":1,"name":"Task","assigned_user_id":2}'
    )
  })

  it('should emit a null number as 0 and omit an undefined property', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        assigned_user_id: { type: 'integer' }
      },
      required: ['id']
    }

    assert.strictEqual(serialize(schema, { id: 1, assigned_user_id: null }), '{"id":1,"assigned_user_id":0}')
    assert.strictEqual(serialize(schema, { id: 1, assigned_user_id: undefined }), '{"id":1}')
  })

  it('should render a Date in a string position as an ISO-8601 timestamp', () => {
    const schema = { type: 'string' }

    assert.strictEqual(serialize(schema, new Date('2026-09-01T23:53:12.000Z')), '"2026-09-01T23:53:12.000Z"')
  })

  it('should render a null string as an empty string and coerce non-strings', () => {
    assert.strictEqual(serialize({ type: 'string' }, null), '""')
    assert.strictEqual(serialize({ type: 'string' }, 42), '"42"')
  })

  it('should render a non-finite number as 0', () => {
    assert.strictEqual(serialize({ type: 'number' }, Number.NaN), '0')
    assert.strictEqual(serialize({ type: 'number' }, '7'), '7')
  })

  it('should render booleans and nulls', () => {
    assert.strictEqual(serialize({ type: 'boolean' }, 1), 'true')
    assert.strictEqual(serialize({ type: 'boolean' }, null), 'false')
    assert.strictEqual(serialize({ type: 'null' }, null), 'null')
  })

  it('should serialize arrays through their item schema', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      }
    }

    assert.strictEqual(serialize(schema, [{ id: 1, leaked: true }, { id: 2 }]), '[{"id":1},{"id":2}]')
  })

  it('should fall back to plain JSON when the value does not match the schema type', () => {
    assert.strictEqual(serialize({ type: 'object', properties: {} }, 'not-an-object'), '"not-an-object"')
    assert.strictEqual(serialize({ type: 'array', items: {} }, 'not-an-array'), '"not-an-array"')
    assert.strictEqual(serialize({ type: 'object' }, { id: 1 }), '{}')
  })

  it('should pick the matching branch of an anyOf union', () => {
    const status = {
      anyOf: [
        { const: 'new', type: 'string' },
        { const: 'completed', type: 'string' }
      ]
    }

    assert.strictEqual(serialize(status, 'completed'), '"completed"')
    assert.strictEqual(serialize(status, 'unknown'), '"unknown"')

    const mixed = {
      anyOf: [
        { type: 'null' },
        { type: 'boolean' },
        { type: 'array', items: { type: 'integer' } },
        { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
        { type: 'number' },
        { type: 'string' }
      ]
    }

    assert.strictEqual(serialize(mixed, null), 'null')
    assert.strictEqual(serialize(mixed, true), 'true')
    assert.strictEqual(serialize(mixed, [1, 2]), '[1,2]')
    assert.strictEqual(serialize(mixed, { id: 3, leaked: 1 }), '{"id":3}')
    assert.strictEqual(serialize(mixed, 5), '5')
    assert.strictEqual(serialize(mixed, 'text'), '"text"')
  })

  it('should pass a value through untouched when the schema declares no type', () => {
    assert.strictEqual(serialize({ id: { type: 'number' } }, { id: 7 }), '{"id":7}')
    assert.strictEqual(serialize(undefined, { id: 7 }), '{"id":7}')
    assert.strictEqual(serialize({}, undefined), 'null')
  })
})
