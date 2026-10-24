import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'
import type { LoggerOptions } from 'pino'
import { registerErrorHandling, sendError } from './errors.ts'

const WEB_DIST = fileURLToPath(new URL('../../../../web/dist', import.meta.url))

export type AppOptions = {
  readonly logger: LoggerOptions | false
  readonly trustProxy: readonly string[]
  readonly isReady: () => Promise<boolean>
  /** Registers public routes (auth) and protected routes (modules). */
  readonly register: (app: FastifyInstance) => void
}

export const buildApp = async (options: AppOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: options.logger,
    trustProxy: options.trustProxy.length > 0 ? [...options.trustProxy] : false,
    genReqId: () => crypto.randomUUID(),
  })
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandling(app)

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'goodresearch API', version: '0.1.0', license: { name: 'AGPL-3.0-only' } },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  })

  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok' }))
  app.get('/ready', { schema: { hide: true } }, async (_request, reply) =>
    (await options.isReady())
      ? { status: 'ready' }
      : reply.status(503).send({ status: 'not ready' }),
  )
  app.get('/api/openapi.json', { schema: { hide: true } }, async () => app.swagger())

  options.register(app)

  // The built SPA is served from the same origin; unknown non-API GETs fall back to index.html.
  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, {
      root: WEB_DIST,
      wildcard: false,
      setHeaders: (res, path) => {
        res.header(
          'cache-control',
          path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        )
      },
    })
  }

  // Unknown API paths get problem details; other GETs fall back to the SPA when it is built.
  const spa = existsSync(WEB_DIST)
  app.setNotFoundHandler((request, reply) => {
    if (spa && request.method === 'GET' && !request.url.startsWith('/api/')) {
      return reply.sendFile('index.html')
    }
    return sendError(reply, 'NOT_FOUND', { path: request.url })
  })

  return app
}
