import { Ajv, type ErrorObject, type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'

/**
 * Request validation.
 *
 * A single Ajv instance is shared by every route. `coerceTypes: 'array'` turns
 * the strings carried by a query string or a path segment into the declared
 * type, `useDefaults` fills in the defaults the schemas declare, and
 * `removeAdditional: 'all'` drops anything the schema does not mention, which
 * is why an unknown query parameter is ignored rather than rejected.
 */
export function createValidator (): Ajv {
  const ajv = new Ajv({
    coerceTypes: 'array',
    useDefaults: true,
    removeAdditional: 'all',
    allErrors: false,
    addUsedSchema: false
  })

  addFormats.default(ajv)

  return ajv
}

/**
 * Renders Ajv errors the way the API reports them: the name of the validated
 * part of the request, the JSON pointer of the offending value and the Ajv
 * message, with several errors joined by a comma.
 */
export function formatErrors (dataVar: string, errors: ErrorObject[] | null | undefined): string {
  if (errors === null || errors === undefined) {
    return `${dataVar} is invalid`
  }

  return errors
    .map((error) => `${dataVar}${error.instancePath} ${error.message ?? 'is invalid'}`)
    .join(', ')
}

export type Validate = ValidateFunction<unknown>
