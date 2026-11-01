# Quickstart: validate the journey

## Automated

```sh
pnpm check
pnpm exec vitest run --project api:unit
pnpm generate && pnpm --filter @goodresearch/web i18n:extract
docker compose -f compose.yaml -f compose.dev.yaml up --build   # in another terminal
pnpm e2e -- assistant-create-project
```

Expected: framing bar moves, no card before all points are done, a refused proposal shows nothing, Apply opens the project and a study card follows without a new message; a second continue call answers 409.

## By hand, with a real model

On the local stack, with an AI provider connected, run the scenarios of [the journey document](../../docs/agent-journeys/01-create-project.md#how-we-verify-it) in English and in French, from the home page and from a project page.

For each, check that the conversation's cost includes every answer, continuation included.
