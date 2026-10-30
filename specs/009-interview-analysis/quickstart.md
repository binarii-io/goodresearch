# Quickstart: Analyze the interviews

## Prerequisites

- Dev stack: `docker compose -f compose.yaml -f compose.dev.yaml up --build -d` (`DRIVE_FAKE` and `AI_FAKE_PROVIDER` on).
- Sign in, connect the fake AI provider (Settings → AI), connect Drive, create an interview study, attach the demo folder.

The demo folder (`dev-drive.ts`) gains transcript content:

- "Interview Sam Example.txt" starts with a date and a participants line (Sam Example, Lee Example): rules only when the signed-in person is named Lee Example, else the AI tells the two apart.
- "Interview 2 - transcript.txt" has speaker labels that are not members and no date: the AI is called; the fake runner answers with the speakers, one quote found in the text and one that is not.
- "Camille.docx" is read as text in the simulated Drive; the `.docx` unzip path is covered by the adapter tests.
- "Sam Example consent.pdf" in the same group as Sam's interview: proposed as an attachment.

## Scenarios

1. **One row** (US1): on "Interview Sam Example", activate "Analyze".
   - Expected: the date from the header (2026-10-20), language English, interviewee Sam Example and interviewer Lee Example, and the name `2026-10-20 – Sam Example – Lee Example`.
   - Signed in as "Lee Example", the participants line is enough: no AI call, $0.00. Otherwise the AI tells the two apart and the row shows its cost.
2. **AI and quotes** (US1, SC-001): analyze "Interview 2".
   - Expected: the interviewee with its quote, and no proposal for the quote not in the text.
   - The row shows a cost; the ledger has one entry with `ref = session-analysis:<id>`.
3. **Accept all** (SC-002): open the dialog and choose "Accept all". The roster, date, language and title are updated. The files are renamed at once, with no window (the first time, after the editing consent): the fake Drive shows the new names, and a refresh keeps the interview and its files (SC-006).
4. **Run** (US2): "Analyze interviews".
   - The confirmation shows the count and the estimated cost; confirm.
   - The rows go waiting → done. Stopping a second run leaves the rows already analyzed as they are.
5. **Consent** (FR-011): the first analysis asks the confirmation; changing the AI provider asks again.
6. **Anonymisation** (US4): turn it on in the study settings. The name proposed for Sam becomes `… – P01 – …`. The request sent to the fake runner holds no known name (component test).
7. **Attachment** (US5): "Sam Example consent.pdf" is proposed; once added, it is renamed with the interview.

## Commands

- `pnpm exec vitest run --project api:unit`: rules (date, people, language, name, quotes, placeholders, pseudonyms).
- `pnpm test`: plus the Postgres component tests. They cover the ledger and cost sums, the worker run with stop, a concurrent edit during an analysis, and the rename keeping sessions.
- `pnpm e2e`: `fieldwork-analysis.spec.ts` (scenarios 1, 2, 4, 6, axe). Renaming is not run end to end: the simulated Drive is shared by every test of the dev stack; the Postgres component test covers it.
