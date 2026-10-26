# Quickstart: Enrichment phase and team lexicon

## Prerequisites

- Dev stack: `docker compose -f compose.yaml -f compose.dev.yaml up --build -d` (`DRIVE_FAKE`, `AI_FAKE_PROVIDER` on).
- Sign in, connect the fake AI provider and Drive, create an interview study, attach the demo folder, validate the demo interviews in Fieldwork.

The demo transcripts (`dev-drive.ts`) gain words to find:

- "Goodresearch" in one, its misspellings "Gooresearch" and "good research" in two others;
- "NPS" in two interviews;
- a filler "Hmm" in all three;
- the interviewee's name, spoken in the text.

The fake runner answers lexicon requests from the candidates sent. It groups close spellings, returns one quote taken from an excerpt and one invented quote.

## Scenarios

1. **Tab** (FR-001, FR-002): the study shows `1 · Preparation`, `2 · Fieldwork`, `3 · Enrichment`, `4 · Analysis`. Enrichment lists the validated interviews as "Not read" and counts the others still to validate.
2. **Find terms** (US1):
   - The confirmation shows 3 interviews, the maximum cost and the consent. Confirm.
   - Expected: the rows go waiting → reading → "Terms to decide (X)".
   - "Goodresearch" is proposed with its two variants and a verified quote; "NPS" as an acronym.
   - The invented quote is dropped, and the interviewee's name is never proposed.
3. **Privacy** (SC-002): read with anonymisation off, then on (read all again). Either way, the requests recorded by the fake runner hold no known name (placeholders instead) and no full transcript (component test).
4. **Decide** (US2, SC-003):
   - Accept "Goodresearch", edit "NPS" (definition), reject "Hmm", merge a duplicate.
   - Read again (all): nothing decided comes back as proposed, and "Hmm" is not proposed.
5. **Costs** (FR-015, SC-004): the tab shows the last reading's cost and the total. The ledger entries carry `ref = lexicon-reading:<runId>` and add up to the total.
6. **Team** (US3, SC-007): in a second study of the same project's team, read its interviews. "Goodresearch" shows as accepted, with "other studies: 1"; a study of another team does not see it.
7. **Changed in Drive** (US4): change a demo transcript in the simulated Drive and refresh in Fieldwork. The row shows "Changed since"; reading it again re-imports it and keeps the ids of unchanged turns (SC-008, component test).

## Commands

- `pnpm exec vitest run --project api:unit`: segments and stable ids, candidates (common words, capitals, acronyms, close spellings, exclusions), excerpts, answer checks, term decisions and merge, occurrences.
- `pnpm test`: plus the Postgres component tests (cascade on session deletion, run with stop, cost sums across accounts, anonymised requests) and the shared match rule.
- `pnpm e2e`: `enrichment-lexicon.spec.ts` (scenarios 1, 2, 4, axe light and dark).
