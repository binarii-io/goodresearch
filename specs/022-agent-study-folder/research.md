# Research: Attach a study's Drive folder with the assistant

## R1: One tool, two cards

- **Decision**: the model only calls `attach_folder`. The app answers with an `attach_folder` card, a `connect_source` card, or a reason.
- **Rationale**: the model need not know the connection's state, and cannot lead anyone to Google on its own.
- **Alternatives**: a separate `connect_source` tool: the model would have to guess when.

## R2: History of a connection card

- **Decision**: a `connect_source` proposal appears in the history as the `attach_folder` call that produced it, with its link.
- **Rationale**: providers reject a call to a tool that is not offered, and the next answer needs the link.

## R3: Going on after the consent

- **Decision**: the study's page, on `drive=connected`, asks the panel to continue. The server accepts only if the last answer holds an open `connect_source` card and the person's Drive is connected, then marks the card applied.
- **Rationale**: the query string can be forged; the server's check makes a forged one harmless, and a second call finds nothing to continue. A refused consent returns `drive=error`, which continues nothing.
- **Alternatives**: a callback from the OAuth route to the assistant: couples ingestion to the assistant, and cannot stream.

## R4: Never replacing

- **Decision**: `attachFolder` gains `onlyIfNone`; the card uses it, the form does not. New error `FOLDER_ALREADY_ATTACHED` (409).
- **Rationale**: replacing discards interviews, and the form states it.
- **Concurrency**: the card writes with an insert that does nothing when a folder exists, so the database decides. A form can still replace, as it states.

## R5: Waiting for the inventory

- **Decision**: after Apply, the browser reads the source every two seconds until the inventory is no longer running, one minute at most, then continues. The server gives the state in the context.
- **Rationale**: the worker has no link to a conversation; the page already polls this way.

## R6: What the model reads

- **Decision**: a port `folderState` gives the folder's name, the inventory's status and counts by kind. It reuses `studySource`, keeping only those.
- **Rationale**: groups are sub-folder names and files have names; neither is needed. People without access get nothing.

## R7: A list of choices

- **Decision**: a tool `offer_choices { question, choices: 2 to 6 labels, multiple }`, recorded at once and ending the answer, like a progress report. Selecting sends the labels as the person's next message.
- **Rationale**: models have no way to draw controls; a tool keeps validation in the app, and a plain message keeps one path for what the person says, so the model needs nothing new to read it.
- **Alternatives**: a structured answer stored on the card: a second path for answers, with no gain.
- **Usable only on the last answer**: the panel enables it from the message's position, so an old list cannot answer a newer question.

## R8: Which tab opens

- **Decision**: the folder's preview holds `opensOn`, computed when proposing: `fieldwork` when a guide exists and at least one interview is planned, otherwise `preparation`. A study created from a card opens on `preparation`. The continuation sends the tab, so the context says where the person is.
- **Rationale**: the readiness rule stays on the server, one read that the context already makes.
- **Known limit**: read when proposing, not on Apply; a guide written in between still opens Preparation, which is harmless.
