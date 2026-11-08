# Feature Specification: Usability test analysis — reading each session's video task by task

**Feature Branch**: `038-usability-video-analysis`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Usability test studies, part 3: Analysis. On a usability test study, the Analysis phase reads each session ready for analysis (spec 037) task by task against the tasks of its protocol version (spec 036), and turns it into observations a person reviews. The video stays in Drive: for each analysis the app copies it to a temporary cloud storage the AI provider reads, and deletes the copy after. The AI pipeline favours quality over cost: a full transcript with speakers and times; a screen log from sharp keyframes; a map of where each task starts and ends; a per-task reading on its clip (outcome, time on task, path, difficulties and errors with their moment, verbatims, ease and SUS answers); a judge that checks each observation against dense frames around its moment and never rejects without contrary evidence; and an arbiter (another model) that settles every disagreement. Each observation carries its moment, a screenshot and a short clip read from Drive by time range, and its quotes are verified in the transcript; rejected observations say why. The analysis also proposes the participant and facilitators from its transcript when the session has none. The person sees per session its tasks with outcome and status colour, its observations with screenshots, rejections explained, the full transcript tab, and accepts, edits or rejects each observation; per study, the results by task across sessions and the SUS score. It runs in the background, one run per study, with stop and per-session state; every AI call is in the usage ledger and its cost is shown per session and per study before and after. The session's protocol version is frozen when it is analysed. Anonymised studies: pseudonyms in all outputs. Out of scope: notifications, findings across studies, a lexicon, editing the video." (Updated at clarify: reviewed observations do become facts of the study.)

## Clarifications

### Session 2026-11-08

Decided by default, from the trial on six real sessions (2026-11-07) and specs 009, 012, 036 and 037; each can be revisited at `/speckit-clarify`:

- Q: Which sessions are analysed? → A: Only sessions **ready for analysis** (spec 037 FR-012). A session analysed again keeps what a person decided on its observations and replaces only what was still to decide, as interview analyses do (spec 009).
- Q: What does the person review? → A: **Observations**, one per finding: a task outcome, a difficulty, an error, a positive moment, a verbatim, an answer to a standard question. Each has its task, its moment in the video, a screenshot, its evidence (quote or what is seen) and a verdict of the checks (kept, rejected with the reason, settled by the arbiter).
- Q: Is the transcript the analysis makes kept? → A: Yes, as the session's transcript of record, shown in a Transcript tab with speakers and times; it is never written to Drive in this spec, and never replaces a transcript file of the folder.
- Q: Can a check reject an observation without proof? → A: No: the judge rejects only with contrary evidence seen around the moment; absence of evidence is "not confirmed", kept for the person with that mark; every disagreement between the reading and the judge goes to the arbiter, a second model.
- Q: Do reviewed observations become facts for the project's synthesis? → A: **Yes, in this spec** (requester, 2026-11-08): each observation a person accepts or edits gives a **Fact** of the study (context map, spec 012), in English and French, without names, with its polarity, its task as theme and its evidence (quote, moment, screenshot), so the project's insights and recommendations read usability tests as they read interviews; rejecting or reopening an observation withdraws its fact.
- Q: Where are the screenshots kept, since they show the screen and sometimes the participant's face? → A: **In the app's storage** (requester, 2026-11-08): small images taken during the analysis, kept with the study, shown only to those who can read its sessions (the team, with the folder open, spec 026), deleted with the session, its new analysis or the study; never sent to Drive, never shown on another team's read-only page.
- Q: Which AI provider analyses the videos? → A: **Vertex AI only** (requester, 2026-11-08: "usability test studies are available only with Vertex, the only one tested"). The provider in use (the instance's shared one or the person's own) must be Vertex AI: the type "Usability test" is offered at creation only then, and the analysis refuses to start otherwise, saying why. Studies already created keep their Preparation and Fieldwork whatever the provider. Other providers may be added once tested.
- Q: Is the version of the protocol fixed? → A: Yes: when a session is analysed, its protocol version is frozen on the session; changing it later asks for a new analysis.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Analyse the ready sessions (Priority: P1)

On the Analysis tab of a usability test study, the person sees the sessions ready for analysis, the estimated cost of analysing them, and starts the analysis. It runs in the background: each session shows its state (waiting, analysing which step, done, failed with the reason) and the person can stop the run. When a session is done, its tasks show their outcome and its observations wait for review.

**Why this priority**: Watching hours of video task by task is the slowest part of a usability test; the analysis is what the whole study type exists for.

**Independent Test**: Start the analysis on two ready sessions of a study whose protocol has three tasks; see each step progress, then each session with three task outcomes and observations; the cost shown matches the usage ledger.

**Acceptance Scenarios**:

1. **Given** a study with ready sessions, **When** the person opens the Analysis tab, **Then** it lists them with their video length and shows the estimated cost of analysing them, before anything starts.
2. **Given** the person starts the analysis, **When** it runs, **Then** each session shows its current step and the person can stop the run; a stopped run leaves finished sessions done and the others as before.
3. **Given** a session being analysed, **When** its video is copied for the AI provider, **Then** the copy exists only for this analysis and is deleted when it ends, whether it succeeded, failed or was stopped.
4. **Given** a session whose video cannot be read (removed from Drive, access lost), **When** the run reaches it, **Then** the session is marked failed with the reason and the run goes on with the others.
5. **Given** a session analysed, **When** its result is shown, **Then** each task of its protocol version has an outcome (success, partial, failure, not attempted), a time on task and a short path, and the session's protocol version is frozen.
6. **Given** a study with no session ready, **When** the tab is shown, **Then** it says why (no session validated, participant to confirm…) and links to Fieldwork.

---

### User Story 2 - Review the observations of a session (Priority: P1)

The person opens an analysed session: on the left, shortcuts to its tasks, each with its outcome in its status colour; for each task, its observations with their moment, a screenshot, the evidence and the verdict of the checks. Clicking a moment plays the video from Drive at that time. Rejected observations are kept apart, each with the reason. The person accepts, edits or rejects each observation, and can add one by hand. A Transcript tab shows the full transcript with speakers and times.

**Why this priority**: The AI proposes, a person decides (constitution IV): only reviewed observations count in the study's results.

**Independent Test**: Open an analysed session, play an observation's moment, accept one, edit one, reject one with a reason, add one by hand; see the task outcomes follow.

**Acceptance Scenarios**:

1. **Given** an analysed session, **When** the person opens it, **Then** shortcuts list its tasks with their outcome in colour (success green, partial amber, failure red, not attempted grey), and each task lists its observations.
2. **Given** an observation, **When** it is shown, **Then** it has its moment, a screenshot taken at that moment, its evidence, and whether the checks kept it, did not confirm it, or the arbiter settled it, with the reason in words.
3. **Given** a quote in an observation, **When** it is shown, **Then** it was found in the session's transcript; a quote not found is dropped before the person sees it.
4. **Given** the person clicks a moment, **When** the player opens, **Then** the video plays from Drive at that moment with the person's own access, a few seconds before it; nothing is copied for this.
5. **Given** an observation, **When** the person accepts, edits (kind, task, text, outcome) or rejects it, **Then** the decision records who and when, and a task's outcome follows the accepted observations.
6. **Given** a session analysed again, **When** new observations come, **Then** decided ones stay, rejected ones are not proposed again, and undecided ones are replaced.
7. **Given** a session without participant or facilitators, **When** its analysis ends, **Then** the people found in its transcript are proposed on the session (spec 037), each with a quote, to accept on Fieldwork.

---

### User Story 3 - See the results of the study (Priority: P2)

The study's Analysis tab shows, for each task of the protocol, how many sessions succeeded, partly succeeded, failed or did not attempt it, the median time on task, the main difficulties with the number of sessions they appear in, and the ease answers; and the study's SUS score when the protocol asked it (standard scoring, with the number of answers). Only observations a person accepted or edited count; the screen says how many remain to review.

**Why this priority**: The team reports results by task and a usability score; it follows the review.

**Independent Test**: With three reviewed sessions, see per task the outcome counts and median time, and a SUS score that matches a hand calculation.

**Acceptance Scenarios**:

1. **Given** reviewed sessions, **When** the results are shown, **Then** each task has its outcome counts, median time on task and its difficulties ranked by the number of sessions.
2. **Given** a protocol with the SUS, **When** every answer of a session was accepted, **Then** the session's SUS score is computed with the standard scoring and the study shows the mean with the number of sessions; a session with missing answers gives no score and says so.
3. **Given** sessions run against different protocol versions, **When** the results are shown, **Then** tasks are matched by their id across versions, and a task absent from a version is counted only for the sessions that had it.
4. **Given** observations still to review, **When** the results are shown, **Then** the screen says how many and the numbers count only decided ones.
5. **Given** an observation accepted or edited, **When** the project's synthesis reads the study, **Then** it finds it as a fact of the study, with its task as theme, its polarity and its evidence, and no name; rejecting the observation, or sending it back to review, withdraws the fact.

---

### User Story 4 - Work on the analysis with the assistant (Priority: P3)

The assistant tells where the analysis stands (sessions ready, analysed, observations to review), proposes starting the analysis with its estimated cost, and summarises the results by task; it never accepts observations by itself.

**Why this priority**: Same journey as for interviews; the screen allows every action.

**Independent Test**: Ask "where is the analysis?", get the counts; ask to analyse, apply the card showing the cost.

**Acceptance Scenarios**:

1. **Given** a usability test study, **When** the assistant reads its state, **Then** it gets counts of sessions by analysis state and observations to review, with no names.
2. **Given** a card to start the analysis, **When** the person applies it, **Then** the run starts as from the screen, with the same estimate shown before.

---

### Edge Cases

- A very long session (two hours): read by segments of at most 20 minutes that overlap, so a task crossing a boundary is not cut; its cost estimate grows with its length.
- A task never reached in the video: outcome "not attempted", with the reason seen (time ran out, skipped by the facilitator).
- Tasks done out of order, or a task done twice: the task map follows the video, not the protocol order; the second attempt is a second observation.
- The facilitator helps the participant: the observation says "assisted" and the outcome is at most partial.
- A screen not shared, or the camera only: the screen log is empty, observations rely on what is said and say so; the task outcome is "not confirmed" unless the speech is explicit.
- Several speakers, or another language than the protocol's: the transcript keeps the speakers apart and its language; observations are written in the study's language.
- An error banner shown for a second: dense frames around a moment catch it; the judge never rejects it because it is not on the keyframes.
- The video changes in Drive after the analysis: the session shows "video changed since the analysis" and offers to analyse again.
- The AI provider fails mid-run, or its limits are reached: the session fails with the reason, its partial cost is recorded and shown, its temporary copy is deleted.
- The protocol version of a session is changed after its analysis: the analysis is marked out of date and offered again.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Analysis tab of a usability test study MUST list the sessions ready for analysis (spec 037 FR-012), their analysis state, and the estimated cost of analysing the ones not analysed, before anything starts. Each ready session MUST also be analysable on its own ("Analyse", or "Analyse again" once analysed), with its own estimate shown first, as an interview is (spec 009).
- **FR-002**: Analysing MUST run in the background, at most one run per study, with a stop, and a state per session: waiting, analysing (with its step: preparing the video, transcript, screen log, task map, tasks, checks), done, failed (with the reason) or stopped.
- **FR-003**: For each session, the app MUST copy its video from Drive with the person's own access to a temporary storage the AI provider reads, for this analysis only, and MUST delete the copy when the analysis ends whatever its outcome; a copy left by a crash MUST be deleted within 24 hours. The video is never kept by the app.
- **FR-004**: The analysis MUST produce, in order: a full transcript with speakers and times; a screen log of what is seen on screen at its sharp moments; a task map placing each task of the session's protocol version in the video (start, end, or not found); then a reading of each task on its own part of the video. Long videos MUST be read by overlapping segments.
- **FR-005**: Each task reading MUST give an outcome (`success | partial | failure | not-attempted`), a time on task, the path taken in a few steps, and observations: difficulties, errors, positive moments, verbatims, assistance by the facilitator, and the answers to the ease question and the SUS when the protocol asks them.
- **FR-006**: Every observation MUST have its task, its moment in the video, its evidence (a quote of the transcript or what is seen) and a screenshot taken at its moment. A quote MUST be found in the session's transcript or the observation is dropped; moments outside the task's part of the video are dropped.
- **FR-007**: A judge MUST check each observation against the frames around its moment and the transcript, and keep it, mark it "not confirmed", or reject it only with contrary evidence, giving the reason. Every disagreement between the reading and the judge MUST be settled by an arbiter using a different model, whose verdict and reason are shown.
- **FR-008**: The session's protocol version MUST be frozen when its analysis starts; a later change of version, or of the video in Drive, MUST mark the analysis out of date.
- **FR-009**: The person MUST be able to accept, edit (kind, task, text, outcome, moment) or reject each observation, add one by hand, and correct a task's outcome; each decision records who and when and checks the version seen. Rejected observations are shown apart, with their reason.
- **FR-010**: A new analysis of a session MUST keep decided observations and outcomes, never propose again a rejected observation, and replace only those still to decide.
- **FR-011**: The session view MUST show shortcuts to its tasks with their outcome in a status colour (with text, never colour alone), the observations by task, their screenshots, and a player that plays the video from Drive at a moment with the person's own access.
- **FR-012**: A Transcript tab MUST show the session's full transcript with speakers and times; clicking a time plays the video there.
- **FR-013**: When a session has no accepted participant or facilitator, the analysis MUST propose the people found in its transcript as proposals on the session (spec 009 rules), each with a quote, accepted on Fieldwork; names enter the AI prompts only as the video holds them.
- **FR-014**: The study results MUST show per task the outcome counts, the median time on task, the difficulties ranked by the number of sessions they appear in, and the ease answers; and the SUS score per session (standard scoring: odd items minus one, five minus even items, sum times 2.5) and its mean for the study with the number of sessions. Only decided observations count; the number left to review is shown.
- **FR-015**: Tasks MUST be matched across protocol versions by their id (spec 036); a task absent from a session's version is not counted for that session.
- **FR-016**: Every AI call MUST go through the AI Gateway and be in the usage ledger with its session; the estimate MUST be shown before a run, and the cost per session and per study after it, in the Analysis tab, whoever ran it. A failed or stopped analysis MUST still show what it cost.
- **FR-017**: Sending the video and its transcript to the AI provider MUST require the folder consent of spec 022 for this study and provider; on an anonymised study, outputs MUST use the participant's pseudonym and the facilitator labels, and no name the app knows MUST be added to a prompt.
- **FR-018**: Usability test studies MUST be offered at creation (screen and assistant) only when the AI provider in use is Vertex AI, the only provider tested for video; the analysis MUST refuse to start, with the reason, on any other provider. An existing usability test study keeps its Preparation and Fieldwork whatever the provider.
- **FR-019**: The assistant MUST be able to read counts of sessions by analysis state and of observations to review (no names), propose starting the analysis with its estimate, and summarise decided results by task; it MUST NOT decide observations.
- **FR-020**: Screenshots MUST be small images kept in the app's storage with the study, shown only to people who can read its sessions (the team, with the folder open, spec 026; never on another team's read-only page or to the AI of other steps), and deleted with the session, when its analysis is replaced, or with the study; clips are never stored, only played from Drive.
- **FR-021**: All texts MUST exist in English and French, and the Analysis tab, the session view, the player and the cards MUST meet WCAG 2.2 AA.
- **FR-022**: Each observation a person accepts or edits MUST give a **Fact** of the study (spec 012): a neutral statement in English and French without names, a polarity, the task as theme, its evidence (the verified quote, the moment and the screenshot), origin `ai` or `person`; the project's insights and recommendations MUST read these facts as they read interview facts. Rejecting an observation or sending it back to review MUST withdraw its fact; a person's edit of the fact's statement is translated as for interview facts. Task outcomes and SUS scores are results of the study, not facts.

### Key Entities

- **Session analysis** (usability): the run of the pipeline on one session, its state and step, the frozen protocol version, the video read (its Drive version), the cost.
- **Session transcript**: the full transcript made by the analysis, with speakers, times and language.
- **Task result**: per session and task, the outcome, time on task, path, start and end in the video, and whether a person decided it.
- **Observation**: kind, task, moment, text, evidence (quote or seen), screenshot, verdicts of the judge and the arbiter with reasons, status `proposed | accepted | edited | rejected`, who decided and when.
- **Analysis run**: the background run over a study's sessions, one at a time per study.
- **Fact** (Evidence, spec 012, extended): made from an accepted or edited observation; its evidence is the observation's quote, moment and screenshot; its theme is the task.
- **Study results** (computed): per task outcome counts, median time, difficulties, ease answers; SUS per session and mean.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a fixture of three sessions with known outcomes, every task gets its outcome and at least 90 % of the outcomes match the expected ones.
- **SC-002**: No observation reaches the person with a quote absent from the transcript, or a moment outside its task (tested).
- **SC-003**: No observation is rejected by the checks without a stated contrary evidence; every disagreement shows the arbiter's verdict (tested).
- **SC-004**: No copy of a video remains in the temporary storage after an analysis ends, fails or is stopped, and none older than 24 hours ever (tested).
- **SC-005**: The cost shown per session equals the sum of its ledger entries; the estimate shown before a run is within a factor of two of its real cost on the fixture.
- **SC-006**: A person reviews a 30-minute session's observations in under 10 minutes, reaching any task from its shortcut in one click.
- **SC-007**: The SUS score shown equals the standard calculation for every session with complete answers (tested).
- **SC-008**: Interview and survey studies behave as before (their tests pass unchanged); the Analysis tab, session view and cards have no axe violation in light and dark themes.
- **SC-009**: Every accepted or edited observation is one fact of the study with no name in its statement, and every rejected one has none (tested).

## Assumptions

- The pipeline follows the trial validated on 2026-11-07 on six real sessions; its prompts, models and segment lengths are tuned in the plan, quality first: the cost (about 0.10 USD per video minute in the trial) is not the limit.
- The AI provider for this phase is Vertex AI (FR-018); the temporary storage is the same cloud's, in the same region as the processing (EU for an EU deployment).
- Screenshots are taken by the app from the temporary copy during the analysis and kept as small images; the video itself is never stored.
- Sessions without a transcript file are analysed the same way: the analysis makes its own transcript.
- Out of scope: notifications when a run ends, changes to how the project's synthesis works (it reads the new facts as it reads interview facts), a lexicon, cutting or editing the video, writing the transcript to Drive.
