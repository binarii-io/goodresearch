# Quickstart: Interview verbatims and facts

## Prerequisites

- Dev stack with the fakes (`DRIVE_FAKE`, `AI_FAKE_PROVIDER`): `docker compose -f compose.yaml -f compose.dev.yaml up --build -d`.
- An interview study with the demo folder, the demo interviews validated in Fieldwork, a guide with two theme sections, and the fake AI provider connected.

The fake runner answers:
- `fact-verbatims`: per chunk, two valid verbatims of the interviewee, one not in the text, one in an interviewer's turn;
- `facts`: one fact citing both valid verbatims, one citing an unknown id only, one whose statement holds a known name;
- `fact-translation`: the statement prefixed with the target language.

## Scenarios

1. **Find facts** (US1, SC-001, SC-002): run on the study; confirm the estimate and the consent. Expected: per interview, 2 verbatims kept, 2 left out; 1 fact kept (both languages, a theme of the guide), 2 left out; costs on the tab and the row equal the ledger.
2. **Decide** (US2): open an interview; select a sentence of the interviewee → "Add verbatim" → new fact (theme, polarity, statement in French) → accepted, English shows "translating…" then the translation. Reject the AI fact; "Find facts again" → it is not proposed again (SC-008). Set a verbatim aside → gone and not found again.
3. **Speaker** : an interview with two interviewees and an unknown label → its verbatims show "speaker to attribute"; accepting a fact is refused until the label is attributed.
4. **Text analysed** (US3): set "Validated clean version only" → an interview never cleaned shows "Not clean yet"; the others "To analyse again".
5. **Text changed** (US4, SC-007): in Cleaning, accept a correction inside a verbatim's turn but outside its text → state unchanged, verbatim in place; reject a correction inside a verbatim → verbatim "text changed", interview "To analyse again".
6. **Facts view** (FR-018): filter by theme and polarity across two interviews; "Accept all shown".
7. **Exclusive runs**: start a cleaning, then "Find facts" → `ENRICHMENT_RUNNING`; and the reverse.

## Commands

- `pnpm exec vitest run --project api:unit`: domain (verbatim and fact checks, merge, re-proposal, re-anchoring, speaker role, state) and use cases with fakes.
- `pnpm test`: plus Postgres component tests (cascade with the session, run with stop and stale, exclusive runs, no known name in any AI request, costs = ledger, translation job).
- `pnpm e2e`: `analysis-facts.spec.ts` (scenarios 1, 2, 6), axe in light and dark themes.
