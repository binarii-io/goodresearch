import { type ErrorCode, HTTP_STATUS, type Problem } from '@goodresearch/contracts'
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'

const problem = (code: ErrorCode, extra: Partial<Problem> = {}): Problem => ({
  type: `https://goodresearch.dev/errors/${code.toLowerCase().replaceAll('_', '-')}`,
  title: code,
  status: HTTP_STATUS[code],
  code,
  ...extra,
})

/** Sends a business error (from a command or query `Result`) as RFC 9457 problem details. */
export const sendError = (
  reply: FastifyReply,
  code: ErrorCode,
  detail?: Readonly<Record<string, unknown>>,
): FastifyReply =>
  reply
    .status(HTTP_STATUS[code])
    .type('application/problem+json')
    .send(problem(code, detail ? { detail } : {}))

export const registerErrorHandling = (app: FastifyInstance): void => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply
        .status(422)
        .type('application/problem+json')
        .send(
          problem('VALIDATION', {
            errors: error.validation.map((issue) => ({
              path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
              message: issue.message ?? 'invalid value',
            })),
          }),
        )
    }
    if (error.statusCode === 401) return sendError(reply, 'UNAUTHENTICATED')
    request.log.error({ err: error }, 'unhandled error')
    return reply
      .status(500)
      .type('application/problem+json')
      .send(problem('INTERNAL', { requestId: request.id }))
  })
}
