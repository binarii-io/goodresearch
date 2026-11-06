# Contracts: Cleaning review without duplicates, with steady buttons and context

`GET /api/studies/:studyId/cleaning/:sessionId/turns/:turnId/context` (`getTurnContext`, new):

- params `TurnContextParams { studyId, sessionId, turnId }`; response `TurnContext { turns: CleaningTurn[] }` — the turn and up to two before and after, in order, each with its corrections not rejected, duplicates left out.
- 404 `TURN_NOT_FOUND` for a turn no longer in the transcript; `SESSION_NOT_FOUND` as the interview read.

`GET /api/studies/:studyId/cleaning/:sessionId` (`getInterviewCleaning`): duplicates left out of `turns` and `counts`.
