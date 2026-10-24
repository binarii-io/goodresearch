import type { ErrorCode } from '@goodresearch/contracts'
import type { Result } from '@goodresearch/shared'
import type { FastifyReply } from 'fastify'
import { sendError } from './errors.ts'

/** Sends a command or query `Result`: business errors become problem details. */
export const reply = <T, E extends ErrorCode>(
  res: FastifyReply,
  result: Result<T, E>,
  onOk: (value: T) => FastifyReply,
): FastifyReply => (result.ok ? onOk(result.value) : sendError(res, result.error, result.detail))
