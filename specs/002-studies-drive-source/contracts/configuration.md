# Configuration contract — 002 (additions)

| Variable | Required | Rules |
|---|---|---|
| `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` | no | Enable the Google Drive connector. Can reuse the Google sign-in client's values. Register `<APP_URL>/api/sources/google-drive/callback` as redirect URI, enable the Google Drive API and add the `drive.readonly` scope to the consent screen. |

Without them, studies can be created but folders cannot be attached ("Google Drive is not configured on this instance").
