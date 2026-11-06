# Research: Fast study pages on large studies

## Measurements

`apps/api/tests/study-pages-volume.component.test.ts`: a made-up study on PostgreSQL (57 validated interviews of 251 turns, 438 terms with their occurrences, anonymised), each query delayed by 3 ms as a network round trip, pool of 10 connections, on a laptop.

| Page | Queries | Time | Size |
|---|---|---|---|
| `GET /quality` | 1 138 | 0.9–1.0 s | 13 KB |
| `GET /facts-analysis` | 1 050 | 0.7 s | 14 KB |
| `GET /cleaning` | 207 | 0.35 s | 12 KB |
| `GET /lexicon?status=to-decide&kind=suspect` | 22 | 0.2 s | 2.6 MB |
| `GET /lexicon?status=all` | 22 | 0.2 s | 3.0 MB |

The queries grow with the interviews: about 20 per interview on Quality and Analysis, 3–4 on Cleaning. With a round trip of 15–30 ms on the deployed instance (database through a VPC connector), Quality and Analysis alone need 2–6 s of queries waiting on 10 connections, more when pages run at once: the reported 6–15 s.

CPU of the analysed texts (corrections of 438 terms applied to 57 interviews): about 0.5 s on a laptop, already optimised (spec 010 review): not the main cost.

## R1. Analysed texts read per study

**Decision**: the Transcripts module gets `analysedTexts(accountId, studyId, sessionIds, mode)`, returning the analysed text of each interview. It reads once: the study access, the study's transcripts, the team's terms, the study's verdicts, the pseudonyms (anonymised study, one `cleaningNames` call, so one folder access check), and the AI suggestions, stored corrections and name decisions of the interviews (`… where session_id in (…)`, one query each); `clean-only` reads the latest clean versions of the study at once. `loadCorrections` takes these as `preloaded`, so the computed text is the same function of the same data. `analysedText` (one interview) stays for the commands.

**Rationale**: per interview, `analysedText` read again `getStudyAccess`, `teamTerms` (438 rows), `verdictsOf(study)`, `cleaningNames` (folder access, sessions, pseudonyms) and three per-interview tables: about 15 queries × 57.

**Alternatives considered**: storing each analysed text (suggested): invalidating it on every correction, lexicon decision, verdict or pseudonym change is easy to get wrong and would show a stale text silently; the remaining CPU (0.5 s) does not justify it. Kept for later if measurements after this change show the computation dominates.

## R2. Evidence and Quality use it

**Decision**: `interviewsNow` (Evidence and Interview Quality) calls `sources.analysedTexts` once for all interviews; Quality's speaker attributions are read per study (`speakersOfStudy`, one query) instead of per interview.

## R3. Cleaning list

**Decision**: the Cleaning list passes the per-study suggestions, corrections and decisions to `loadCorrections` as it already does for terms, verdicts and names.

## R4. Lexicon list size

**Decision**: the list returns each term's occurrences per interview with their counts and verdict counts but no quotes; the term dialog loads its quotes when it opens (`GET …/lexicon/terms/:termId/quotes`, the same 3 per interview from the stored occurrences), and "every occurrence" stays as today. The list then no longer reads every transcript of the study.

**Rationale**: the table shows counts only; 50 terms × up to 57 interviews × 3 quotes made 2.6–3 MB here (1.1 MB on the deployed study), and reading every transcript to build them. The once-38 s was most likely this payload and transcript read competing with the other pages.

## R5. Guard

**Decision**: the volume test bounds the queries of each page with a constant independent of the number of interviews, and checks on the same data that the analysed text read per study equals the one read per interview (`analysedTexts` against `analysedText` for every interview), which is what Quality and Analysis show. The lexicon list keeps its counts; the dialog's quotes come from the same stored occurrences.

**Alternatives considered**: comparing page bodies with a reference recorded before the change: the test data carries ids and dates that change at each run, so a recorded reference would not be stable.

## After the change

Same test, same data (3 ms per query, pool of 10, laptop); the small study has 6 interviews.

| Page | Queries before | Queries after (57 / 6 interviews) | Time after | Size after |
|---|---|---|---|---|
| `GET /quality` | 1 138 | 74 / 74 | 0.5–0.7 s | 13 KB (same) |
| `GET /facts-analysis` | 1 050 | 42 / 42 | 0.35 s | 14 KB (same) |
| `GET /cleaning` | 207 | 39 / 39 | 0.33 s | 12 KB (same) |
| `GET /lexicon?status=to-decide&kind=suspect` | 22 | 21 / 21 | 0.4 s | 0.38 MB (2.6 MB before) |
| `GET /lexicon?status=all` | 22 | 21 | 0.4 s | 0.42 MB (3.05 MB before) |

The queries no longer depend on the number of interviews; the page bodies keep their size (same content). What remains of the lexicon list is each term's counts per interview, which the table and the dialog use.
