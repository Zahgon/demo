import { type Request, type RequestHandler } from 'express'
import swaggerUi from 'swagger-ui-express'
import { type AppInstance } from '../../lib/instance.js'

export const autoConfig = {
  hideUntagged: true,
  openapi: {
    info: {
      title: 'Fastify demo API',
      description: 'The official Fastify demo API',
      version: '0.0.0'
    }
  }
}

export const routePrefix = '/api/docs'
export const staticPrefix = '/static'

/**
 * The user interface shell. It is written out here rather than taken from the
 * asset package because the source shell is generated the same way: a template
 * whose only variable is the prefix the assets are served under, which is
 * relative when the URL carries a trailing slash and absolute when it does not.
 */
function indexHtml (url: string): string {
  const prefix = /\/$/.test(url) ? `.${staticPrefix}` : `${routePrefix}${staticPrefix}`

  return `<!-- HTML for static distribution bundle build -->
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="UTF-8">
      <title>Swagger UI</title>
      <link rel="stylesheet" type="text/css" href="${prefix}/swagger-ui.css" />
      <link rel="stylesheet" type="text/css" href="${prefix}/index.css" />
      
      
      <link rel="icon" type="image/png" href="${prefix}/favicon-32x32.png" sizes="32x32" />
      <link rel="icon" type="image/png" href="${prefix}/favicon-16x16.png" sizes="16x16" />
      
      </head>

      <body>
      <div id="swagger-ui"></div>
      <script src="${prefix}/swagger-ui-bundle.js" charset="UTF-8"> </script>
      <script src="${prefix}/swagger-ui-standalone-preset.js" charset="UTF-8"> </script>
      <script src="${prefix}/swagger-initializer.js" charset="UTF-8"> </script>
      
      </body>
      </html>
      `
}

/**
 * The bootstrap the shell loads last. It resolves the document and the OAuth
 * redirect relative to the page, so the interface keeps working whichever of
 * `/api/docs` and `/api/docs/` was asked for.
 */
const swaggerInitializer = `window.onload = function () {
    function resolveUrl(url) {
      let currentHref = window.location.href;
      currentHref = currentHref.split('#', 1)[0];
      currentHref = currentHref.endsWith('/') ? currentHref : currentHref + '/';
      const anchor = document.createElement('a');
      anchor.href = currentHref + url;
      return anchor.href
    }

    const ui = SwaggerUIBundle({
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIStandalonePreset
      ],
      plugins: [
        SwaggerUIBundle.plugins.DownloadUrl
      ],
      layout: "StandaloneLayout",
      validatorUrl: null,
      url: resolveUrl('./json'),
      oauth2RedirectUrl: resolveUrl('./static/oauth2-redirect.html')
    })

    ui.initOAuth({})
  }`

/**
 * Serve an OpenAPI specification and its user interface
 *
 * @see {@link https://spec.openapis.org/oas/v3.0.3}
 * @see {@link https://github.com/scottie1984/swagger-ui-express}
 */
export default function swagger (app: AppInstance): void {
  app.get(`${routePrefix}/json`, app.rateLimitGlobal, (_request, reply) => {
    const payload = JSON.stringify(app.routeRegistry.document(autoConfig))
    reply.statusCode = 200
    reply.setHeader('content-type', 'application/json; charset=utf-8')
    reply.setHeader('content-length', Buffer.byteLength(payload))
    reply.end(payload)
  })

  const renderUi: RequestHandler = (request: Request, reply) => {
    const payload = indexHtml(request.originalUrl.split('?', 1)[0])
    reply.statusCode = 200
    reply.setHeader('content-type', 'text/html; charset=utf-8')
    reply.setHeader('content-length', Buffer.byteLength(payload))
    reply.end(payload)
  }

  // Declared ahead of the asset directory so that the generated bootstrap wins
  // over the placeholder one the asset package ships.
  app.get(`${routePrefix}${staticPrefix}/swagger-initializer.js`, app.rateLimitGlobal, (_request, reply) => {
    reply.statusCode = 200
    reply.setHeader('content-type', 'application/javascript; charset=utf-8')
    reply.setHeader('content-length', Buffer.byteLength(swaggerInitializer))
    reply.end(swaggerInitializer)
  })

  app.use(`${routePrefix}${staticPrefix}`, app.rateLimitGlobal, swaggerUi.serve)

  // Answer the prefix itself rather than redirecting to its trailing-slash form.
  app.get(routePrefix, app.rateLimitGlobal, renderUi)
}
