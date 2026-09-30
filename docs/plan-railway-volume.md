# Plan: Store habit data on a Railway volume instead of OneDrive

## Context
The OneDrive store (`backend/src/graph/appFolderStore.ts`) has caused production problems: the 400 on the combined path, ETags that come back in the response body, and a possibly wrong ETag source (review finding #1). It also rejects fast parallel toggles with 409 (#2), and every request needs 3–4 Microsoft calls. The user chose to move the data to a Railway volume, for a **public** app. From now on, Microsoft is used **only for login**.

Expected speed gain: server-side work drops from roughly 0.5–1.5 s (sequential Microsoft calls, estimated) to about 1–5 ms (local file access). Perceived latency is then dominated by the network round trip to Railway.

Consequences the user accepted:
- The operator holds all users' (mental-health) data.
- The login text "Deine Daten bleiben in deinem eigenen OneDrive" becomes false and must change.

## Assumptions (please correct if wrong)
- No real user data exists in OneDrive that needs migrating. Production never loaded successfully because of the 400.
- A user's key is `tid.oid` from the id_token. Microsoft recommends tid+oid as the unique key across tenants.
- Old session cookies (uid without tid, containing `rt`) do not need special handling. They simply point to a new, empty file.

## Changes

### Backend
1. **New `backend/src/store/fileStore.ts`** replaces `graph/appFolderStore.ts` (delete the old file):
   - `loadData(uid)`: reads `${config.dataDir}/${uid}.json`. If the file is missing (ENOENT), it returns `emptyDataFile()` from `habits/types.ts` without writing anything.
   - `withData(uid, transform)`: same signature and pure-transform pattern as today.
     - It runs inside a per-user in-process lock (`Map<uid, Promise>` chain).
     - Each write goes to a temp file and then uses `rename` to replace the real one. Atomic, so readers never see half a file.
     - It needs no ETag, no retry and no `PreconditionFailedError`.
2. **`config.ts`:**
   - Add `dataDir: requireEnv('DATA_DIR')`. It is required on purpose: a default would silently write to the container's temporary disk in production, and all data would be lost on the next redeploy.
   - Remove `graphBaseUrl`.
3. **Auth becomes login-only:**
   - `auth/oauth.ts`: set `SCOPE = 'openid profile'`. Remove `refreshTokens` and `TokenRefreshError`. `decodeIdToken` also returns `tid`.
   - `auth/routes.ts` callback: drop the `refresh_token` check. Store `uid = \`${tid}.${oid}\`` and `name`, but no `rt`.
   - Delete `auth/graphToken.ts`.
   - `auth/requireAuth.ts`: read `request.session.get('uid')`. If it is missing, respond 401. Otherwise set `request.uid`, replacing `graphAccessToken`.
   - `types/fastify.d.ts`: remove `rt`.
4. **`habits/routes.ts`:**
   - Replace `request.graphAccessToken` with `request.uid` and switch the imports to `fileStore`.
   - Remove the now-unused 409 branch from `mapWriteError`.
   - The model (`habits/model.ts`) stays unchanged.

### Frontend
5. `frontend/src/views/LoginView.vue`: replace the privacy line with an honest one, e.g. "Deine Daten werden verschlüsselt übertragen und nur für dich gespeichert." The exact wording is the user's decision.

### Config and docs
6. `backend/.env.example`: add `DATA_DIR=./data`. Add `backend/data/` to `.gitignore`.
7. **README:**
   - Architecture: data lives on a Railway volume. Remove the OneDrive/Graph wording.
   - Deploy steps: in Railway, add a volume to the service mounted at `/data` and set `DATA_DIR=/data`.
   - Mention volume backups, which you enable in the Railway UI.
   - Note that a service with a volume runs as a single replica and has brief downtime on redeploy.
   - Keep "App Sleeping" off and choose an EU region, so the app stays fast.
   - Azure: the `Files.ReadWrite.AppFolder` API permission can be removed.
8. **`CLAUDE.md`:**
   - Testing section: Graph mocks are no longer needed, and a session is now `{uid, name}`.
   - Remove the "Abweichungen von Microsoft Graph" section.

## Not in scope (flagged, not implemented)
- Account and data deletion, a privacy policy, and a data export. A public app holding health data will likely need these under nDSG/GDPR. They are separate tasks.
- Review finding #3 (the day view going stale after midnight) is independent of storage. It can be fixed separately.
- Finding #4 disappears on its own, because there is no refresh token anymore.

## Verification
1. `npm run build` in `backend/` and `frontend/` compiles without errors.
2. A scratch script starts the backend with a temporary `DATA_DIR` and creates a session cookie via `app.createSecureSession({uid, name})` + `encodeSecureSession` (apply `encodeURIComponent`). It checks:
   - Create, rename, recolor and delete a habit through the API. The file content matches after each step.
   - **Concurrency (#2):** 10 parallel `PUT /api/entries` requests for different habits all return 200, and the file contains all 10 entries.
   - Restart the server: the data is still there.
   - A request without a cookie gets 401. A missing file behaves like an empty data set.
3. Frontend E2E check: Vite (port 5173) + backend (port 3000) + Playwright with the fake cookie. Toggle several habits quickly and check that none rolls back.
