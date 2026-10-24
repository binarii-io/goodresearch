import type { AppConfig } from '@goodresearch/config'
import type { LoggerOptions } from 'pino'

/** Secrets and personal data never reach the logs (constitution VII). */
const REDACT = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.email',
  '*.secret',
  '*.clientSecret',
  '*.password',
  '*.token',
]

export const loggerOptions = (config: Pick<AppConfig, 'logLevel'>): LoggerOptions => ({
  level: config.logLevel,
  redact: { paths: REDACT, censor: '[redacted]' },
  ...(process.env.NODE_ENV === 'production'
    ? {}
    : { transport: { target: 'pino-pretty', options: { singleLine: true } } }),
})
