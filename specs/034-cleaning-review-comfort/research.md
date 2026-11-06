# Research: Cleaning review without duplicates, with steady buttons and context

## R1 — Where to drop duplicates

- **Decision**: in `resolveCorrections`, the one rule every reader uses (view, counts, analysed text, clean version). Corrections with the same segment, target, offset, length and replacement (an edited one compares its edit) are one change: the one a person decided stands for it (review: a human decision is never dropped), else the one of highest priority (person > lexicon > name > ai-lexicon > ai-other, then longest); the others are duplicates, overridden whatever their status.
- **Rationale**: a rejected change must not come back through its duplicate (spec FR-002); today a rejected correction takes no place, so the AI's identical one would apply.
- **Alternatives**: hiding duplicates in the web only (counts and texts stay wrong; rejected).

## R2 — Steady buttons

- **Decision**: a local `settling` flag set on a decision, an edit or an added correction, cleared once the view and the study list are read again — after a refusal too, so the row shows as it is now; the decision and Validate buttons are disabled while it is set.
- **Rationale**: `isPending` ends when the decision is stored, before the refetch.

## R3 — Context of a turn

- **Decision**: a read of its own, `GET /api/studies/:studyId/cleaning/:sessionId/turns/:turnId/context` (`getTurnContext`): that turn and up to two before and after, every correction not rejected, duplicates left out; `TURN_NOT_FOUND` for a turn no longer there. The web shows them with `TurnText` in a panel under the turn, read when opened, the turn marked.
- **Rationale** (review): the interview read also reads versions, runs, costs and names; the context needs the corrections only (names and lexicon need the whole transcript, so they are computed on it). Same masking and text as the view.

## R4 — "To decide" without set-aside corrections (after merge)

- **Finding**: the "To decide" filter showed proposed corrections set aside by the one applying at their place ("Hidden by another correction here"), while the count, "Accept all shown" and validation leave them out: rows "to decide" next to "Accept all (0)".
- **Decision**: "To decide" shows proposed corrections not set aside, "Accepted" those the clean version applies (the same domain rules as the counts, `isToDecide` / `isEffective`); a set-aside one shows under "All", still marked. The web's "Accept all shown" keeps its own copy of the rule on the rows it received (the generated client carries no flag for it).
