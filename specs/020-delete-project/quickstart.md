# Quickstart: validate the journey

## Automated

```sh
pnpm check
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
pnpm test
pnpm generate && pnpm --filter @goodresearch/web i18n:extract
docker compose -f compose.yaml -f compose.dev.yaml up --build   # in another terminal, compose.yaml stack stopped
pnpm e2e
```

Expected: `delete-project.spec.ts` refuses a wrong name, deletes with the right one, and finds the study on the team's Studies page; the card does the same.

## By hand

Run the scenarios of [the journey document](../../docs/agent-journeys/03-delete-project.md#how-we-verify-it) in English and French. Use a project made for the test: nothing can be restored without a database backup.
