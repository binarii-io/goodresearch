# Quickstart — validate 002

## A. Automated

```bash
pnpm check && pnpm test        # domain (link parsing, classification, access decisions), use cases with a fake Drive,
                               # Drive adapter with a fake fetch (only GET to Drive), API component tests
pnpm e2e                       # studies: create, list, rename, delete, "Drive not configured" state
```

## B. Manual with Google (maintainer)

1. In the Google Cloud project of your OAuth client: enable **Google Drive API**; on the consent screen add scope `.../auth/drive.readonly`; add redirect URI `http://localhost:3000/api/sources/google-drive/callback`.
2. In `.env`: `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` (same values as `AUTH_GOOGLE_*` is fine). Restart.
3. Open a project → **New study** "Interviews Q4" → **Attach a Drive folder** → explanation → Google consent → paste a folder link → inventory runs, then shows totals per kind and per group (SC-001: < 3 min; SC-002: 500 files < 1 min).
4. Add a file in Drive → **Refresh** → it appears.
5. Second team member without access to the folder in Drive: opens the study → sees name and type only.
6. Account menu → **Connected sources** → **Disconnect** → refreshing asks to connect again (SC-007).
