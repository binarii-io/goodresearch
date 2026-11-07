# Research: Usability test fieldwork

Code facts come from the current modules (specs 008, 009, 025, 036).

## R1. Video duration

**Decision**: Ask Drive for `videoMediaMetadata(durationMillis)` in `ITEM_FIELDS` (`drive.fetch-gateway.ts`), map it to `DriveItem.durationMs` (number or null), carry it through `InventoryFile` and store it in `ingestion_inventory_files.duration_ms`. Dev and test fakes give durations to their videos.

**Rationale**: The trial's six recordings all had `durationMillis` in their metadata; reading it costs nothing and reads no content. A video still processing at the source has none: shown "unknown", not ready (FR-012).

**Alternatives**: Probing the file (needs content, refused by FR-016).

## R2. What is a video

**Decision**: `isVideo(mimeType)` = `video/*`. `classify` keeps the kind `media` for both; reconciliation of usability studies splits media into videos (anchors) and audio (attached recordings).

**Rationale**: Interview code keeps its kinds unchanged (SC-006); `renameTargets` already tells audio from video by mime type.

## R3. Reconciliation from videos

**Decision**: `reconcileVideoSessions` beside `reconcileSessions`: each video not held by a kept session gives one proposed session (`videoFileId`); transcripts and audio files of the same group are matched to videos with the existing `confidenceOf`/`matchMedia` (a transcript is matched to at most one video, the best unique match; ties stay unmatched); kept sessions keep their files; files of decided sessions are never reused. Transcripts no video claims are returned as `unclaimedTranscripts`, shown with the warning, and give no session. `run-inventory` passes `sessions: 'transcripts' | 'videos' | false` by study type.

**Rationale**: Same policy, opposite anchor; no lone-recording session exists for usability tests (every session has its video).

## R4. Session anchor in storage

**Decision**: New nullable column `ingestion_sessions.video_file_id` with a unique index (study_id, video_file_id) where not null; `transcript_file_id` stays nullable and unique per study. For a usability session the main video is `video_file_id`; other videos and audio are `media`.

**Rationale**: The existing unique index on transcripts keeps interview behaviour; a separate anchor keeps both rules simple.

## R5. Roles and wording

**Decision**: Keep roster roles `interviewee` and `interviewer` in the domain; the web and the assistant say participant and facilitator on usability tests; the normalised name builder is unchanged (participant in the interviewee slot). The analysis prompt receives the study kind and names the roles accordingly.

**Rationale**: Renaming roles would touch every interview path; the meaning maps one to one.

## R6. Schedule paths

**Decision**: On a usability test study, `ctx.schedule` is null (the research schedule read already refuses other types), the planned link, its suggestion, the sync and "Add to the schedule" are skipped by type in session commands, analysis and the view; the web hides the planned column and stat.

## R7. Protocol versions

**Decision**: Research table `research_test_protocol_versions` (study_id, version, content jsonb, saved_at, saved_by; PK study_id + version), written in the same transaction as each protocol insert or update. Query `protocolVersions(studyId)` returns `{ version, savedAt }[]` (no content); reading a version's content comes with the Analysis spec. Ingestion gets them through a port (`protocolVersions`) wired in `compose.ts`.

**Rationale**: A session must keep the tasks it was run against (FR-010, SC-005); an immutable copy per version is the simplest guarantee.

## R8. Protocol version of a session

**Decision**: Pure `versionAt(versions, date)`: the latest version saved on or before the session's date (the accepted interview date, else the video's modification date); none before → the first version. Only a person's choice is stored (`protocol_version`); the app's proposal is computed at read time, so it follows new versions and dates and never overrides a person. The Analysis spec freezes the version it judged a session against.

**Rationale**: Proposal by the app, decision kept for the person (constitution IV).

## R9. Readiness

**Decision**: Pure `readinessOf(session, ctx)` returns `ready` or the first missing of: `not-validated`, `video-missing`, `duration-unknown`, `participant-to-confirm` (no accepted interviewee, or on an anonymised study no pseudonym), `no-protocol`. Computed in the Fieldwork view from data it already reads.

## R10. Assistant

**Decision**: `interviewCounts` adds `ready` and `videoMinutes` for usability studies; `INTERVIEW_FILTERS` adds `not-ready`; the cards are unchanged (they inherit the type guards, now accepting usability tests). `usabilityNextStep` continues after checks: `decide-sessions` → `make-ready` → `next-phase`. Context wording: sessions, participant, facilitator.

## R11. Web

**Decision**: `FieldworkTab` takes the study type: on usability tests it shows the duration column, transcript presence, protocol version, readiness, video hours and unclaimed transcripts, and hides the schedule column, stat and actions. The session dialog shows the protocol version select. Labels in Lingui with « séance » and « animateur ».
