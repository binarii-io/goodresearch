# Quickstart: Fieldwork sessions

## Prerequisites

Run the dev stack:

```sh
docker compose -f compose.yaml -f compose.dev.yaml up --build -d
```

It ships the fake Drive (`DRIVE_FAKE=true`). Its demo folder holds transcripts and recordings in two groups; one transcript is named after « Sam Example ».

## Scenario 1: proposals (US1)

1. Sign in, create a project and an interview study. The study opens on **2 · Fieldwork** (FR « 2 · Passation »).
2. Connect Drive and attach `https://drive.google.com/drive/folders/dev-study-folder`.
3. Once the inventory is done, check that:
   - one proposed interview shows per transcript, with its group and date;
   - the recordings are matched with a confidence and a reason;
   - the summary counts the proposed interviews.
4. Refresh the inventory: the list is unchanged.

## Scenario 2: links (US2)

1. On Preparation, plan an interview for « Sam Example ».
2. Back on Fieldwork, check that this interview suggests the planned interview with the reason "name in the file name".
3. Confirm the suggestion: the people are prefilled. On Preparation, the schedule row shows "Transcript found".

## Scenario 3: decisions (US3)

1. Validate the linked interview: its planned interview becomes Done, with no question.
2. Exclude another interview with a reason, then refresh: both decisions stay.
3. Use "Back to review" on the excluded one: it is proposed again.

## Checks

```sh
pnpm check
pnpm test
pnpm generate
pnpm --filter @goodresearch/web i18n:extract
pnpm e2e
```

- `pnpm generate` must leave no diff.
- `pnpm e2e` runs `fieldwork.spec.ts` with axe.
