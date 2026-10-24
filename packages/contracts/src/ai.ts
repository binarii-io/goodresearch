import { z } from 'zod'
import { Timestamp } from './common.ts'

/** Providers a person can connect (spec 004); `fake` exists only in dev and test stacks. */
export const AiProvider = z
  .enum(['vertex', 'anthropic', 'openai', 'fake'])
  .meta({ id: 'AiProvider' })

/** Why a provider call or check failed (specs/004 research R4); the app holds the texts. */
export const AiFailure = z
  .enum([
    'INVALID_CREDENTIAL',
    'PERMISSION_DENIED',
    'NO_CREDIT_OR_QUOTA',
    'RATE_LIMITED',
    'MODEL_UNAVAILABLE',
    'API_DISABLED',
    'PROJECT_NOT_FOUND',
    'UNREACHABLE',
    'UNKNOWN',
  ])
  .meta({ id: 'AiFailure' })

export const AiProviderStatus = z.enum(['working', 'needs-attention'])

/** A person's connection, never with its credential. */
export const AiProviderView = z
  .object({
    provider: AiProvider,
    model: z.string(),
    status: AiProviderStatus,
    credentialHint: z.string().nullable(),
    googleAccount: z.string().nullable(),
    project: z.string().nullable(),
    region: z.string().nullable(),
    lastCheckedAt: Timestamp,
    lastFailure: AiFailure.nullable(),
  })
  .meta({ id: 'AiProviderView' })

export const AiProviderPage = z
  .object({
    offered: z.array(AiProvider),
    regions: z.array(z.string()),
    googleGranted: z.boolean(),
    connection: AiProviderView.nullable(),
    usage: z.object({
      calls: z.number().int(),
      inputTokens: z.number().int(),
      outputTokens: z.number().int(),
    }),
  })
  .meta({ id: 'AiProviderPage' })

/** Keys are trimmed; their shape is the provider's business, checked by a real call. */
export const ConnectApiKey = z
  .object({
    provider: z.enum(['anthropic', 'openai', 'fake']),
    apiKey: z.string().trim().min(8).max(500),
  })
  .meta({ id: 'ConnectApiKey' })

export const StartGoogleGrant = z
  .object({ returnTo: z.string().max(2000) })
  .meta({ id: 'StartGoogleGrant' })

export const VertexCheckRequest = z
  .object({ project: z.string().trim().max(100), region: z.string().max(50) })
  .meta({ id: 'VertexCheckRequest' })

export const VertexCheck = z
  .object({
    key: z.enum(['format', 'api', 'permission', 'call']),
    status: z.enum(['ok', 'error', 'skipped', 'unknown']),
    failure: AiFailure.nullable(),
  })
  .meta({ id: 'VertexCheck' })

export const VertexCheckResult = z
  .object({
    checks: z.array(VertexCheck),
    saved: z.boolean(),
    connection: AiProviderView.nullable(),
  })
  .meta({ id: 'VertexCheckResult' })

export const ProviderTestResult = z
  .object({ ok: z.boolean(), failure: AiFailure.nullable() })
  .meta({ id: 'ProviderTestResult' })
