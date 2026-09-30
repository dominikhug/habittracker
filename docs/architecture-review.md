# Architecture Review: HabitTracker

Reviewed at commit `a1f2481` (M0–M6 done, M7 pending). Scope: backend and frontend reviewed as one system. Line numbers refer to that commit.

---

## 1. Summary

The architecture fits a personal, single-user-per-account self-monitoring tool. The main choices are consistent with each other: stateless encrypted-cookie sessions, the user's own OneDrive as the only datastore, pure domain transforms passed into a load/transform/save loop, and one Fastify process that also serves the SPA. No component carries more complexity than the product needs.

The main structural cost is **latency on every request**. Each authenticated call makes up to three sequential external round trips: a token refresh at Microsoft, a Graph GET, and (for writes) a Graph PUT. That will be noticeable before data size or concurrency ever are. The other weaknesses sit mostly at the boundaries:

- the unvalidated, unversioned data file,
- error shapes that reach the UI raw,
- a thin, partial type contract between frontend and backend.

None of them calls for new infrastructure.

---

## 2. Strengths

- **Pure domain core, cleanly separated from HTTP and persistence.** `habits/model.ts` has no Fastify or Graph imports. Every function takes `DataFile` and returns a new `DataFile` (e.g. `model.ts:56-69`, `110-124`). This makes the model trivially testable, and it is what makes the retry loop safe.
- **`withData()` is the right shape for optimistic concurrency** (`graph/appFolderStore.ts:85-105`). Because the transform is pure, re-running it on a 412 is correct by construction. That even holds for `addHabit`, which generates a new UUID on each attempt; only the winning attempt's UUID is persisted.
- **Entry mutations are "set", not "flip."** The frontend sends the *target* state (`PUT` or `DELETE /api/entries`, `DayView.vue:80-84`), and `setEntryDone` is idempotent (`model.ts:115-118`). A retried or duplicated request can never invert the user's intent. This is the most important design decision for multi-device correctness, and it is correct.
- **Auth posture is sound for the threat model:**
  - PKCE S256 plus a `state` check (`auth/oauth.ts:9-18`, `auth/routes.ts:27-31`).
  - The transient OAuth state lives in a separate cookie with its own key, path-scoped to `/api/auth` with a 10-minute lifetime (`plugins/session.ts:21-32`).
  - Tokens never reach browser JavaScript (httpOnly, `session.ts:14`).
  - Least-privilege scope `Files.ReadWrite.AppFolder` (`oauth.ts:6`).
  - Only `invalid_grant` is treated as "logged out"; every other token error surfaces as a real error (`graphToken.ts:22-29`).
- **The unverified id_token decode is justified correctly** (`oauth.ts:108-118`). The token comes straight from the token endpoint over the back channel, which OIDC explicitly allows, and the comment says where the justification stops.
- **Stateless sessions match the deployment.** There is no session store, so restarts and redeploys on Railway log nobody out, and a second instance would work without changes.
- **Real-world Graph quirks are documented where they live** (`appFolderStore.ts:63-77`, CLAUDE.md). This is cheap insurance against rediscovering them.
- **Production fails fast on a broken build** (`app.ts:31-33`). The SPA fallback returns JSON 404s for `/api/*` and non-GET requests (`app.ts:37-42`), so API typos don't silently return `index.html`.
- **Frontend state is minimal and "server is truth."** Each view refetches on mount (`DayView.vue:97`, `WeekView.vue:40`, `HabitsView.vue:16`). There is no client cache that could go stale. The `fetchEpoch` guard (`DayView.vue:33-56`) handles out-of-order responses during fast date navigation.

---

## 3. Risks and weaknesses (ranked by actual impact)

### R1: A token refresh on every API request (high: latency, availability, cookie churn)

- **What:** `requireAuth` is a `preHandler` on every habits route (`habits/routes.ts:24`). It calls `getGraphAccessToken`, which POSTs to Microsoft's token endpoint on **every** request and writes the rotated refresh token back (`auth/graphToken.ts:18-19`). So yes, it really happens. README line 45 describes it as intentional.
- **Concrete cost:**
  - A toggle costs 3 sequential external round trips: token refresh, then Graph GET, then Graph PUT. Loading the Day view costs 2. Microsoft's latency lands directly in the "tap = reward" path. The optimistic UI hides it for toggles, but not for day navigation ("Lädt…").
  - The Microsoft identity platform becomes a hard runtime dependency for every read, not only for login.
  - Every API response carries a fresh `Set-Cookie` with a new encrypted refresh token.
  - Two parallel requests are allowed today, for example toggling habit A and habit B quickly: `pendingHabitIds` is per habit (`DayView.vue:72`). Both requests redeem the same refresh token, and the last `Set-Cookie` wins. This works only because Microsoft does not invalidate a refresh token when it is redeemed. If reuse detection were ever enforced, it would turn into random logouts.
- **Direction:** Keep the refresh token in the cookie, but cache the access token until shortly before `expires_in` (about 60–90 minutes). A process-local `Map<uid, {accessToken, expiresAt}>` fits a single Railway instance. A restart only costs one extra refresh. Storing the access token in the cookie is an alternative, but it makes the open cookie-size question (README "Bekannte offene Punkte") worse. Either way the refresh rate drops from "per request" to "about once an hour per user."

### R2: Whole-file read and write per mutation, including no-op writes (medium, grows slowly)

- **What:** Every mutation GETs and PUTs all of `data.json` (`appFolderStore.ts:91-94`). `setEntryDone` returns the unchanged object for a no-op (`model.ts:116-118`), but `withData` still PUTs it.
- **Real size (estimate):** one entry is about 70 bytes of JSON (a 36-character UUID plus a date).

  | Usage | Size |
  |---|---|
  | 5 habits, about 70% completion | ~90 KB/year, ~1 MB after 10 years |
  | 10 habits, 100% completion | ~260 KB/year |

  So payload size is **not** the near-term limit. CPU is not an issue either: the linear scans in `getDayView` and `computeWeek` (`model.ts:135`, `154`) are negligible at around 20k entries.
- **What actually grows:**
  - **OneDrive version history.** Every PUT creates a file version. On work/school (SharePoint-backed) accounts, versions typically count against storage quota; for example, 500 versions of a 1 MB file take about 0.5 GB. On personal accounts, version retention is limited. This is worth verifying against real accounts.
  - **Mobile upload volume.** Hundreds of KB are uploaded per tap in later years.
- **Retry storms:** these are not a realistic concern. Conflicts can only come from the same user on a second device. Three attempts without backoff is fine for that, and the 409 after three failures is surfaced honestly (`routes.ts:15-17`).
- **Direction:**
  1. Skip the save when the transform returned the same `data` reference. This is a one-line check in `withData` and also avoids unnecessary versions.
  2. If size ever matters, change the entry encoding (for example `entries: { [habitId]: string[] }`, which roughly halves the size) or split the file per year. Both are local changes behind `appFolderStore` plus the model.

### R3: The data file is trusted blindly, and there is no migration path (medium)

- **What:** `loadData` casts the JSON directly: `(await response.json()) as DataFile` (`appFolderStore.ts:37`). `DataFile.version: 1` exists (`habits/types.ts:14`), but nothing reads it.
- **Why it matters here specifically:** The file lives in storage the app does not control. The user, OneDrive sync, or a future app version can all change it. A malformed or older-schema file turns into 500s or subtly wrong views everywhere, with no clear error. The first schema change (for example R2's encoding change, or adding a habit field) has no place to go.
- **Direction:** A small `parseDataFile(raw): DataFile` at the persistence boundary: check the shape, branch on `version`, and migrate forward. There is no need for a validation library at this size.

### R4: Creating the file on first use has no precondition, and GETs write (low probability, data-loss severity)

- **What:** On a 404, `loadData` creates the file with `saveData(accessToken, emptyDataFile())` and **no** `If-Match` or `If-None-Match` (`appFolderStore.ts:26-29`, `46-48`). This runs inside plain GETs (`/api/day`, `/api/habits`, `/api/weekly`).
- **What could go wrong:** On a brand-new account, a GET and a POST can race. The GET's unconditional "create empty" PUT can land *after* the POST's conditional write and overwrite the just-created habit. The window is narrow (first session only), but the result is silent data loss.
- **Direction:** Send `If-None-Match: *` (or Graph's `@microsoft.graph.conflictBehavior=fail`) on the create. On a conflict, just reload.

### R5: Error handling is centralized only for model errors, not at the system boundary (medium-low)

- **Consistent:** `mapWriteError` (`routes.ts:8-19`) is applied uniformly to all five write routes. The `{ error: string }` body shape is used everywhere.
- **Inconsistent or missing:**
  - **No `setErrorHandler`.** Graph failures (403, 429 throttling with `Retry-After`, 5xx) and non-`invalid_grant` token errors become Fastify's default 500. That response carries the upstream body in `message` (`appFolderStore.ts:33`, `60`; `oauth.ts:103`). Throttling is not distinguished from bugs.
  - **Validation lives in two layers.** Required-parameter and date-policy checks are hand-rolled in the routes and repeated four times (`routes.ts:37-39`, `96-102`, `110-115`, `132-137`, `154-160`). Name and color validation lives in the model. That is fine, but it means "what is a valid request" has no single home.
  - **The OAuth callback is a full-page navigation, yet it answers with JSON** (`auth/routes.ts:23-25`, `30`, `36`). If the user cancels consent (`access_denied`) or a code exchange fails (`routes.ts:33` throws, giving a 500), they land on a raw JSON page with no way back. This is only visible when reading both sides together.
  - **Backend messages are the UI text.** English technical strings ("habit not found: <uuid>", "conflict: data changed concurrently, please retry") appear verbatim inside the German UI (`useApi.ts:21`, then `DayView.vue:91`, `useHabits.ts:19`).
  - **The frontend handles a 401 in four places:** `useHabits.ts:14-20`, `DayView.vue:47-50` and `87-90`, and `WeekView.vue:30-33`.
- **Direction:**
  1. One `setErrorHandler`: map known upstream failures to 502/503 with a stable code, and log the details server-side only.
  2. Make the callback redirect to `/login?error=<code>` instead of returning JSON.
  3. Return error *codes* from the API and translate them in the frontend.
  4. Move the 401-redirect into `useApi.request`.

### R6: Sessions cannot be revoked (low-medium, depends on threat model)

- **What:** The session cookie holds a refresh token that effectively slides forever. The 90-day `maxAge` (`session.ts:18`) is re-issued on every request because of R1. Logout deletes only this browser's cookie (`auth/routes.ts:62-65`). A copied cookie stays valid until Microsoft's refresh token expires or the user revokes app consent in their Microsoft account.
- **Why it's worth naming:** This is the inherent trade-off of stateless sessions, and for most apps it is acceptable. The data here is mental-health self-monitoring, and the product may be used on shared devices.
- **Direction:** Probably accept it and document it. Cheap mitigations if wanted:
  - Shorter `maxAge`.
  - Key rotation: `@fastify/secure-session` accepts a key array, while `config.ts:14` supports one key. Rotating the key logs everyone out, which gives an emergency "revoke all sessions."

### R7: The cross-boundary type contract is thinner than it looks (low-medium)

- **What:** `frontend/src/types.ts` mirrors only `Habit`. The two most-used response shapes are redefined inline in the views:
  - `DayHabit` in `DayView.vue:8-13` (backend: `model.ts:7-12`)
  - `WeekHabit` in `WeekView.vue:8-16` (backend: `model.ts:19-27`)

  The color catalog is duplicated too (`backend/src/habits/colorIds.ts:3-14` vs `frontend/src/colors.ts:13-24`), and the two sides fail asymmetrically:
  - A color that exists only in the frontend gets a 400 from the backend.
  - A color that exists only in the backend **silently** renders as `sage` (`colors.ts:30-32`).
- **Actual risk:** Low today: about 4 shapes and a single developer. But the "hand-synced types file" convention in CLAUDE.md covers only 1 of those 4 shapes, so drift would not show up as a type error. It would show up as `undefined` at runtime.
- **Direction:** Keeping separate packages is justified at this size. Two cheap improvements:
  1. Move `DayHabit` and `WeekHabit` into `types.ts` so there is at least *one* place to keep in sync.
  2. Or skip the package and use a type-only relative import of `backend/src/habits/types.ts` and `model.ts` interfaces from the frontend (`import type` is erased at build, so there is no runtime coupling).

### R8: Static serving has no cache policy (low)

- **What:** `app.register(fastifyStatic, { root })` (`app.ts:35`) uses the default headers. Vite's hashed `/assets/*` files could be cached as `immutable`, and `index.html` should be `no-cache`.
- **Why it matters:** Only repeat-load speed on mobile. There is no need for a CDN at this scale; a single process serving both API and SPA is the right call for one Railway service.
- **Direction:** Set `maxAge` and `immutable` for `/assets`, and set `Cache-Control: no-cache` on the `index.html` fallback.

### Cross-cutting observations (visible only when reading both sides together)

- **Date authority is split, and the server fallback is mostly dead code.** The SPA *always* sends a client-local date (`DayView.vue:41`, `WeekView.vue:27`, `useHabits.ts:39`), so the UTC fallback `todayIso()` in `/api/day` and `/api/weekly` (`routes.ts:99`, `157`) is never used by the real client. That is fine as defensive code, but the actual contract is "the client owns 'today'." The server's +1 day tolerance (`util/dates.ts:31-33`) is consistent with that.
- **`createdAt` is a local calendar date with no timezone.** A user who travels west after creating a habit can have "today" before `createdAt`. The habit then disappears from the Day view (`model.ts:130`) until local time catches up. This is an edge case, but it follows directly from the design.
- **`/api/entries` accepts dates before a habit's `createdAt`** (`model.ts:110-124` does not check). `getDayView` and `computeWeek` hide them (`model.ts:130`, `157`), so such entries are stored but never shown. The UI can't create them today.
- **`localToday()` relies on `toLocaleDateString('en-CA')` producing `YYYY-MM-DD`** (`dateUtils.ts:5`, `DayView.vue:62`). It works in current browsers, but it is an implicit format contract with the backend's strict regex (`util/dates.ts:7`).
- **A backend feature is not wired to the UI.** `PATCH /api/habits/:id` (`routes.ts:61-76`) and `renameHabit` (`useHabits.ts:49-59`) exist, but `HabitsView.vue:8` does not use them. README line 31 lists "umbenennen" as a feature of the Verwalten screen.
- **Frontend state management fits the current size.** Only `useAuth` and `useHabits` are module-level singletons. Day and Week keep component-local state. The combination is safe because every view refetches on mount, and logout does a full reload (`useAuth.ts:34`), which clears all module state. It would stop being enough in these cases:
  - Caching across views (for example, not refetching on tab switch). Views would then have to invalidate each other after mutations.
  - Background refresh when another device changes data.
  - Offline or queued toggles.

  The shared `loading` and `error` refs in `useHabits.ts:7-8` also break once two operations run in parallel. Pinia becomes worth it at that point, not before.

---

## 4. Open questions for the owner

1. **Horizon:** How many years and habits should one `data.json` hold comfortably? At the estimates in R2 this only matters after many years. The answer decides whether R2's encoding change is ever needed.
2. **Work/school accounts:** Do you really intend to support them (README: "private und Arbeits-/Schulkonten")? Tenant admin-consent policies and version-history quota (R2) behave differently from personal OneDrive.
3. **Multi-device use:** Is simultaneous phone and desktop use expected? If yes, is "refetch on mount" enough, or should views refresh on window focus?
4. **Session threat model (R6):** Are shared or borrowed devices a realistic scenario for your users? That decides whether stateless, non-revocable sessions are acceptable as they are.
5. **Is `data.json` a user-facing format?** "Deine Daten bleiben in deinem eigenen OneDrive" implies users may open, back up, or edit it. If so, the schema is a public contract, which raises the importance of R3's validation and migration.
6. **Other users:** Will the app stay personal or be shared with others? A single process is fine for many users. R1's per-request token call, however, scales linearly with traffic against Microsoft's throttling limits.
7. **Timezone semantics:** Should `createdAt` and entry dates stay "the local calendar date wherever I am," or be pinned to a home timezone? This only matters for travelers, but it is cheaper to decide before years of data exist.
8. **Rename and recolor:** Is the missing UI intentional (Pareto) or an unfinished item? If intentional, update the README; if not, the backend is ready.
