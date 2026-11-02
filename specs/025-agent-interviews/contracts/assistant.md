# Contracts

## Tools

- `count_interviews { studyId }`: numbers by state, no name, no consent.
- `list_interviews { studyId, filters?, name?, page? }`: 50 a page, with the total matched. Consent of spec 024. Refused on an anonymised study.
- `propose_analysis { studyId, again? }`: a card, or the reason.
- Second pull request: `propose_accepting_suggestions`, `propose_validating_interviews`, `propose_excluding_interviews`.
