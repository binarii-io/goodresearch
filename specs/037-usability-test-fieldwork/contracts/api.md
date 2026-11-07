# API contract: Usability test fieldwork

Existing session routes of specs 008 and 009 accept usability test studies; refusals unchanged.

## Fieldwork view

`GET /api/studies/:id/sessions` on a usability test study adds:

```text
kind: 'sessions'
sessions[]: { …, video: { fileId, name, durationMs | null } | null,
              protocolVersion: { version, by: 'app' | 'person' } | null,
              readiness: 'ready' | 'not-validated' | 'video-missing' | 'duration-unknown'
                         | 'participant-to-confirm' | 'no-protocol' }
ready, videoMinutes
unclaimedTranscripts[]: { fileId, name, group }
protocolVersions[]: { version, savedAt }
```

No `planned` data is returned for this type.

## Protocol version of a session

`PUT /api/sessions/:id/protocol-version` body `{ protocolVersion: int ≥ 1 | null, version }` (null gives the choice back to the app) → the session; refusals `SESSION_NOT_FOUND`, `VALIDATION` (unknown version), `SESSION_DECIDED`, `VERSION_CONFLICT`, `FOLDER_ACCESS_REQUIRED`.

## Assistant

`count_interviews` and `list_interviews` work on usability test studies: counts add `readyForAnalysis`, `videoMinutes` and `not-ready`; the filter list adds `not-ready`. Cards unchanged.
