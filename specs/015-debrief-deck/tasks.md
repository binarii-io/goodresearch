---
description: "Task list for 015-debrief-deck"
---

# Tasks: Debrief deck

- [X] T001 Migration `0038_debrief_deck.sql` and schema; contracts `packages/contracts/src/debrief.ts`; error codes.
- [X] T002 Test-first `synthesis/domain/deck.ts` `buildDeck`, and the slide fingerprint.
- [X] T003 Ports:
  - Evidence's `verbatimsOf(factIds)`;
  - Synthesis sources: `interviews(accountId, studyId)` and `folders(accountId, projectId)`;
  - presentations: `create`, `rewrite` and `metadata` on the Drive documents adapter, plus the dev fake.
- [X] T004 The store (Drizzle and in memory): the published deck.
- [X] T005 Commands:
  - publish, and update (the edited-in-Slides check).
  Query: `getDebrief`.
- [X] T006 Routes and client.
- [X] T007 Web:
  - the Debrief tab: thumbnails in the prototype's design, the "to decide" option, print/PDF;
  - the presentation mode;
  - the publish dialog and the publication state.
- [X] T008 i18n, docs (context map, synthesis README, apps/api README), the PostgreSQL test, e2e.
- [X] T009 Update after review: the prototype's slides (typed, worded by the app), next steps from the data, the limits slide removed (product decision), the panel with what is still to decide, print/PDF; the notes and their translation dropped.
