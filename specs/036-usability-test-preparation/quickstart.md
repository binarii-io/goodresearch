# Quickstart: validate usability test preparation

Prerequisites: `docker compose -f compose.yaml -f compose.dev.yaml up --build`. Automated: `pnpm check`, `pnpm test`, `pnpm e2e`.

1. **Create**: create a Usability test study by the project form, the Studies page form and through the assistant. Phases: Preparation, Fieldwork, Lexicon, Enrichment, Analysis; only Preparation usable; no Quality tab. Project overview counts unchanged for its interview and survey studies. Expected: spec US1.
2. **Design**: "Design with the assistant", progress on nine points, card with the interface, task count, planned length against session length, flags; Apply. The tab shows the design's cost. Expected: US2.
3. **By hand**: "Write it myself"; add, reorder and delete tasks and check ids survive (network tab or API); turn SUS and SEQ on and see the fixed texts in the protocol's language; save from two tabs for "changed meanwhile"; download the Markdown; open as a member outside the team. Expected: US3.
4. **Rules**: write tasks breaking each rule of research R3 in French and in English, and their well-written counterparts. Expected: US4, SC-005.
5. **Others unchanged**: run `preparation.spec.ts`, `questionnaire.spec.ts` and the assistant guide and questionnaire tests. Expected: SC-007.

## 6. Real Docs service (by hand, before merge)

| Check | Expected | If not |
|---|---|---|
| Publish the protocol | Protocol and participant sheet in the study's folder | Fix the publish command |
| Protocol layout | Tasks numbered, "Read aloud" blocks, criteria marked facilitator-only, SEQ after tasks when on | Fix `renderProtocol` |
| Participant sheet | Scenario and instructions only; no criterion, script or duration | Fix `renderParticipantSheet` |
| Change a task in the app, check | Both "out of date"; update rewrites both | Fix `protocolItems` |
| Edit a task instruction in the protocol document | Drive change, accepted keeps the task id | Fix `readProtocol` anchors |
| Edit the participant sheet | Reported; accept refused; next update overwrites | Fix the one-way kind |
| Edit the SUS text in the document | Not understood | Fix unanchored blocks |
| Best practices | Usability content, not the interview one | Fix `renderPractices` |
| Move the protocol out of the folder | Unavailable; nothing deleted | Existing behaviour |
