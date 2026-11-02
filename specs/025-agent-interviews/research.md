# Research: Interviews with the assistant

## R1: One definition of each state

- **Decision**: `interview-filters.ts` defines the states from the Fieldwork view. Counts and filters share it.
- **Rationale**: "to decide" must mean the same in the count and in the list.

## R2: Reusing the Fieldwork read

- **Decision**: counts and lists read `sessionQueries.fieldwork`, keep what they need and drop the rest.
- **Rationale**: at most 500 interviews, and the same gate as the tab. It is only read when a tool asks, or when the next step reaches Fieldwork.

## R3: Pages

- **Decision**: `page` from 1, 50 interviews a page, with the total matched. No filter gives everything.
- **Rationale**: the assistant can always unblock itself without sending hundreds of interviews at once.

## R4: The analysis's consent

- **Decision**: the card states what is sent when the analysis's consent is missing, and Apply passes it to `startRun`.
- **Rationale**: the same consent as the tab, given on a card that says so.

## R5: After the analysis

- **Decision**: the browser reads the run until it ends, one minute at most, then continues; the model calls `count_interviews`.
- **Rationale**: as for the inventory (spec 022).

## R6: The next step

- **Decision**: after the guide, folder and publication: analyse, decide, validate, then the next phase. No interview found keeps Fieldwork as the step.
