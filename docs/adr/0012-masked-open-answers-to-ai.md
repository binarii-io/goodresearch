---
status: accepted
date: 2026-11-03
---

# ADR-0012 — Open answers of a survey reach the AI provider masked, one item at a time

## Context and problem statement

Spec 029 groups the open answers of a survey into themes. Reading hundreds of answers by hand is what teams skip; the AI does it well. But open answers are free text: respondents write names, emails, phone numbers. ADR-0011 left sending them to a provider to its own decision.

## Decision drivers

- What leaves the app is the least needed to propose themes.
- A person can check what was sent, and every quote shown.
- The team's own AI provider is used, as for interviews, with the cost shown.

## Considered options

1. **Never send open answers**: themes written by hand only.
2. **Send them as they are**, under the team's provider contract.
3. **Mask them first, one item at a time**, and show the masked text.

## Decision

Option 3.

- **Masked**: names the team knows (its members, the participants and people scheduled in its studies, the person terms of its lexicon) become `[Person N]`; emails `[email]`; phone numbers `[phone]`; web addresses `[link]`; other runs of 6 digits or more `[number]`. One pure function in `packages/shared`, tested.
- **Sent**: the item's wording, its counted answers, masked, each with a number local to the run, and the labels of themes rejected before ("do not propose again"). In parts of 150 answers; with several parts, one last call gets only theme labels and descriptions to merge them.
- **Find facts** (spec 029 FR-010a, a later call): only the figures the app computed and the labels and descriptions of accepted themes with their share; no answer, no quote.
- **Never sent**: the contact item, refused-consent responses, set-aside responses, any other item's answers, response ids, dates, the study's name.
- **Shown**: the screen lists the same masked text, so what a person reads is what was sent, and quotes are checked word for word against it.
- An answer with nothing left but marks is left out and counted.
- The assistant never receives answers: it can start a run after the person confirms its cost.

## Consequences

- A name the team never registered can pass. The screen says answers are **masked**, never "anonymised".
- Themes and quotes hold masked text only; nothing unmasked is stored outside the responses.
- Every call is in the usage ledger (`survey-themes:<runId>:<part>`), and its cost is shown on the item and in the Analysis tab.
