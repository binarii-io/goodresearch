# Quickstart: Drive publishing

1. Dev stack (`compose.yaml` + `compose.dev.yaml`, `DRIVE_FAKE_DOCUMENTS=true`): sign in, create an interview study, attach a (fake) folder, write a guide and two planned interviews.
2. Preparation → **Publish to Drive**: consent step (fake), then three files with links and "in sync".
3. Simulate a Drive edit: `POST /api/dev/drive-documents/<fileId>/edit` (reword a question, change a status) → **Check now** → "changed in Drive · 2".
4. **Review**: accept the reworded question, reject the status change → app guide version +1 (origin "from Drive"), schedule unchanged, the rejected item marked "will be replaced".
5. Edit the same question in the app and in Drive → review shows a conflict; choose a final text.
6. **Update in Drive** with a pending change → offered to review first or replace; then "in sync".
7. Second account with view-only rights → update refused with the owner's name.
8. Automated: `pnpm exec vitest run --project api:unit` (render, parse, three-way), `--project api:int`, `pnpm e2e -- publishing`.
9. Real Google: on the OAuth consent screen add `https://www.googleapis.com/auth/drive`, enable the Docs and Sheets APIs, re-consent Drive once.
