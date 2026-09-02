import helmet, { type HelmetOptions } from 'helmet'
import { type AppInstance } from '../../lib/instance.js'

export const autoConfig: HelmetOptions = {
  // Set plugin options here
}

/**
 * This plugins sets the security headers.
 *
 * @see {@link https://github.com/helmetjs/helmet}
 */
export default function helmetPlugin (app: AppInstance): void {
  app.use(helmet(autoConfig))
}
