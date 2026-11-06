# Quickstart: Cleaning review without duplicates, with steady buttons and context

1. `pnpm exec vitest run --project api:unit apps/api/src/modules/transcripts/tests/corrections.test.ts` — duplicates.
2. `pnpm exec vitest run --project api:unit apps/api/src/modules/transcripts/tests/` — the view leaves duplicates out; `around`.
3. Local stack: an interview where the lexicon and the AI propose the same change: one row; accept it, nothing left; the buttons stay off until the row changes; "Context" on a turn shows its neighbours.
