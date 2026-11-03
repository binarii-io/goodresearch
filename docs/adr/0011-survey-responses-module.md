---
status: accepted
date: 2026-11-02
---

# ADR-0011 — Survey responses live in a module of their own, read whole

## Context and problem statement

Spec 028 reads the responses of a survey's form and lets a person keep those of the target. Ingestion models files and sessions, none of which apply; Publishing's job ends at the file; Research holds the questionnaire, not what comes back from it.

## Decision drivers

- A person deciding the target must see the effect at once, and undo it.
- Responses are personal data: as little as possible, in as few places as possible.
- A deleted response must leave the app.
- Nothing may detach an answer from its item, silently.

## Considered options

1. **In Ingestion, next to sessions**: same phase, but no shared concept.
2. **In Research, next to the questionnaire**: mixes a core model with imported data.
3. **A new supporting module, `surveys`**, through ports.

## Decision

Option 3.

- **Whole readings.** The service does not say how deleted responses appear, and its only filter is on an unspecified timestamp, so every reading lists everything, upserts, and removes what is gone, only if it finished. Simple at our volumes, capped at 20,000.
- **States computed in SQL at read time**, with the same rule in a pure function, and a test comparing the two. Nothing to migrate when a rule changes.
- **Publishing asks Surveys** how many responses a form has, and refuses what would detach them, comparing items rather than operations.
- **The assistant gets counts only.** Open answers are free text and may hold names.

## Consequences

- Each reading costs one full listing: at most once a minute when the tab opens.
- Publishing and Surveys depend on each other through ports, bound in `compose.ts`.
- Spec 029 reads answers per item from here: figures in SQL, never stored, and themes of open answers; sending open answers to a provider is settled by [ADR-0012](0012-masked-open-answers-to-ai.md): masked, one item at a time, after a person confirms the cost.
