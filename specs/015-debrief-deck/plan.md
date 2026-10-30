# Implementation Plan: Debrief deck

**Branch**: `015-debrief-deck` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

## Summary

The last step of the synthesis:
- A pure builder makes the debrief deck from the project's data, on the fly and in one language, with what is still to decide added on request.
- A fourth project tab shows it as thumbnails and in a presentation mode. The next steps are written from the data (no limits slide for now); the slides follow the prototype's design (update 2026-10-29).
- The deck is published to Google Slides in a study's Drive folder through the Slides API, and updated in place, never over edits made in Slides without confirmation.

Decisions are in [research.md](research.md).

## Technical Context

- **Dependencies**: none new.
- **Storage**: one migration, described in [data-model.md](data-model.md).
- **Testing**:
  - the deck builder, test-first (order, empty sections left out, to-validate marks, names replaced, verbatim choice, pages of recommendations);
  - use cases with fakes: the deck, publish, update, edits made in Slides;
  - the Slides adapter, with a fake fetch checking the requests;
  - PostgreSQL component tests for the two tables;
  - e2e with axe: the tab, the presentation mode, publishing to the dev Drive.

## Constitution Check

| Principle | Status |
|---|---|
| I. Spec-driven | ✅ |
| II. DDD | ✅ The deck is a read model (no aggregate); the published deck is the only record. Other modules are reached only through ports. |
| III. Provider-agnostic | ✅ The Slides API sits behind the documents port of the Drive adapter; there is a dev fake. |
| IV. AI proposes, humans decide | ✅ No AI content in the deck beyond what people decided (or what is marked "to validate"). |
| V. Test-first | ✅ |
| VI. Contracts | ✅ |
| VII. Privacy | ✅ Codes, never names; known names are replaced in verbatims; facts of a study the person cannot open never reach their deck. |
| VIII. a11y & i18n | ✅ |
| IX. Simplicity | ✅ No new dependency, no new module. |

## Complexity Tracking

| Deviation | Why | Simpler alternative rejected |
|---|---|---|
| The deck read model lives in `synthesis`, not in a `reporting` module | It reads Synthesis objects only, plus counts through existing ports | A new module with the same ports |
| Publishing the deck in `synthesis`, not in `publishing` | One-way export; the three-way sync of spec 007 does not apply | Forcing a three-way model on slides |
