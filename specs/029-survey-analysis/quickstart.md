# Quickstart: validate survey analysis

Prerequisites: `docker compose -f compose.yaml -f compose.dev.yaml up --build` (fake Drive and fake AI). Automated: `pnpm check`, `pnpm test`, `pnpm e2e`.

1. **Flat sort**: a survey study with responses on every item kind (dev endpoint `POST /api/dev/drive-documents/:fileId/responses`), a target rule setting some aside. Open Analysis: compare each figure with a count by hand; change the rule, come back, see figures move. Expected: US1.
2. **Cross**: cross by the profiling item; check one column by hand; a column under 30 is flagged, under 5 shows counts only. Expected: US2.
3. **Themes**: an open item with 40 answers, one holding a team member's name, one an email. See the estimate, run, check the masked text on screen and in what the fake AI received (test log), decide, merge, move an answer, add answers and run on new ones only. Expected: US3.
4. **Facts**: make a fact from a cross figure and one from a theme; edit one in French and see the English translated; add responses that move the figure: "Figure changed", update. Run insights on the project with an interview study too: both kinds of facts as evidence, confidence and support line. Expected: US4.
5. **Assistant**: ask where the analysis stands, ask for facts on striking figures, ask for themes; apply the cards. Expected: US5.
6. **Readers and deletion**: open as a member outside the team; delete the study and check themes and facts are gone and insights show "Evidence changed". Expected: US6.
7. **Interviews unchanged**: `analysis.spec.ts`, `insights.spec.ts` and the Evidence and Synthesis unit tests pass unchanged.

## Real provider (by hand, before merge)

With the user's real AI provider, on their real survey: run themes on one open item, check that labels are useful, that every quote shown is in the answers, and the cost shown matches the ledger.
