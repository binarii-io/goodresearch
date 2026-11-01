# Quickstart: Project home

Prerequisites: the dev stack running (`docker compose -f compose.yaml -f compose.dev.yaml up --build`).

1. **New project**: create a project. Every count is 0, Interviews is the next step, no cost shows.
2. **In progress**: open a project with validated interviews and undecided facts. Facts is the next step with the number left; a study's chips match its Fieldwork and Analysis screens; focusing a cost reveals its breakdown.
3. **Finished**: decide everything and write the key takeaways. The band appears under the goal, Debrief shows a check mark, no step is marked next.
4. **Access**: as a member without access to a study's folder, its card shows only name and type and the page says the counts leave it out.
5. **Language and width**: switch to French; narrow to 320 px: the cards stack, no horizontal scroll.

Checks: `pnpm check`, `pnpm test`, `pnpm e2e`, `pnpm generate`, `pnpm --filter @goodresearch/web i18n:extract`.
