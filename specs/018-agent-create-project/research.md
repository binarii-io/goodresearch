# Research: Create a research project with the assistant

## R1. Telling the model why a proposal was refused

- **Decision**: `create_project` becomes a tool run during the answer, like `check_guide_questions`. On refusal it returns the reason and records an `invalid` proposal; on success it records the card, emits it, and returns "Card shown: wait for the person's decision, add nothing."
- **Rationale**: today it has no execution, so the answer ends on the call and the model only learns the outcome at the next message.
- **Cost**: a valid proposal takes one more model step, which is usually an empty text. It is rare (once per project) and recorded in the ledger like any step.
- **Alternatives**: a custom stop condition to skip that step ties the use case to the runner; rejected for now (IX).

## R2. Ordering between the progress report and the proposal

- **Decision**: `report_project_progress` stays recorded at once and ends the answer, like the guide's. When every point is done, the assistant summarises and asks whether it may propose; `create_project` comes in the next answer.
- **Rationale**: the guide skill already works this way (PR #6 review: running a report costs a model step for a "Recorded"). A run tool executes while the stream is read, so a report and a proposal in the same step have no guaranteed order. With this flow, a same-step proposal can at worst be refused, with its reason. The person also gets a final confirmation of what was understood.
- **Effect on the spec**: FR-019 and acceptance scenario US1.6 add this confirmation. It fits SC-003 (at most one confirmation exchange).
- **Alternative**: run the report during the answer; rejected for the extra step at every answer.

## R3. Checking the framing

- **Decision**: at the proposal, read the conversation's proposals again from the store, and apply the pure rule `currentFraming`: the report with the latest `decidedAt`, ignored if a `create_project` was applied after it. Every point must be `done`.
- **Rationale**: `listProposals` has no order, so time is compared rather than position. Comparing with the apply time also covers a report made after the card was proposed but before it was applied. Reading again takes in what this answer recorded.

## R4. Where the method lives

- **Decision**: a skill `project-framing`, listed on every page, with `load_skill` and `report_project_progress` offered on every page. `interview-guide-design` and its tools stay limited to interview study pages.
- **Rationale**: same mechanism as the guide, and no extra tokens in every message. The instructions say to load it before framing. If the model skips it, the proposal is refused because no report exists.
- **Change required**: `runFor` no longer requires a guide study. The "guide tools are only on a study page" hint applies only when the guide skill is loaded.

## R5. The goal

- **Decision**: the tool takes `name`, `teamId`, `question`, `objectives`, `hypotheses`. The pure `composeGoal(parts, language)` builds the text with headings in the panel's language; empty hypotheses read "None yet" / "Aucune pour l'instant". Stored values keep `goal`, `name` and `teamId`, plus the parts so the history replays the model's call. Apply reads `goal`.
- **Rationale**: Apply and older pending cards work unchanged (FR-014), and the project's goal stays one text (assumption of the spec). The card's existing goal row shows the composed text, so `ProposalPreview` keeps its shape.
- **Replacing a card**: when a new card is recorded, an open `create_project` of the conversation becomes `dismissed`, so two cards cannot both create a project.
- **Checks**: empty question or objectives, composed goal over the 10,000 limit, unknown team: refused, each with its reason.

## R6. Continuing after Apply

- **Decision**: `POST /api/assistant/conversations/:id/continue`, server-sent events like messages. It answers `NOTHING_TO_CONTINUE` unless the conversation's last message is a finished assistant answer holding an applied `create_project`. The use case `send` is split so that the person's message is optional.
- **Rationale**: Apply stays a plain command; the server guard makes a double call harmless, since the first call adds a later message. The model reads "Applied by the person (id …)" from the existing tool outcome, and the skill tells it to propose a first study. The page sent is the new project, so its id is in the context.
- **Web**: after Apply succeeds on a `create_project`, the card tells the panel; the panel navigates and starts the continuation as soon as it is not busy. `NOTHING_TO_CONTINUE` is ignored silently: the conversation went on, so the page opening is enough. A live answer without a person's text shows no person bubble.
- **Alternatives**: a hidden person message would be visible in history and count as the person's words; relaunching inside the Apply request mixes a command and a stream.

## R7. Progress bar

- **Decision**: `GuideProgressBar` becomes `ProgressBar`, showing the latest report of either kind, with its own title and points. A framing bar disappears once its project is applied.
- **Contracts**: `GuideProgress` item keys are widened with the five framing points.

## R8. Test provider

- **Decision**: add to the script: "help me create a project" loads the skill then reports; "framing answered" reports all done; "propose the project" calls `create_project`; after a tool result "Applied" on `create_project`, propose a study.
