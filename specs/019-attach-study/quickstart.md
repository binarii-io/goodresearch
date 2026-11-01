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

Expected: the existing e2e suite passes unchanged, except the study breadcrumb data; `attach-study.spec.ts` attaches, shares, detaches down to "No project", and attaches again.

## By hand

1. Before upgrading, note a project's counts, goal and study. After, they are unchanged and the study's goal is a copy of the project's.
2. Run the scenarios of [the journey document](../../docs/agent-journeys/02-attach-study.md#how-we-verify-it) in English and French.
3. Check the usage ledger gains nothing on attach and detach.
