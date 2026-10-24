# Research: Assistant chat in a side panel

## R1. Streaming transport

- **Decision**: `POST /api/assistant/conversations/:id/messages` answers `text/event-stream` (server-sent events over fetch, read with a `ReadableStream` on the client): events `message` (ids), `text` (delta), `proposal` (card), `done` (status), `error` (failure code). Stop = the client aborts the request; the server keeps the partial text with status `stopped`.
- **Alternatives considered**: AI SDK UI message stream + `useChat` (ties the client and the persistence format to the SDK); websockets (more infrastructure, no need for server push outside an answer).

## R2. Actions: proposal tools without execution

- **Decision**: the gateway accepts tools `{ name, description, inputSchema }` with no execution. The runner passes them to the AI SDK without `execute`, so a tool call ends the model's step and comes back as a stream part. The assistant validates the input (Zod + the same rules as the forms + the person's access), stores a proposal, and shows a card. When the person applies or dismisses it, the outcome is stored and sent to the model as the tool result in the next turn.
- **Rationale**: constitution IV (AI proposes, humans decide) without the SDK's approval protocol leaking into our domain.
- **Tools**: `create_project { name, teamId, goal }`, `update_project_goal { projectId, goal }`, `rename_project { projectId, name }`, `create_study { projectId, name }` (type interviews), `rename_study { studyId, name }`.

## R3. Page context

- **Decision**: the client sends a page reference `{ kind: 'project' | 'study' | 'home' | 'teams' | 'members' | 'sources' | 'other', id? }`; the server builds the context with the research queries of the person (project detail + its studies; study detail + project; folder name through the ingestion study access) and the person's teams. Context is a short structured text in the system instructions, refreshed at each message.
- **Never**: file names, file contents, other people's data beyond team names.

## R4. History budget

- **Decision**: the 30 most recent messages within 40 000 characters (newest kept first), plus the proposals of those messages as tool call/result pairs.

## R5. Panel

- **Decision**: `AppShell` gets an `aside` slot on the right: on ≥ 768 px a column whose width animates from 0 to 400 px (`transition-[width]` 200 ms, content translates in), the main column narrows; below 768 px a full-screen layer. `motion-reduce` disables the transition. Open state in `localStorage` (`goodresearch.assistant`). Escape closes when focus is inside. The button is a toggle (`aria-pressed`, `aria-controls`).

## R6. Rendering model text

- **Decision**: a small Markdown subset renderer (paragraphs, lists, bold, italics, inline code, code blocks, https links) producing React elements, no `dangerouslySetInnerHTML`.

## R7. Dev and test stack

- **Decision**: the fake runner answers scripts: a message containing `propose goal` yields a `update_project_goal` call for the project in context; `propose study` a `create_study`; anything else streams "You said: <message>" word by word.
