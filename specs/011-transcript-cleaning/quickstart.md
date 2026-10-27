# Quickstart: Transcript cleaning

## Prerequisites

- Start the dev stack: `docker compose -f compose.yaml -f compose.dev.yaml up --build -d`. The fakes are on: `DRIVE_FAKE` and `AI_FAKE_PROVIDER`.
- Set up the study:
  1. Sign in, then connect the fake AI provider and Drive (with write access).
  2. Create an interview study and attach the demo folder.
  3. Validate the demo interviews in Fieldwork.
- Prepare the lexicon:
  1. In Enrichment, run "Find terms".
  2. Accept "Goodresearch" with the scope *everywhere*.
  3. Accept "NPS" with the scope *case by case*, and give one verdict *no*.

The demo transcripts (`dev-drive.ts`) already hold:
- the misspellings of "Goodresearch";
- "NPS" twice;
- the interviewee's name.

They gain one misheard word, "eating", in a sentence about a meeting.

The fake runner answers `cleaning` requests. For each chunk it returns:
- one valid transcription correction ("eating → meeting");
- a yes decision for each case-by-case occurrence;
- one correction whose original is not in the turn;
- one correction that changes 12 words.

## Scenarios

1. **Lexicon only** (US1, SC-001):
   - Clean with "lexicon only".
   - The confirmation shows a cost of 0, and no consent is asked.
   - Expected:
     - every "Gooresearch" / "good research" becomes "Goodresearch", accepted;
     - "NPS" with the verdict *no* gives no correction;
     - no AI call is recorded in the ledger.
2. **AI pass** (US1, FR-006, SC-002):
   - Clean with the AI. The confirmation shows the interviews, the chunks, the cost and the consent (full text, names replaced). Confirm.
   - Expected:
     - the rows go waiting → cleaning (chunk X of Y) → "Corrections to decide (X)";
     - "eating → meeting" is proposed with its reason and confidence;
     - the remaining "NPS" place gets a proposed ai-lexicon correction;
     - the two invalid corrections are dropped and counted in "left out".
3. **Review** (US2, FR-010):
   - Open the interview.
   - Undo one "Goodresearch" correction. Expected: the lexicon shows the verdict *no* on that occurrence.
   - Accept the "NPS" correction. Expected: its verdict is *yes*.
   - Edit one AI correction, reject another, then "Accept all shown".
   - Validate. Expected: the clean version 1 holds exactly the accepted and edited corrections, and the raw version is unchanged.
4. **Lexicon changed** (US5, FR-014):
   - In the lexicon, change "Goodresearch" back to case by case.
   - Expected: the interview shows "Lexicon changed" and its corrections follow, with no AI call.
   - Validate again. Expected: clean version 2.
5. **Anonymisation** (US3, SC-003):
   - Turn anonymisation on.
   - Expected: the clean interviews show "To clean again".
   - Open one. Expected:
     - the interviewee's name and speaker label become "P01", accepted;
     - the interviewer's become "Interviewer 1".
   - Validate. Expected: the clean version holds no known interviewee name.
6. **Publish** (US4, SC-008):
   - Publish to Drive.
   - Expected:
     - the fake Drive holds the subfolder "Clean transcripts" with one document matching the clean version;
     - the original file's revision did not move.
   - Validate a new version, then publish again.
   - Expected: the same document is updated, still one file.
   - Edit the document in the fake Drive, then publish. Expected: "Changed in Drive"; overwrite or cancel.
7. **Changed in Drive** (FR-013, SC-007):
   - Change one turn of the raw transcript in the fake Drive.
   - Run "Clean transcripts".
   - Expected:
     - only the chunk holding the changed turn is sent;
     - decisions on the other turns are kept;
     - the row showed "To clean again" before the run.
8. **Costs** (FR-016, SC-004): the Enrichment tab shows the last cleaning cost and the total. The ledger entries carry `ref = cleaning:<runId>` and add up to the total.

## Commands

- `pnpm exec vitest run --project api:unit`: tests of the domain functions and the use cases with fakes.
  - Domain: lexicon corrections (scopes, verdicts, suspect), name corrections (pseudonyms, interviewer labels, speaker labels), overlap priority, apply and offset maps, chunks, AI correction checks, inheritance, states, fingerprint.
  - Use cases with fakes.
- `pnpm test`: adds the Postgres component tests:
  - cascade when a session is deleted;
  - a run with stop and stale;
  - no lexicon reading while a cleaning runs;
  - a decision on a `lex:` key writes the verdict;
  - cost sums across accounts;
  - no known name in any AI request (recording runner);
  - re-import keeps decisions.
- `pnpm e2e`: `enrichment-cleaning.spec.ts` (scenarios 1, 2, 3, 6), with axe in light and dark themes.
