import dotenv from 'dotenv'
import { type AppInstance } from '../../lib/instance.js'
import { createValidator, formatErrors } from '../../lib/validation.js'

declare global {
  namespace Express {
    interface Application {
      config: Env;
    }
  }
}

export interface Env {
  PORT: number;
  MYSQL_HOST: string;
  MYSQL_PORT: string;
  MYSQL_USER: string;
  MYSQL_PASSWORD: string;
  MYSQL_DATABASE: string;
  COOKIE_SECRET: string;
  COOKIE_NAME: string;
  COOKIE_SECURED: boolean;
  RATE_LIMIT_MAX: number;
  UPLOAD_DIRNAME: string;
  UPLOAD_TASKS_DIRNAME: string;
}

export const schema = {
  type: 'object',
  required: [
    'MYSQL_HOST',
    'MYSQL_PORT',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'MYSQL_DATABASE',
    'COOKIE_SECRET',
    'COOKIE_NAME',
    'COOKIE_SECURED'
  ],
  properties: {
    // Server
    PORT: {
      type: 'number',
      default: 3000
    },

    // Database
    MYSQL_HOST: {
      type: 'string',
      default: 'localhost'
    },
    MYSQL_PORT: {
      type: 'number',
      default: 3306
    },
    MYSQL_USER: {
      type: 'string'
    },
    MYSQL_PASSWORD: {
      type: 'string'
    },
    MYSQL_DATABASE: {
      type: 'string'
    },

    // Security
    COOKIE_SECRET: {
      type: 'string'
    },
    COOKIE_NAME: {
      type: 'string'
    },
    COOKIE_SECURED: {
      type: 'boolean',
      default: true
    },
    RATE_LIMIT_MAX: {
      type: 'number',
      default: 100 // Put it to 4 in your .env file for tests
    },

    // Files
    UPLOAD_DIRNAME: {
      type: 'string',
      minLength: 1,
      pattern: '^(?!.*\\.{2}).*$',
      default: 'uploads'
    },
    UPLOAD_TASKS_DIRNAME: {
      type: 'string',
      default: 'tasks'
    }
  }
}

export const autoConfig = {
  confKey: 'config',
  schema,
  dotenv: true,
  data: process.env
}

export function loadEnv (source: NodeJS.ProcessEnv = process.env, envSchema: object = schema): Env {
  const ajv = createValidator()
  const validate = ajv.compile(envSchema)
  const data: Record<string, unknown> = { ...source }

  if (!validate(data)) {
    throw new Error(formatErrors('env', validate.errors))
  }

  const config = {} as Record<string, unknown>
  for (const key of Object.keys((envSchema as { properties: object }).properties)) {
    config[key] = data[key]
  }

  return config as unknown as Env
}

export default function env (app: AppInstance): void {
  dotenv.config({ quiet: true })

  app.config = loadEnv()
}
