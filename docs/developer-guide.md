# HabitTracker — Developer Guide

How the app works inside, for developers who want to change it. For setup and deployment steps, see [README.md](../README.md). For conventions that Claude Code sessions should follow, see [CLAUDE.md](../CLAUDE.md).

## 1. What the app does

A deliberately small habit tracker for mental health. Users sign in with a Microsoft account, define habits, tick them off per day, and see a rolling 7-day summary. Three screens only:

| Screen | Route | Purpose |
|---|---|---|
| Heute | `/` | One toggle button per habit for a given day; arrows to go back in time |
| Woche | `/week` | Rolling 7-day window per habit ("3 von 7") |
| Verwalten | `/habits` | Create, rename, recolor, delete habits; log out |

Two design rules shape much of the code:

- **Non-shaming:** days before a habit was created are never shown as "missed". A habit created yesterday shows `1 von 2`, never `1 von 7`.
- **Everything is reversible:** a tap toggles, and past days can be corrected.

## 2. Architecture

```
Browser (Vue 3 SPA)
   │  same-origin, session cookie
   ▼
Fastify backend (one Node process)
   ├── /api/auth/*   ── OAuth2 code flow + PKCE ──► Microsoft identity platform (login only)
   ├── /api/*        ── habits, entries, day/week views
   └── /*            ── serves the built SPA (production only)
   │
   ▼
DATA_DIR (Railway volume)
   └── <tid>.<oid>.json   one file per user
```

Key properties:

- **One process, one instance.** The backend serves both the API and (in production) the SPA. A Railway service with a volume always runs as a single instance, and the write lock relies on that (see §5).
- **No database.** Each user's data is one JSON file.
- **Stateless sessions.** The session lives in an encrypted cookie; the server keeps no session store.
- **Microsoft is only used to log in.** After login, the app never calls Microsoft again.

## 3. Repository layout

```
backend/src/
  server.ts            entry point: builds the app, listens on PORT
  app.ts               assembles plugins and routes; production SPA serving
  config.ts            environment variables (fails fast if required ones are missing)
  auth/
    oauth.ts           PKCE, authorize URL, code exchange, id_token decoding
    routes.ts          /api/auth/login, /api/auth/callback, /api/me, /api/auth/logout
    requireAuth.ts     preHandler: 401 without session, renews session expiry
  plugins/session.ts   the two encrypted cookies (session, oauth_txn)
  store/fileStore.ts   per-user JSON file: loadData, withData (lock + atomic write)
  habits/
    types.ts           DataFile / Habit / Entry schema
    model.ts           pure functions: add/update/delete habit, set entry, day and week views
    routes.ts          HTTP layer for habits, entries, day, weekly
    errors.ts          ValidationError (→400), NotFoundError (→404)
    colorIds.ts        the 10 valid color ids
  util/dates.ts        ISO date validation and arithmetic (UTC)

frontend/src/
  main.ts, App.vue     bootstrapping
  router.ts            routes + auth guard
  composables/         useApi (fetch wrapper), useAuth, useHabits
  views/               DayView, WeekView, HabitsView, LoginView
  components/          BottomNav, HabitToggleButton, WeekBar
  colors.ts            color catalog; muted/saturated variants derived at runtime
  dateUtils.ts         localToday()

docs/                  this guide, architecture review, plans
```

## 4. Authentication and sessions

### Login flow

```
Browser                    Backend                         Microsoft
   │ GET /api/auth/login      │                                 │
   │─────────────────────────►│ create state + PKCE verifier    │
   │                          │ store both in oauth_txn cookie  │
   │◄──── 302 authorize URL ──│                                 │
   │──────────────────────────────── login page ───────────────►│
   │◄─────────────── 302 /api/auth/callback?code&state ─────────│
   │─────────────────────────►│ check state, exchange code ────►│
   │                          │◄──────────── id_token ──────────│
   │                          │ uid = tid.oid, name             │
   │◄──── 302 / + session ────│ delete oauth_txn                │
```

- Scope is `openid profile`: identity only, no API access, no refresh token.
- The id_token is decoded **without** signature verification. That is safe only because it comes straight from Microsoft's token endpoint over a server-to-server HTTPS call (see the comment in `oauth.ts`). Never reuse `decodeIdToken` for tokens from the browser.
- `uid = "<tid>.<oid>"`: Microsoft's recommended unique key across tenants. It is also the data file name.

### The two cookies

| Cookie | Content | Path | Lifetime |
|---|---|---|---|
| `session` | `uid`, `name` | `/` | 90 days idle (see below) |
| `oauth_txn` | `state`, `codeVerifier` | `/api/auth` | 10 minutes |

Both are encrypted and authenticated by `@fastify/secure-session` (separate keys), `httpOnly`, `SameSite=Lax`, and `Secure` in production.

**Expiry works on two levels:**

1. The browser drops the cookie after its `maxAge` (90 days after it was last set).
2. The library stores a timestamp inside the cookie and rejects it once it is older than `expiry` (set to 90 days).

`requireAuth` calls `session.touch()` on every API request, which renews both. Result: **a session expires only after 90 days without use.**

> Gotcha: the library's default `expiry` is 24 hours, and the timestamp is only renewed when the session is written. Remove the `touch()` and every user is logged out 24 hours after login.

**Logout** clears the cookie in the browser. There is no server-side revocation: a copied cookie stays valid until it expires. This is the tradeoff of stateless sessions.

## 5. Data storage

### File format

One file per user: `${DATA_DIR}/<tid>.<oid>.json`.

```json
{
  "version": 1,
  "habits":  [{ "id": "uuid", "name": "Meditieren", "colorId": "sage", "createdAt": "2026-09-01" }],
  "entries": [{ "habitId": "uuid", "date": "2026-09-29" }]
}
```

- An entry's **presence** means "done that day". Not done = no entry. There is no `done: false` record.
- `createdAt` and `date` are plain calendar dates (`YYYY-MM-DD`), no times and no time zones.
- A user without a file simply has no habits. `loadData` returns an empty data set and writes nothing; the file appears on the first change.
- The schema is defined in `backend/src/habits/types.ts`. `frontend/src/types.ts` mirrors `Habit` by hand (on purpose, no shared package).

### Reads and writes

```
read:   loadData(uid)                 → parse file (or empty data)

write:  withData(uid, transform)
          ┌─ wait for this user's previous write ─┐
          │  loadData(uid)                         │
          │  transform(data) → { data, result }    │   one at a time per user
          │  write <file>.tmp, rename over <file>  │
          └────────────────────────────────────────┘
```

Two mechanisms protect the data:

1. **Per-user lock.** `withData` chains each user's writes into a promise queue, so two requests of the same user never read the same old state and overwrite each other. Different users never wait for each other. Without the lock, a test with 10 parallel toggles kept only 1 of 10 changes.
2. **Atomic replace.** Writing to a temp file and then renaming it means a reader (or a crash) never sees a half-written file.

The lock lives in process memory. It is correct only while exactly **one** backend process owns the directory, which Railway enforces for services with a volume. Running two instances against the same files would break it.

`transform` functions are pure (`habits/model.ts`): they take the current data and return new data plus a result, and throw `ValidationError` or `NotFoundError` on bad input. This keeps all business rules testable without HTTP or files.

## 6. Domain rules (`habits/model.ts`)

| Rule | Where |
|---|---|
| Name is trimmed, 1–100 characters | `validateName` |
| `colorId` must be one of the 10 catalog ids | `validateColorId`, `colorIds.ts` |
| Deleting a habit also deletes all its entries | `deleteHabit` |
| Setting an entry to its current state is a no-op, not an error | `setEntryDone` |
| Day view hides habits created after that day | `getDayView` |
| Week window = the 7 days ending at the given date, inclusive | `computeWeek` |
| Days before `createdAt` are left out; `daysTotal` shrinks accordingly | `computeWeek` |
| A habit with no days in the window is left out entirely | `computeWeek` |

## 7. Dates and time zones

The backend only knows UTC, but "today" is a local concept: at 00:30 in Zurich it is still yesterday in UTC.

- The frontend always sends its **local** date (`localToday()` in `dateUtils.ts`) for `createdAt`, `/api/day`, and `/api/weekly`.
- The server's UTC date (`todayIso()`) is only a fallback when the client sends nothing.
- `isTooFarInFuture()` rejects dates later than UTC-today **plus one day**. The extra day lets through users east of UTC (up to UTC+14). It is a UX safety net, not a security boundary.
- `isValidIsoDate()` checks the format and also rejects non-existent dates such as `2026-02-30`.

## 8. HTTP API

All `/api/*` routes except the auth routes require the `session` cookie and answer `401 {"error":"unauthenticated"}` without it. Errors have the shape `{"error": "<message>"}`.

### Auth

| Method | Path | Result |
|---|---|---|
| GET | `/api/auth/login` | 302 to Microsoft |
| GET | `/api/auth/callback` | 302 to `/` with session; 400 on `error` or state mismatch |
| GET | `/api/me` | `{uid, name}` or 401 |
| POST | `/api/auth/logout` | 204, clears the session cookie |

### Habits and entries

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/habits` | | `Habit[]` | |
| POST | `/api/habits` | `{name, colorId, createdAt?}` | 201 `Habit` | 400 |
| PATCH | `/api/habits/:id` | `{name?, colorId?}` | `Habit` | 400, 404 |
| DELETE | `/api/habits/:id` | | 204 | 404 |
| PUT | `/api/entries` | `?habitId&date` | `{habitId, date, done: true}` | 400, 404 |
| DELETE | `/api/entries` | `?habitId&date` | `{habitId, date, done: false}` | 400, 404 |
| GET | `/api/day` | `?date` (optional) | `{date, habits: DayHabit[]}` | 400 |
| GET | `/api/weekly` | `?date` (optional, = window end) | `{windowStart, windowEnd, habits: WeekHabit[]}` | 400 |
| GET | `/healthz` | | `{status: "ok"}` (no auth) | |

`DayHabit = {habitId, name, colorId, done}`.
`WeekHabit = {habitId, name, colorId, daysDone, daysTotal, percent, days: [{date, done}]}`.

Invalid `createdAt` on POST does not fail; the server falls back to its UTC date.

## 9. Frontend

- **Router guard** (`router.ts`): before any route except `/login`, it calls `/api/me` once per page load. No user → redirect to `/login`.
- **API client** (`useApi.ts`): `fetch` with cookies; throws `ApiError(status, message)` on non-2xx. Views redirect to `/login` on a 401.
- **Shared state:** `useAuth` and `useHabits` keep their state at module level, so all views share one copy.
- **Optimistic toggle** (`DayView.vue`): the button changes color immediately; on error it rolls back and shows the message. A habit with a request in flight is disabled, so double taps are ignored.
- **Out-of-order responses** (`DayView.vue`): when the user clicks through dates quickly, a counter (`fetchEpoch`) makes sure only the latest request updates the screen.
- **Colors** (`colors.ts`): 10 catalog colors, each stored as one HSL value. "Not done" (muted, dark, white text) and "done" (saturated, light, dark text) are derived at runtime.

## 10. Configuration

| Variable | Required | Purpose |
|---|---|---|
| `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | yes | Azure app registration |
| `AZURE_REDIRECT_URI` | yes | `…/api/auth/callback`, must be registered in Azure |
| `AZURE_TENANT` | no (`common`) | which accounts may sign in |
| `SESSION_COOKIE_KEY`, `OAUTH_TXN_COOKIE_KEY` | yes | 32-byte hex keys, different from each other |
| `DATA_DIR` | yes | directory of the user files; on Railway the volume's mount path |
| `NODE_ENV` | prod: `production` | enables `Secure` cookies and SPA serving |
| `FRONTEND_URL` | dev only | where to redirect after login (Vite on :5173) |
| `MS_IDENTITY_BASE_URL` | tests only | points login at a mock token endpoint |
| `PORT` | no (3000) | injected by Railway |

`DATA_DIR` has no default on purpose: in production a default would write to the container's temporary disk and lose all data on the next deploy.

## 11. Running and testing locally

- Backend: `cd backend && npm run dev` (port 3000). Frontend: `cd frontend && npm run dev` (port 5173, proxies `/api` to 3000).
- There is no automated test suite. Verification so far used scripts that build the app and call it via `app.inject()`, with a session cookie created directly:

  ```js
  const app = await buildApp();
  const value = app.encodeSecureSession(app.createSecureSession({ uid: 't.o', name: 'Test' }), 'session');
  const cookie = `session=${encodeURIComponent(value)}`; // the value contains ';' — always encode it
  await app.inject({ method: 'GET', url: '/api/habits', headers: { cookie } });
  ```

- Point `DATA_DIR` at a throwaway directory, never at the repo.
- For the login flow itself, point `MS_IDENTITY_BASE_URL` at a small mock server that returns `{ id_token }`.

## 12. Known limitations

| Area | Limitation |
|---|---|
| Data protection | The operator stores users' health data. Account/data deletion, data export, and a privacy policy are still missing (nDSG/GDPR). |
| Backups | Depend on Railway volume backups being enabled. |
| Scaling | Single instance only (in-process lock, one volume). |
| Sessions | No server-side logout; a copied cookie stays valid up to 90 days idle. |
| Schema | The file has `version: 1` but is not validated on load and there is no migration path. |
| Day view | If the tab stays open past midnight, it keeps showing the previous day as "Heute" until the user navigates. |
| Input validation | A non-string `name` in a request body causes 500 instead of 400 (the own frontend never sends one). |
| Tests | No automated test suite. |
