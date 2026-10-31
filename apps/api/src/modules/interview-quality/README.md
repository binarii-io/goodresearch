# Interview Quality

How the interviews of a study were conducted (spec 016, context map #5). Everything shown is a fact to read: no score, no verdict, no ranking.

- **Speaking times** (`domain/speaking-times.ts`): words and minutes per role, computed at read time from the analysed text, with no AI, and shown only once reviewed. Above 95% of interviewer words, an interview is not measurable; with no interviewer word or more than 20% of words of no known person, its speakers are not identified. Both are left out of the figures. Who speaks comes from `conductRoles` (`packages/shared`), over all the labels of the interview.
- **Review** (`commands/review-commands.ts`, queue `quality.review`, one per study, never with a lexicon reading, a cleaning or a facts reading): the app cuts the interviewers' turns into numbered sentences (`domain/sentences.ts`), and the AI answers only on those that are not `other`. Ledger ref `quality:<runId>:<sessionId>`. Known names and speaker labels are placeholders.
- **Remarks** (`domain/remarks.ts`): a leading question, a reformulation with opinion or an opinion. The text is the app's own, so a quote is exact. A reformulation with opinion that names nothing new, or only what the interviewee said before it, counts as a simple reformulation and as "left out": this guard checks words, not meaning (see the reference set).
- **Figures** (`domain/figures.ts`): counts by speaker label, so a fixed attribution moves them at no AI cost. A remark counts until someone disagrees; every total comes with its breakdown. Rows of By person add up on the interviewers' own words, their sentences and remarks.
- **Opinions** (`commands/remark-commands.ts`): `stance` on a remark, or a simple reformulation requalified by a person. No AI call; it changes only the counts. A new review keeps them (`mergeReview`), and remarks are found again at read (`reanchor`).
- **Interview view**: `GET quality/interviews/:sessionId`; the route imports a missing transcript first (`importToRead`), so the query stays read-only.
- **Reference set** (`tests/reference/`, `scripts/quality-reference.ts`): synthetic excerpts to measure the AI's judgement on a real provider, by hand, since it costs money.
- Tables (migration `0040_interview_quality.sql`): `quality_runs`, `quality_evaluations`, `quality_speaker_counts`, `quality_reformulations`, `quality_remarks`, `quality_consents`; cascade with the session and the study.

Other modules through `compose.ts` only: transcripts (analysed text, imports), ingestion (sessions, people, names), research (access, goal, guide), evidence (speaker attributions, `factsLive`), ai-gateway.
