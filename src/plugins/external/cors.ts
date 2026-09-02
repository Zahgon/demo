import cors, { type CorsOptions } from 'cors'
import { type AppInstance } from '../../lib/instance.js'

export const autoConfig: CorsOptions = {
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}

/**
 * This plugins enables the use of CORS.
 *
 * @see {@link https://github.com/expressjs/cors}
 */
export default function corsPlugin (app: AppInstance): void {
  app.use(cors({
    ...autoConfig,
    // `cors` joins the array without spaces; the demo advertises the
    // methods separated by ", ".
    methods: (autoConfig.methods as string[]).join(', ')
  }))
}
