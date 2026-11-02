# Research: The assistant works in the study's folder

## R1: Live listing, the whole tree at once

- **Decision**: `browse_folder` lists every level of the folder live, in one call, with paths; a second call in one answer is answered without Drive. The inventory is not used.
- **Rationale**: the inventory has neither folders nor parents, and may be out of date. Opening one folder per call, the first design, took the model one step each: on a real folder it used up the steps of the answer and ended without writing.
- **Also**: the last step of an answer cannot call a tool, so an answer always ends in words.

## R2: Being inside the folder

- **Decision**: each id is checked by walking its parents up to the study's folder, at most 20 levels, with a cache for one call.
- **Rationale**: ids come from the model and must never be trusted (AGENTS.md); the person's own access could reach other files.

## R3: What is kept

- **Decision**: listings and extracts are not stored. History says the tool ran and to call it again if needed; a reading keeps only the file's name, for the panel.
- **Rationale**: less personal data at rest, smaller prompts. A few more Drive calls are acceptable.

## R4: Extracts

- **Decision**: reuse `readTextStart`, reading up to the end of the requested part, then slicing. 8,000 characters a part, 5 reads per answer, counted in the answer.
- **Rationale**: the adapter already handles documents, text, subtitles and Word files, and refuses the rest.

## R5: Consent

- **Decision**: a table `assistant_folder_consents` (person, study, provider), a card `folder_consent` applied like any other. Separate from the analysis consent.
- **Rationale**: it covers file names and any file of the folder, which the analysis consent never promised.

## R6: Unticking

- **Decision**: a route `POST /api/assistant/proposals/:id/apply-folder-changes` with the excluded lines. The server unticks dependent lines again. Generic Apply refuses the kind.
- **Rationale**: the same reasoning as `confirm-delete`; dependencies are a rule, so they live on the server.

## R7: Interviews after a move

- **Decision**: nothing to add: sessions reference file ids, and a refresh reconciles by id. Covered by a test.

## R8: The planning stops blocking

- **Decision**: `nextStep` goes guide, folder, publication, Fieldwork. Interviews are planned only if the person wants; the context says none are. Fieldwork opens without a planned interview, once a guide exists.
