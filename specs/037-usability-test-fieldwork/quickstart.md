# Quickstart: validate usability test fieldwork

Prerequisites: `docker compose -f compose.yaml -f compose.dev.yaml up --build` (dev Drive simulated). Automated: `pnpm check`, `pnpm test`, `pnpm e2e`.

1. **Sessions from videos**: on a usability test study with a saved protocol, attach a folder holding three videos, two transcripts (one with the same meeting title as a video) and an audio file. Expected: three sessions with durations; the transcript matched; the audio attached; an unclaimed transcript listed with "a session needs its video" (US1).
2. **People and name**: analyse a session with a call-tool transcript: rules propose the date and participants; accept the name; files renamed (US2). Analyse one without transcript: no AI call, rules only.
3. **Protocol version**: save the protocol again; existing sessions keep their version; change one session's version by hand (US2 scenario 6).
4. **Readiness**: validate two sessions, exclude one, leave one without participant: "2 ready" and the reason for the third (US3).
5. **Assistant**: "where are the sessions?" gives counts, ready and video hours; a validation card applies line by line (US4).
6. **Others unchanged**: run `fieldwork.spec.ts`, `fieldwork-analysis.spec.ts`, `questionnaire.spec.ts`.

## 7. Real Drive (by hand, before merge)

Attach a real folder of recorded test sessions: durations read for each video; a video still processing shows "unknown"; renaming works with the person's access.
