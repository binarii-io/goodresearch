import {
  BulkDecision,
  BulkResult,
  DecideTerm,
  Enrichment,
  EstimateQuery,
  JudgeOccurrence,
  LexiconEstimate,
  LexiconPage,
  LexiconQuery,
  LexiconRunParams,
  LexiconRunStarted,
  LexiconTerm,
  MergeTerms,
  StartLexiconRun,
  StudyParams,
  TermOccurrences,
  TermParams,
} from '@goodresearch/contracts'
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { reply } from '#platform/http/result.ts'
import type { CleaningCommands } from '../application/commands/cleaning-commands.ts'
import type { LexiconCommands } from '../application/commands/lexicon-commands.ts'
import type { CleaningQueries } from '../application/queries/cleaning-queries.ts'
import type { EnrichmentQueries } from '../application/queries/enrichment-queries.ts'
import type { LexiconTerm as Term } from '../domain/lexicon-term.ts'
import { registerCleaningRoutes } from './cleaning.routes.ts'

export type TranscriptsHandlers = {
  readonly lexicon: LexiconCommands
  readonly queries: EnrichmentQueries
  readonly cleaning: CleaningCommands
  readonly cleaningQueries: CleaningQueries
}

/** Spec 010 routes: the Enrichment tab, the lexicon readings and the decisions on terms. */
export const registerTranscriptsRoutes = (
  app: FastifyInstance,
  deps: { guard: preHandlerAsyncHookHandler; handlers: TranscriptsHandlers },
): void => {
  const { lexicon, queries } = deps.handlers
  registerCleaningRoutes(app, {
    guard: deps.guard,
    cleaning: deps.handlers.cleaning,
    queries: deps.handlers.cleaningQueries,
  })
  const api = app.withTypeProvider<ZodTypeProvider>()
  const secured = { preHandler: deps.guard }
  const tags = ['enrichment']

  /** A term as the lexicon shows it after a decision: read again from the study's page. */
  const termView = async (accountId: string, studyId: string, term: Term) => {
    const page = await queries.lexicon(accountId, studyId, { status: 'all', q: term.form })
    const found = page.ok ? page.value.terms.find((t) => t.id === term.id) : undefined
    return (
      found ?? {
        ...term,
        variants: [...term.variants],
        occurrences: [],
        otherStudies: 0,
        decidedBy: null,
        decidedAt: term.decidedAt ? term.decidedAt.toISOString() : null,
      }
    )
  }

  api.get(
    '/api/studies/:studyId/enrichment',
    {
      ...secured,
      schema: {
        operationId: 'getEnrichment',
        tags,
        params: StudyParams,
        response: { 200: Enrichment },
      },
    },
    async (request, res) =>
      reply(res, await queries.enrichment(request.account.id, request.params.studyId), (v) =>
        res.send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/lexicon',
    {
      ...secured,
      schema: {
        operationId: 'listLexicon',
        tags,
        params: StudyParams,
        querystring: LexiconQuery,
        response: { 200: LexiconPage },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.lexicon(request.account.id, request.params.studyId, request.query),
        (v) => res.send(v),
      ),
  )

  api.get(
    '/api/studies/:studyId/lexicon-runs/estimate',
    {
      ...secured,
      schema: {
        operationId: 'estimateLexiconRun',
        tags,
        params: StudyParams,
        querystring: EstimateQuery,
        response: { 200: LexiconEstimate },
      },
    },
    async (request, res) =>
      reply(
        res,
        await lexicon.estimate(
          request.account.id,
          request.params.studyId,
          request.query.all === 'true',
        ),
        (v) => res.send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/lexicon-runs',
    {
      ...secured,
      schema: {
        operationId: 'startLexiconRun',
        tags,
        params: StudyParams,
        body: StartLexiconRun,
        response: { 202: LexiconRunStarted },
      },
    },
    async (request, res) =>
      reply(
        res,
        await lexicon.startRun(request.account, request.params.studyId, request.body),
        (v) => res.status(202).send(v),
      ),
  )

  api.post(
    '/api/studies/:studyId/lexicon-runs/:runId/stop',
    { ...secured, schema: { operationId: 'stopLexiconRun', tags, params: LexiconRunParams } },
    async (request, res) =>
      reply(
        res,
        await lexicon.stopRun(request.account, request.params.studyId, request.params.runId),
        () => res.status(204).send(),
      ),
  )

  api.get(
    '/api/studies/:studyId/lexicon/terms/:termId/occurrences',
    {
      ...secured,
      schema: {
        operationId: 'listTermOccurrences',
        tags,
        params: TermParams,
        response: { 200: TermOccurrences },
      },
    },
    async (request, res) =>
      reply(
        res,
        await queries.occurrences(
          request.account.id,
          request.params.studyId,
          request.params.termId,
        ),
        (v) => res.send(v),
      ),
  )

  api.put(
    '/api/studies/:studyId/lexicon/terms/:termId/verdicts',
    {
      ...secured,
      schema: { operationId: 'judgeOccurrence', tags, params: TermParams, body: JudgeOccurrence },
    },
    async (request, res) => {
      const { studyId, termId } = request.params
      const { verdict, ...place } = request.body
      return reply(res, await lexicon.judge(request.account, studyId, termId, place, verdict), () =>
        res.status(204).send(),
      )
    },
  )

  api.patch(
    '/api/studies/:studyId/lexicon/terms/:termId',
    {
      ...secured,
      schema: {
        operationId: 'decideTerm',
        tags,
        params: TermParams,
        body: DecideTerm,
        response: { 200: LexiconTerm },
      },
    },
    async (request, res) => {
      const { studyId, termId } = request.params
      const { version, ...decision } = request.body
      const done = await lexicon.decide(request.account, studyId, termId, version, decision)
      if (!done.ok) return reply(res, done, () => res)
      return res.send(await termView(request.account.id, studyId, done.value))
    },
  )

  api.post(
    '/api/studies/:studyId/lexicon/terms/:termId/merge',
    {
      ...secured,
      schema: {
        operationId: 'mergeTerms',
        tags,
        params: TermParams,
        body: MergeTerms,
        response: { 200: LexiconTerm },
      },
    },
    async (request, res) => {
      const { studyId, termId } = request.params
      const done = await lexicon.merge(
        request.account,
        studyId,
        termId,
        request.body.version,
        request.body.into,
      )
      if (!done.ok) return reply(res, done, () => res)
      return res.send(await termView(request.account.id, studyId, done.value))
    },
  )

  api.post(
    '/api/studies/:studyId/lexicon/decisions',
    {
      ...secured,
      schema: {
        operationId: 'decideTerms',
        tags,
        params: StudyParams,
        body: BulkDecision,
        response: { 200: BulkResult },
      },
    },
    async (request, res) =>
      reply(
        res,
        await lexicon.decideMany(
          request.account,
          request.params.studyId,
          request.body.decision,
          request.body.terms,
        ),
        (v) => res.send(v),
      ),
  )
}
