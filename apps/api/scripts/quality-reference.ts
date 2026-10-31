// Spec 016 research R9: measures on a real provider whether the AI tells a simple reformulation from
// a reformulation with opinion. By hand, since it costs money; never in CI.
//   QUALITY_REFERENCE_ACCOUNT=<account id> pnpm --filter @goodresearch/api quality:reference
// Goes through the AI Gateway with that account's own connection, so it is in the usage ledger.
import { loadConfig } from '@goodresearch/config'
import { composeModules } from '../src/compose.ts'
import { createQualityAi } from '../src/modules/interview-quality/index.ts'
import { SIMPLE, WITH_OPINION } from '../src/modules/interview-quality/tests/reference/excerpts.ts'
import {
  meetsTargets,
  REFERENCE_REF,
  runReference,
} from '../src/modules/interview-quality/tests/reference/run.ts'
import { createDb } from '../src/platform/db.ts'

const accountId = process.env.QUALITY_REFERENCE_ACCOUNT
if (!accountId)
  throw new Error('Set QUALITY_REFERENCE_ACCOUNT to the id of an account with an AI provider.')

const config = loadConfig(process.env)
const { db } = createDb(config.databaseUrl, config.databasePoolMax)
const modules = composeModules(config, { db, isReady: async () => true })
const ai = createQualityAi({
  gateway: () => modules.ai.gateway,
  estimateCost: (...args) => modules.ai.estimateCost(...args),
  studyCosts: (refs) => modules.ai.studyCosts(refs),
})

const result = await runReference(ai.review, accountId, {
  simple: SIMPLE,
  withOpinion: WITH_OPINION,
})
const cost = (await ai.costs([REFERENCE_REF])).get(REFERENCE_REF) ?? null
const found = result.opinionTotal - result.opinionMissed.length

console.log(
  `Simple reformulations flagged: ${result.simpleFlagged.length} of ${result.simpleTotal}`,
)
for (const sentence of result.simpleFlagged) console.log(`  ${sentence}`)
console.log(`Reformulations with opinion found: ${found} of ${result.opinionTotal}`)
for (const sentence of result.opinionMissed) console.log(`  missed: ${sentence}`)
console.log(
  `Ledger cost so far under "${REFERENCE_REF}": ${cost ?? 'unknown'}, ${result.calls} calls`,
)
console.log(meetsTargets(result) ? 'Targets met.' : 'Targets NOT met.')
process.exit(0)
