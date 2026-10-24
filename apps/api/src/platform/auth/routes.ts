import type { AuthProvider } from '@goodresearch/config'
import { fromNodeHeaders } from 'better-auth/node'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { type Auth, CLIENT_IP_HEADER } from './auth.ts'

const PublicConfig = z
  .object({
    providers: z.array(z.object({ id: z.string(), displayName: z.string() })),
    signInConfigured: z.boolean(),
  })
  .meta({ id: 'PublicConfig' })

/** Mounts the auth library (no official Fastify plugin) and the public sign-in configuration. */
export const registerAuthRoutes = (
  app: FastifyInstance,
  deps: { auth: Auth; appUrl: URL; providers: readonly AuthProvider[] },
): void => {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    schema: { hide: true },
    handler: async (request, reply) => {
      const headers = fromNodeHeaders(request.headers)
      // The client IP is resolved by Fastify (trustProxy); any value sent by the client is replaced.
      headers.set(CLIENT_IP_HEADER, request.ip)
      const response = await deps.auth.handler(
        new Request(new URL(request.url, deps.appUrl), {
          method: request.method,
          headers,
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        }),
      )
      reply.status(response.status)
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value)
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length > 0) reply.header('set-cookie', cookies)
      return reply.send(response.body ? await response.text() : null)
    },
  })

  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/public-config',
    {
      schema: {
        operationId: 'getPublicConfig',
        tags: ['public'],
        response: { 200: PublicConfig },
      },
    },
    async () => ({
      providers: deps.providers.map((p) => ({ id: p.key, displayName: p.displayName })),
      signInConfigured: deps.providers.length > 0,
    }),
  )
}
