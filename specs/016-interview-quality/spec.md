# Feature Specification: Interview quality

**Feature Branch**: `016-interview-quality`

**Created**: 2026-10-31

**Status**: Draft

**Input**: User description: "A Quality tab on an interview study that describes how the interviews were conducted and reviews the interviewer's sentences, shown overall, per person and per interview. First a factual description: speaking times and the number of leading questions or sentences out of the total. Then the list of flagged sentences, each with a recommendation; a person says whether they agree or disagree with the remark (not accept or reject: nothing is applied). In the prototype, reformulations made to confirm understanding were wrongly read as leading: they must not be counted. Runs in the worker with estimate and consent, cost shown on the tab, known names never sent to the AI. Out of scope: link to facts, effect on insight confidence, missed follow-ups, debrief deck."

## Clarifications

### Session 2026-10-31

- Q: Who can see the named figures and remarks of the By person view? → A: Anyone with access to the study sees every person, in name order, without ranking.
- Q: What do the figures show when nobody has given an opinion on a remark yet? → A: A remark without an opinion counts as leading, and the total always comes with its breakdown: "3 leading out of 20: 1 agreed, 2 no opinion", "1 disagreed, not counted".
- Q: Which kinds of sentences does the AI flag in this version? → A: Only what orients the answer: leading question, reformulation with opinion, opinion or suggestion. Reformulations are two distinct categories, counted apart: a **simple reformulation** rests only on what the interviewee said, checks understanding, is good practice and gets no remark; a **reformulation with opinion** adds something they did not say and gets a remark.
- Q: Can a person see and correct the classification of a simple reformulation? → A: Yes. A filter lists the simple reformulations with their context, and a person can requalify one as a reformulation with opinion by writing the reason, with no AI call.
- Q: Should reference values appear next to the figures? → A: Yes, only in a tooltip on each indicator (interviewer talk share 30% at most, leading sentences 5% at most), with no colour or alert on the rows.
- Q: What does clicking an interview row do? → A: It opens the interview to read, inside the Quality tab (`phase=quality&interview=<id>`): its figures, whole transcript with flagged sentences marked in place (text marker as well as highlight), remark cards beside it, simple reformulations listed and requalifiable. Before a review, the transcript only. Under `clean-only` without a clean version it says "Not clean yet". Each row also has its own button to review that interview alone; it does not open it. By person rows keep limiting figures and remarks.
- Q: What shows on an interview not reviewed yet? → A: No figure: its state, a dash for talk share, leading counts and cost, and its Review button; never "0 of 0" nor a cost of 0. Speaking times are computed with no AI but shown only for interviews reviewed. Overall and By person cover only the interviews reviewed; before any review the tab shows that message and the Review action instead of figures.
- Q: What if the speakers cannot be told apart, giving a false 0%? → A: When no interviewer word is found, or more than 20% of the words belong to no known person, the interview shows "Speakers not identified" with its reason, a link to say who speaks in its view, and no figure. It is not measurable.
- Q: Should the tab show how many interviews were reviewed? → A: Not for now: the tile was removed at the product owner's request. The figures cover the reviewed interviews, and each row shows its state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how the interviews were conducted (Priority: P1)

The person opens the study's Quality tab. Without any AI, they see the speaking times: the share of words of the interviewers and of the interviewees, and the minutes when the transcript has timestamps. They activate "Review the interviews": a confirmation shows how many interviews will be read and the estimated cost. Once read, the description adds the counts: how many questions and sentences the interviewers said, how many are leading, how many are simple reformulations (they rest only on what the interviewee said, to check understanding; never counted as leading) and how many are reformulations with opinion. These are facts to read, not a grade: no score, no verdict.

**Why this priority**: A team must see at a glance how its interviews went before trusting what came out of them. The prototype's verdicts and thresholds did not convince; plain figures can be checked.

**Independent Test**: With an interview of 1,000 words, 250 of them spoken by the interviewer, in which the interviewer asks 20 questions of which 3 are leading and makes 5 simple reformulations and 1 reformulation with opinion, the tab shows 25% of words for the interviewer, "3 leading out of 20 questions", "5 simple reformulations" and "1 reformulation with opinion", without any score.

**Acceptance Scenarios**:

1. **Given** a study with validated interviews, **When** the person opens the tab, **Then** before any review it shows "No interview reviewed yet" and the Review action, each interview with its state and a dash for its figures and cost, with no AI call; once reviewed, the speaking times computed by the app are shown for those interviews.
2. **Given** interviews with timestamps on only some turns, **When** the speaking times are shown, **Then** the shares are in words and the minutes are shown only for interviews whose turns all have timestamps.
3. **Given** the person activates "Review the interviews", **When** the confirmation opens, **Then** it shows the number of interviews, the estimated cost and, the first time, that the text of the transcripts with known names replaced is sent to their AI provider; nothing runs before it is confirmed.
4. **Given** a reviewed interview, **When** the figures are shown, **Then** they read as counts out of a total with their breakdown ("3 leading out of 20 questions: 1 agreed, 2 no opinion"; "1 disagreed, not counted").
5. **Given** a review, **When** it ends, **Then** its cost is shown on the tab (this review and the study's total) and on each interview's row, and recorded in the usage ledger.

---

### User Story 2 - Read the flagged sentences and give an opinion (Priority: P1)

Below the figures, the person reads the list of **remarks**. Each one shows the interviewer's exact sentence, what was said just before and the answer that followed, why it is flagged, and a recommended wording. They say whether they **agree** or **disagree** with the remark. It is an opinion: nothing is applied, nothing changes in the transcript.

**Why this priority**: The value is in reading real sentences with a better wording next to them; this is what makes the next interview better. The AI can be wrong, so people must be able to say so, and the figures must show it.

**Independent Test**: With a remark on "You find this too complicated, right?", the person sees the sentence, the context, the reason and a wording such as "How did this step go?". They disagree: the transcript is unchanged, the figures go from "3 leading out of 20: 3 no opinion" to "2 leading out of 20: 2 no opinion; 1 disagreed, not counted", and they can change their opinion back.

**Acceptance Scenarios**:

1. **Given** a remark, **When** it is shown, **Then** it has the interviewer's name or label, the interview, its kind (leading question, reformulation with opinion, opinion or suggestion), the exact sentence, the interviewee's words just before and just after, the reason and the recommended wording.
2. **Given** a remark, **When** the person gives "Agree" or "Disagree", **Then** the opinion is kept with who and when, the version seen is checked ("changed meanwhile"), the choice made is highlighted, and it can be changed or withdrawn.
3. **Given** a remark, **When** an opinion is given, **Then** no transcript, fact or other object changes.
4. **Given** remarks with opinions, **When** the figures are shown, **Then** the total comes with its breakdown ("3 leading out of 20: 1 agreed, 2 no opinion"; "1 disagreed, not counted"): a remark without an opinion counts until someone disagrees, and a disagreed remark no longer counts but stays visible.
5. **Given** the list, **When** the person filters by kind or by opinion (no opinion, agree, disagree), **Then** the figures stay those of the view and the list shows how many remarks match.

---

### User Story 3 - Tell a simple reformulation from a reformulation with opinion (Priority: P1)

When the interviewer restates what the interviewee said to check they understood ("So if I follow you, you export it every week?"), this is good practice: a **simple reformulation**, counted apart, with no remark. When the reformulation adds something the interviewee did not say ("So you export it every week because the tool is too slow?", when they never mentioned slowness), it is a **reformulation with opinion**: it gets a remark that names what was added.

**Why this priority**: This error made the prototype's results untrustworthy: if good practice is flagged, people stop reading the remarks.

**Independent Test**: On a reference set of interview excerpts holding simple reformulations and reformulations with opinion, at most 1 in 30 of the first is flagged (SC-001), and at least 80% of the second are, with the added element named (SC-002).

**Acceptance Scenarios**:

1. **Given** a reformulation that only restates what the interviewee said, in other words or not, **When** the interview is read, **Then** it is counted as a simple reformulation, without a remark.
2. **Given** a reformulation that adds an idea, a cause or a judgement, **When** the AI flags it, **Then** the remark names the added element.
3. **Given** a reformulation with opinion proposed by the AI, **When** the added element it names is found in what the interviewee said earlier in the interview, **Then** the app drops the remark, counts the sentence as a simple reformulation and counts it as "left out".
4. **Given** the filter "Simple reformulations", **When** the person reads the list, **Then** each one shows its sentence and context, and they can requalify it as a reformulation with opinion by writing the reason (a recommended wording is optional): it becomes a remark from that person, counted and marked agreed, with no AI call.
5. **Given** a remark a person made this way, **When** they withdraw it, **Then** the sentence is a simple reformulation again.

---

### User Story 4 - Switch between overall, per person and per interview (Priority: P2)

The tab has three views of the same content: **Overall** (the study), **By person** (each interviewer) and **By interview**. In the last two, a row per person or per interview shows its figures once reviewed. Selecting a person limits the figures and the remarks to them; an interview's title is a link that opens it to read in the tab, and its row's own button reviews that interview alone.

**Why this priority**: Overall shows the study's trend; by person lets an interviewer work on their own habits; by interview shows which interviews to read with care.

**Independent Test**: With two interviewers and three interviews, one of them conducted by both, the three views show the same remarks; a remark belongs to the person who said the sentence; the sum of the rows' leading counts equals the overall count.

**Acceptance Scenarios**:

1. **Given** the Overall view, **When** it is shown, **Then** the shares and the counts cover every interview, each word and each sentence counting once (not an average of percentages).
2. **Given** the By person view, **When** it is shown, **Then** each interviewer has a row with the interviews they conducted, their share of the words of those interviews and their counts; rows are in name order, never ranked by a figure.
3. **Given** the By interview view, **When** it is shown, **Then** each interview has a row with its state, shares, counts and cost (a dash until reviewed), a link opening it, and a button by state: "Review", "Review again", "Review anyway" when not measurable, none without a transcript or while it is read.
4. **Given** an interview conducted by two interviewers, **When** it is viewed by person, **Then** each sees only their own words and sentences, and the interview's interviewee share is unchanged.
5. **Given** anonymisation is on, **When** the views are shown, **Then** interviewers appear with their interviewer label and interviewees with their pseudonym.

---

### User Story 5 - Follow and repeat the review (Priority: P3)

Each interview shows its state: "Not reviewed", "Reviewing", "Reviewed", "To review again", "Not measurable", "No transcript". A review can be stopped, and an interview can be reviewed alone. Reviewing again keeps every opinion given.

**Why this priority**: Interviews arrive during fieldwork: the team reviews the first ones to improve the next ones, and adds the others as they come.

**Independent Test**: With a reviewed interview holding one agreed and one disagreed remark and one without an opinion, a new review keeps the first two untouched, replaces the third with what it finds and never flags again the disagreed sentence.

**Acceptance Scenarios**:

1. **Given** a review in progress, **When** the person looks at the tab, **Then** each interview shows where it stands, the review can be stopped and what was found is kept.
2. **Given** a remark someone agreed or disagreed with, **When** the interview is reviewed again, **Then** the remark is kept as it was; a sentence with a disagreed remark is not flagged again.
3. **Given** the analysed text of a reviewed interview changes, **When** the tab is shown, **Then** the speaking times are recomputed, each remark is looked for again in the new text, one no longer found is flagged "text changed" and never deleted, and the interview shows "To review again" only when a remark was lost or turns changed outside the corrections.

---

### Edge Cases

- No validated interview: the tab explains that interviews are validated in Fieldwork, with a link.
- An interview without transcript: listed as "No transcript", with no figures.
- A file without speaker turns (a summary, spec 009): listed as not measurable, with no figures and not read.
- More than 95% of the words spoken by interviewers: shown "Not measurable" with a reason (probably a speaker labelling problem), and left out of the overall figures and the overall list of remarks; a review skips it, and its row offers "Review anyway", whose figures and remarks show on that interview alone.
- A speaker not identified: with one interviewee and one interviewer, attribution follows spec 012; otherwise the turns are shown as "Speaker not identified", their words are counted apart and only those turns are skipped by the review, the rest of the interview being read; the number of turns skipped is shown until a person attributes them.
- An interview without any known interviewer: the speaking times show "Speaker not identified" and nothing can be read until a person attributes a speaker.
- A transcript without punctuation: the app cuts sentences at sentence ends, so such a turn is one sentence; a remark shows the exact excerpt concerned, and the tooltip says how sentences are counted. Fragments of at most 2 words ("OK.", "I see.") are not counted.
- A generic speaker label with several interviewers: the sentences are counted in an "Interviewer not identified" row, so the rows still add up to the overall figures.
- A sentence the AI quotes that is not found word for word in that interviewer's turn, or a remark placed on an interviewee's turn: dropped and counted as "left out".
- A sentence reading a leading guide question aloud: flagged like any other.
- Two remarks on one sentence: kept once, with the first kind found.
- The provider fails on a part: retried once, then the interview fails with its reason; the others go on.
- An interview reopened or excluded in Fieldwork: no longer listed nor counted; its remarks and opinions are kept and deleted only with its session.
- An interviewer account deleted: the person's row keeps the anonymised name of the roster.
- Two people give an opinion on the same remark at once: the second is told it changed meanwhile.
- A cleaning, lexicon reading or facts reading of the study is running: the review waits for it to end, and the reverse.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The study MUST have a Quality tab, available as soon as it has a validated interview, that blocks no other phase and is blocked by none but the validation of the interviews.
- **FR-002**: The app MUST compute the speaking times without AI, from the analysed text (spec 012 FR-002): the share of words of interviewers and interviewees, and the minutes when all the turns of an interview have timestamps, and show them only for interviews reviewed. Shares over several interviews MUST be computed on the summed words, never as an average of percentages. An interview with more than 95% of interviewer words MUST be shown "Not measurable"; one with no interviewer word, or more than 20% of the words of no known person, "Speakers not identified" with a way to say who speaks. Both have no figure and are left out of the overall figures. Speakers are told apart over all the labels of the interview: the only label left goes to the only interviewer of the roster, and a label is never given to the interviewee by default when someone else speaks.
- **FR-003**: A **review** MUST read the analysed text of each interview in full, in overlapping parts of about 60 turns, with the study's research goal and the interview guide, and ask the AI to classify each sentence of an interviewer's turn, as cut by the app, as `question`, `simple-reformulation` (rests only on what the interviewee said) or `other`, and to flag those that orient the answer, with for each flagged sentence: its turn, its exact text, its kind (`leading-question | reformulation-with-opinion | opinion`), a reason of at most 200 characters in English and French, a recommended wording in the interview's language and, for a reformulation with opinion, the element added.
- **FR-004**: The app MUST keep a remark only when its sentence is found word for word in that turn (ignoring case, spaces and apostrophe style), the turn is spoken by an interviewer and, for a reformulation with opinion, the element added is named and not found in what the interviewees said earlier in the interview. A reformulation with opinion failing the last check MUST count as a simple reformulation; other failures MUST be dropped; all are counted as "left out".
- **FR-005**: The AI's instructions MUST state that a simple reformulation, restating the interviewee's words even with a question mark or other words, is good practice and never flagged, and that when in doubt nothing is flagged.
- **FR-006**: The counts MUST be computed by the app from the kept classifications and remarks: questions, other sentences, leading questions, opinions, simple reformulations and reformulations with opinion (the last two always apart), each shown as a number out of its total. No score, grade, ranking, colour verdict or threshold verdict MUST appear on an interview or a person. A tooltip on each indicator, reachable by keyboard, MUST give its reference value (interviewer talk share 30% at most, leading sentences 5% at most) and how it is counted; a reference value never changes how a row is shown.
- **FR-007**: A person MUST be able to agree or disagree with a remark, and to change or withdraw that opinion. An opinion is shared by the team, records who and when, checks the version seen, and changes nothing else in the app. The words "accept" and "reject" MUST NOT be used for it.
- **FR-008**: A disagreed remark MUST no longer count as leading, and a remark without an opinion MUST count as leading. Every total of leading sentences MUST come with its breakdown: agreed, no opinion, and disagreed (not counted). The review policy of the project (auto or manual) does not apply to remarks.
- **FR-008a**: A filter MUST list the simple reformulations with their context, and a person MUST be able to requalify one as a reformulation with opinion by writing the reason (recommended wording optional), with no AI call. The remark has the origin `person`, counts as agreed, records who and when, is shown as written (not translated), survives a new review, and when withdrawn returns the sentence to a simple reformulation.
- **FR-009**: The tab MUST offer the views Overall, By person and By interview over the same remarks and counts, with filters by kind and opinion; rows MUST be in name order (person) or date order (interview), never ranked by a figure. A remark and a sentence belong to the interviewer who spoke them; the sum of the rows MUST equal the overall counts.
- **FR-010**: Each remark MUST show the interviewer, the interview, its kind, its exact sentence, the interviewee's words just before and just after, the reason in the viewer's language, the recommended wording and a link to the place in the transcript, in the interview's view of the Quality tab (`phase=quality&interview=&turn=`). That view MUST work on an interview without facts and before a review (opening it imports its transcript, at no AI cost), mark flagged sentences in place with a text marker, and scroll between a remark and its sentence both ways.
- **FR-011**: A new review of an interview MUST keep the remarks with an opinion, replace those without one, and never flag again a sentence whose remark was disagreed with, even once a word of it was corrected (nearly the same words, when the remark is no longer found).
- **FR-012**: When the analysed text changes, the app MUST recompute the speaking times, look for each remark again at no AI cost, and flag those no longer found "text changed", never deleting them. The interview MUST show "To review again" only when a remark is lost, when turns changed outside the corrections, when who counts as an interviewer changed, or when the anonymisation or the text-analysed setting changed. Under anonymisation, what a review stored shows the codes, never the names.
- **FR-013**: A review MUST run in the background, one per study at a time and not while a lexicon reading, a cleaning or a facts reading of the study runs (and the reverse), show the state of each interview, allow stopping it, keep what was found, retry a failed part once, and not let one interview's failure stop the others. Each interview MUST be reviewable alone. A confirmation MUST show the number of interviews and the estimated cost first.
- **FR-014**: The names the app knows MUST be replaced by placeholders in everything sent to the AI, whether anonymisation is on or off, and read back only inside the app (spec 012 FR-007). Before a person's first review, a confirmation MUST say that the text of the transcripts, known names replaced, is sent to their AI provider; it is asked again when the provider changes.
- **FR-015**: Each AI call MUST go through the AI Gateway with the person's own AI connection and be recorded in the usage ledger with what it was for and which interview. The Quality tab MUST show the cost of the last review and the study's total, and each interview's row what its reviews cost, whoever ran them.
- **FR-016**: Reading and giving an opinion MUST follow the study's access rules (spec 002 FR-010a); any person with access to the study sees all three views, including every person's figures and remarks.
- **FR-017**: All texts MUST exist in English and French. The tab and its dialogs MUST meet WCAG 2.2 AA, and an opinion or a kind MUST never be shown by colour alone.

### Key Entities

- **Evaluation** (per interview, Interview Quality context): the review of one interview: state, the text it was read on, the sentences' classification counts per interviewer, how many were left out, its cost reference. Replaces the prototype's neutrality verdicts.
- **Interviewer sentence**: one sentence of an interviewer's turn, as cut by the app and classified: `question`, `simple-reformulation` or `other`. Only its counts per speaker are kept, plus the text of simple reformulations and of remarks.
- **Remark**: a flagged sentence: interview, interviewer, turn, place, exact text, kind, reason (English and French), recommended wording, added element, origin (`ai | person`), "text changed" flag, version.
- **Opinion** (`stance` in code, to tell it from the remark kind `opinion`; "avis" in French): on a remark, `agree` or `disagree`, with who and when; shared by the team; changes only the counts.
- **Review run** (per study): one "Review the interviews": who started it, the interviews it covers, state per interview, stopped or finished, its cost reference.
- **Talk share and speaking times**: computed at read time from the analysed text; never stored as an opinion of the AI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a reference set of at least 30 simple reformulations in English and French, at most 1 is flagged (measured on real provider runs before release).
- **SC-002**: On a reference set of reformulations with opinion, at least 80% are flagged, each with the added element named.
- **SC-003**: Every remark is found word for word in an interviewer's turn of the analysed text (tested).
- **SC-004**: All speaking times and counts are computed by the app; the same data always gives the same figures, and the rows of each view add up to the overall figures (tested).
- **SC-005**: No name the app knows is sent to an AI provider (tested).
- **SC-006**: Every AI call of a review appears in the usage ledger, and the cost on the tab equals the sum of the ledger entries of the study's reviews (tested).
- **SC-007**: An opinion changes the counts and nothing else (tested).
- **SC-008**: A person can read and give an opinion on the remarks of a one-hour interview in under 10 minutes.
- **SC-009**: Reviewing 30 one-hour interviews completes in under 30 minutes with a standard AI provider, and the page stays usable meanwhile.
- **SC-010**: The tab and its dialogs have no axe violation in light and dark themes.

## Assumptions

- The Quality tab sits between Enrichment and Analysis, the order of the prototype, and can be used during Fieldwork.
- The review reads the same text as the facts: the study's "text analysed" setting (spec 012).
- Flagged kinds are limited to what orients the answer: leading questions, reformulations with opinion, opinions or suggestions. Other writing faults (double, hypothetical, closed without leading) get no remark in this version.
- The thresholds of the context map stay in the best-practices document (spec 006), which keeps using them as guidance; the tab shows them only as reference values in tooltips, never as a verdict. The 5% reference was a share of words in the prototype and is read here as a share of sentences, as a guide only.
- One opinion per remark, shared by the team; the last one given stands, with who and when.
- Any member of the team (or an admin) with access to the study sees the per-person view; no separate role.
- The estimate uses the text size of the parts and the person's model price (spec 005); the real cost comes from the ledger.
- Out of scope: guide coverage, link to verbatims and facts, effect on insight confidence, missed follow-ups, key takeaways for the next interview, evolution charts, cross-study views, debrief deck.
