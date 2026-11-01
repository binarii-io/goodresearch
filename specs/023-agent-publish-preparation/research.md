# Research: Publish the preparation with the assistant

## R1: The next step is computed

- **Decision**: a pure `nextStep` in the assistant's domain, from guide, folder, published kinds and planned interviews; its result is a line of the context.
- **Rationale**: an answer must follow the real state, not the conversation's memory, and a pure function is testable in all five states.

## R2: Checking without writing

- **Decision**: a `checkPublication` query in publishing reads what exists and returns the kinds left, then asks for the files with write access, as `publish` does; so nobody is asked for the right to edit on a request refused anyway. Apply checks again, and publishes only what is left.
- **Rationale**: the same gate gives the same refusals, and `DRIVE_WRITE_REQUIRED` becomes the connection card.
- **Alternatives**: trying to publish and reporting: it would write.

## R3: Reusing the connection card

- **Decision**: `connect_source` holds `access: 'write'` in its preview and the kinds in its values. The history replays it as a `publish_preparation` call.
- **Rationale**: same card, same continuation, checked on the server against the access the card asks for: a consent that gave only reading continues nothing.

## R4: Time zone

- **Decision**: the card passes `UTC`.
- **Rationale**: `publish` only reads the time zone for the schedule, which is out of scope.

## R5: Links on the card

- **Decision**: once applied, the card reads the study's publications and links to them.
- **Rationale**: a proposal's result holds one id; the list is already an endpoint.

## R6: Language

- **Decision**: the conversation's language, read when proposing and kept on the card.
- **Rationale**: the same as a framed project's goal.
