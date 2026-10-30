# Feature Specification: Debrief deck

**Feature Branch**: `015-debrief-deck`

**Created**: 2026-10-29

**Status**: Draft

**Update 2026-10-29** (after a first review): the slides follow the prototype's design and content; the limits and open questions slide is left out for now (product decision); who does what comes from the data; a print/PDF export is added; insights are numbered most solid first.

**Input**: User description: "The last step of the project synthesis, as in the prototype: the debrief deck (« Restitution »), 16:9, built from the project's data: title, key takeaways, context, method, panel, insights overview then one per slide, nuances, recommendations table and the impact × effort matrix, limits, next steps, thanks. Generated on the fly, never stored; what is not validated is left out by default, or shown marked « to validate » on request. It goes out of the app as a Google Slides presentation in the Drive folder of one of the project's studies."

## Clarifications

### Session 2026-10-29

- Q: Is the deck stored as versions retouched slide by slide, or built on the fly? → A: Built on the fly from the project's data each time it is opened, as in the prototype; a person changes the data (insights, recommendations, key takeaways), not the slides. The few texts that belong only to the deck (limits, next steps) are edited in place in the deck and kept with the project.
- Q: What about what is not validated? → A: Only what is validated by default; an option adds what is still to decide, marked "to validate" on each slide it appears on (the chain stays open, and what is not verified is shown as such).
- Q: How does the deck leave the app? → A: As a Google Slides presentation published in the Drive folder of one of the project's studies (the publishing of spec 007), updated in place on request.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the debrief deck of the project (Priority: P1)

The project page gets a fourth tab, "Debrief". It shows the deck as a series of 16:9 slides in the brand's look, built from the project as it is, as in the prototype: a title slide on ink (interviews, period, participants, team), what to remember (the key takeaways and the top three recommendations), the research question, the method (one card per study with its retained interviews and guide themes), the interviews in numbers (with the participants), the insights at a glance (what works, what holds back, the other findings), one slide per insight, what we also heard (nuances), the recommendations, the impact × effort matrix with its named quadrants, who does what, and a thank-you slide. The person reads it as thumbnails, presents it full screen with the keyboard, or prints it (PDF).

**Why this priority**: The debrief is what the team shows to the people who asked the research question; until now, the findings stayed in the app's tabs.

**Independent Test**: With a project of two studies, five validated insights (one with counter-evidence), three validated recommendations and saved key takeaways, the Debrief tab shows 15 slides in the order above, with the takeaways' text, the five insights each on its slide with confidence and polarity as text, the counter-evidence on the nuances slide, and the three recommendations in the table and in the matrix; nothing still to decide appears.

**Acceptance Scenarios**:

1. **Given** a project, **When** the person opens Debrief, **Then** the deck is built from the project's data at that moment: nothing is stored, and a change in Insights or Recommendations shows the next time it is opened.
2. **Given** the deck, **When** it is shown, **Then** the slides come in this order: title; what to remember; context; method; numbers (with the panel); insights at a glance (by polarity, 6 rows a slide); one slide per insight (numbered by confidence, then supporting participants, then facts); nuances (4 a slide); recommendations (6 rows a slide, by priority); impact × effort matrix; next steps; thanks. A section without content is left out (no empty slide), except the title and the thanks.
3. **Given** an insight slide, **When** it is shown, **Then** it gives its number, polarity and theme, the statement with its confidence, the evidence (participants out of the panel, facts, description), "But" (counter-evidence, minority view) and the emblematic verbatim of its supporting facts (readable length, about 140 characters) with its participant's code (`P01`, never a name; names the app knows inside a verbatim are replaced).
4. **Given** the deck, **When** the person presents it, **Then** it fills the screen, moves with the arrow keys, Page Up/Down and Space, shows the slide number, and Escape leaves.
5. **Given** "Include what is still to decide", **When** it is ticked, **Then** insights and recommendations still to decide are added and each slide or row holding one is marked "to validate"; the takeaways slide says when they rest on items to validate, and shows the AI draft of the key takeaways not used yet, flagged as a draft to validate.

---

### User Story 2 - Publish the deck to Google Slides (Priority: P1)

The person activates "Publish to Google Slides" and chooses the folder of one of the project's studies they can write to. The app creates a Google Slides presentation of the deck in that folder and shows its link. Later, "Update in Google Slides" rewrites it in place (same file, same link) with the deck as it is then.

**Why this priority**: The deck is shown and shared from the team's own tools, not from the app.

**Independent Test**: The person publishes the deck to the folder of study A: a Google Slides file "Debrief – <project>" appears there with the same slides in the same order, and the Debrief tab shows its link and "in sync". After a recommendation is validated, the tab shows "out of date"; "Update in Google Slides" rewrites the same file.

**Acceptance Scenarios**:

1. **Given** the deck, **When** the person activates "Publish to Google Slides", **Then** they choose among the folders of the project's studies they can write to; the first time, the Drive write consent of spec 007 is asked.
2. **Given** a published deck, **When** the project's data changes, **Then** the tab shows "out of date" with the date of the last publication, and "Update in Google Slides" rewrites the same file in place, keeping its link and sharing.
3. **Given** the presentation was edited in Google Slides since it was published, **When** the person updates, **Then** they are told it was changed in Google Slides and that updating replaces those changes; it is replaced only when they confirm ("Replace the Google Slides version"). Nothing is ever deleted in Drive.
4. **Given** a person without write access to the file, **When** they update, **Then** it is refused with a clear message and the owner's name; the deck stays viewable in the app.

---

### User Story 3 - Who does what, from the data (Priority: P2)

The next steps are written by the app from the recommendations, as in the prototype; nobody has to fill them in. A limits and open questions slide is left out for now (product decision, 2026-10-29).

**Why this priority**: A debrief says what comes next; the recommendations already hold it.

**Independent Test**: With two validated recommendations (one without an owner), the next steps slide lists both with their owner, "to assign" and their success measure; no limits slide is shown.

**Acceptance Scenarios**:

1. **Given** recommendations, **When** the deck is built, **Then** the next steps slide says who does what: the validated recommendations (or those shown when none is), with their owner or "to assign" and their success measure.

---

### Edge Cases

- No validated insight and the option not ticked: the tab explains that the deck shows validated insights and recommendations, with links to those tabs and the option.
- No study with a Drive folder the person can write to: publishing is not offered, with the reason.
- More than 12 insights: one slide each still; the overview slide lists them by theme.
- More than 10 recommendations: the table goes on over several slides; the matrix shows them all with their numbers.
- A verbatim longer than 300 characters: cut at a word, with "…".
- The language of the deck is the viewer's for the tab, and chosen for a publication (English or French).
- The published file was deleted or moved to the trash in Drive: the next update says so and offers to publish a new one.
- Two people update at once: the second is told it was just updated.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project page MUST have a fourth tab, "Debrief", that shows the deck built from the project's data at the moment it is opened; the deck MUST NOT be stored.
- **FR-002**: The deck MUST hold, in this order and in the prototype's layout, the slides: title (project, interviews, period, participants, team); what to remember (key takeaways of spec 014, top three recommendations); context (research goal, studies); method (per study: retained interviews, guide themes and question count); numbers (interviews, participants, studies, guide themes, period; with "still to decide", the participants known only from such facts, said so; no separate panel slide); insights at a glance (what works, what holds back, the other findings: number, statement, theme, confidence, participants/panel); one slide per insight; nuances (not "None"); recommendations (number, action, kind shown, impact, effort, evidence: the lowest confidence of its insights); the impact × effort matrix (named quadrants, numbered chips by kind, legend); who does what; thanks. A section without content MUST be left out, except the title and thanks.
- **FR-003**: By default, only validated (and edited) insights and recommendations MUST be shown. With "Include what is still to decide", those still to decide MUST be added and every slide or row holding one MUST be marked "to validate"; rejected ones never appear.
- **FR-004**: The deck MUST never show a person's name: participants appear as their codes, and names the app knows inside a verbatim are replaced; owners appear as written (a role or a team).
- **FR-005**: The tab MUST offer an overview (all slides as thumbnails), a presentation mode (full screen, keyboard: arrows, Page Up/Down, Space, Home, End, Escape; slide number shown) and a print (one slide per page, to PDF). A slide whose content runs over shrinks to fit (down to 60%).
- **FR-006**: The next steps MUST be written by the app from the recommendations (User Story 3); no limits slide for now (product decision, 2026-10-29).
- **FR-007**: "Publish to Google Slides" MUST create, with the acting person's own Drive write access (spec 007 FR-002), a Google Slides presentation of the deck in the folder chosen among the project's studies' folders they can write to, in the language chosen, and show its link.
- **FR-008**: The project MUST keep its published deck: the file, the folder, the language, who published it and when, and what the deck was built from (to tell "out of date"). "Update in Google Slides" MUST rewrite the same file in place.
- **FR-009**: When the presentation was changed in Google Slides since it was published or updated, an update MUST say so and replace it only once the person confirms; the app MUST NOT delete or trash any file (spec 007 FR-002a).
- **FR-010**: Building the deck, publishing and updating MUST follow the project's access (spec 002), and only studies whose folder the person can open count for publishing; facts and verbatims of a study the person cannot open MUST NOT appear in their deck (counts only, as spec 013 FR-018).
- **FR-011**: No AI call is part of this feature.
- **FR-012**: All texts MUST exist in English and French; the tab, the presentation mode and the dialogs MUST meet WCAG 2.2 AA; confidence, polarity, kind and "to validate" MUST never be shown by colour alone; the slides keep a readable contrast in light and dark themes.

### Key Entities

- **Debrief deck** (Reporting, read model): the slides built from the project's data; never stored.
- **Published deck** (Publishing, per project): the Google Slides file, its folder, its language, who published or updated it and when, the presentation's content revision at that moment, and what the deck was built from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The deck of a project with 10 insights and 8 recommendations opens in under 2 seconds.
- **SC-002**: No person's name appears in a deck or in a published presentation (tested).
- **SC-003**: The published presentation has the same slides, in the same order and with the same texts, as the deck in the app (tested on the generated file).
- **SC-004**: An update never replaces changes made in Google Slides without the person's confirmation (tested).
- **SC-005**: A person can go from a project with decided insights and recommendations to a shared Google Slides debrief in under 5 minutes.
- **SC-006**: The Debrief tab and the presentation mode have no axe violation in light and dark themes.

## Assumptions

- The deck reads the project's insights, recommendations and key takeaways (Synthesis) and the studies, guides and interviews (Research, Ingestion) through their public reads; it writes nothing but the published deck record.
- The presentation is written with the Google Slides API (the way spec 007 writes Google Docs), with the person's Drive write access; its look is simple and readable (title and body layouts, tables, the cover slides on the brand's ink); the app's slides carry the full design.
- The impact × effort matrix of the deck is the one of spec 014 (rows impact, columns effort, quick wins marked).
- Out of scope: retouching slides one by one, a PowerPoint download, speaker notes, other slide tools than Google Slides, the network graph and the evidence chain, interview quality and the panel's teams and roles (not built yet: participant profiles; the slides give counts only).
