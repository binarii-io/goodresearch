# Quickstart: Product identity, design system and app shell

## Prerequisites

`pnpm install`; dev stack: `docker compose -f compose.yaml -f compose.dev.yaml up -d --build --wait server`.

## Validate

1. `pnpm --filter @goodresearch/ui storybook`: every story in the new identity; toggle the dark theme (OS setting); the a11y panel shows no violation.
2. Open http://localhost:3000/sign-in: wordmark, paper background, product favicon in the tab. DevTools Network: no request outside `localhost`.
3. Sign in (mock provider): sidebar with Research projects (+), Teams, Members (admin), account at the bottom; collapse it, reload: still collapsed.
4. Home: create two teams and projects; choose a team folder (the address gets `?team=`), choose it again (filter removed); open a project from its card.
5. Open a study: header with back link, overline, pills; phases tabs open on Analysis; switch to Preparation, reload: still Preparation.
6. Resize to 360 px: menu button opens the navigation; no horizontal scroll.
7. `pnpm test` (stories + axe) and `pnpm e2e` (pages + axe) pass.
