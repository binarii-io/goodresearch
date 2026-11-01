# Contracts

## Tool `publish_preparation`

Input: `{ studyId, kinds: subset of guide, best-practices }`. Run during the answer; returns the card's confirmation or the reason.

## `POST /api/assistant/conversations/:id/continue`

Also accepted right after an applied `propose_interview_guide` or `publish_preparation`.

## Proposal preview

Adds `documents` (the kinds) and `access` (`read` or `write`).
