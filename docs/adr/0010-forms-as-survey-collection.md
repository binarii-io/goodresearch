---
status: accepted
date: 2026-11-02
---

# ADR-0010 — Survey responses come from the form service, not its spreadsheet

## Context and problem statement

Survey studies are collected with a form in the study's Drive folder, the team wants its usual results spreadsheet, and the app must exploit the responses (spec 027 prepares it, spec 028 reads them). The form service's documentation, read on 2026-11-02, says the link to a spreadsheet is read-only: the app cannot create it. Reading the spreadsheet would make a manual step mandatory, and rest on columns anyone can rename, move or edit.

## Decision drivers

- A response must stay tied to its item when wordings or columns change.
- The team keeps its spreadsheet, as it does today.
- Anonymity promised by the consent text must hold by default.
- Nothing is promised that the service cannot do.

## Considered options

1. **Read the linked spreadsheet**: what the team sees, and cleaning done there would count; but a mandatory manual link, and fragile columns.
2. **Read the responses from the form service, the spreadsheet staying optional**: stable question identifiers, no manual step.
3. **Read from the service and write a spreadsheet ourselves**: no manual step for the team, but a second synchronisation to build, next to the native one.

## Decision

Option 2. The app keeps a map from each item to its identity at the source, and detects the spreadsheet without reading it.

Spec 028 builds the reading, opening and protection of responses (ADR-0011).

Three consequences of the service, kept visible:

- **Randomisation is partial.** No setting orders questions across a form: options are shuffled, consecutive scales of a theme sharing a legend become a grid with shuffled rows, themes stay in order. The setting can be turned off, as grids are less comfortable on a phone. The screen says all this.
- **Identity collection is set off explicitly**, as organisation accounts collect addresses by default. It is read at each check and shown as a warning outside the sync states, since nobody could resolve it as a change to review. Spec 028 refuses to open such a form.
- **A form written by the app is read back** to learn its identities, known blocks first: creating and updating share one path. Item ids could be supplied at creation, but their format is undocumented.

Forms are created and read with the existing `drive` scope and editing consent. The Forms API must be enabled in the deployer's Google project.

## Consequences

- A cleaning done by hand in the spreadsheet is not seen by the app.
- Moving a scale in or out of a grid changes its identity at the source: harmless before responses, spec 028 must refuse it afterwards.
- Behaviour only the real service can confirm is listed in `specs/027-survey-preparation/quickstart.md`, scenario 5.
