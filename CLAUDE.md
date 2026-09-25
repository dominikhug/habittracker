# CLAUDE.md

Arbeits-Kontext für Claude-Code-Sessions, die an diesem Repo weiterarbeiten. Für den allgemeinen Projektüberblick (Architektur, Setup, Status) siehe `README.md` — hier geht es nur um Dinge, die eine Session sonst mühsam neu herausfinden müsste.

## Aktueller Stand

M0–M6 sind fertig, committet und getestet (Milestone-Tabelle: `README.md`). **Nächster Schritt: M7 (Railway-Deployment)** — der Nutzer übernimmt das laut Absprache selbst, kann bei Bedarf aber unterstützt werden.

## Ohne echtes Microsoft-Konto testen

In der Entwicklungsumgebung ist kein echtes Azure/Microsoft-Konto verfügbar. Bewährtes Muster, durchgängig in M1–M6 verwendet:

1. Zwei lokale Mock-HTTP-Server (plain `http.createServer`, immer im Scratch-Verzeichnis, nie unter dem Repo):
   - Fake Microsoft-Token-Endpoint: jede POST mit `grant_type=refresh_token` → `200 {access_token, refresh_token, expires_in}`.
   - Fake Graph-Endpoint exakt unter dem Pfad `/me/drive/special/approot:/data.json:/content` (Doppelpunkte wörtlich matchen, nicht URL-dekodieren lassen) — In-Memory `{body, etag}`, 404→Create-on-first-PUT, `If-Match`/412-Semantik mit frischem ETag pro Write.
2. `GRAPH_BASE_URL` und `MS_IDENTITY_BASE_URL` (beide in `backend/src/config.ts`, defaulten auf die echten Microsoft-Endpunkte) auf die Mocks zeigen lassen.
3. Gültige Session **ohne echten Login** erzeugen: `buildApp()` aus `dist/app.js` importieren, dann `app.createSecureSession({uid, name, rt})` + `app.encodeSecureSession(session, 'session')` — ergibt einen echten, korrekt verschlüsselten Cookie-Wert.
   - **Gotcha**: Das Ergebnis enthält ein wörtliches `;`. Vor Verwendung in einem rohen `Cookie:`-Header oder in Playwrights `context.addCookies()` immer `encodeURIComponent()` anwenden, sonst schneidet der Header-Parser den Wert ab und die Auth schlägt still fehl.
4. Nie `backend/.env` lesen, ausgeben oder verändern — kann echte Secrets des Nutzers enthalten. Immer eine eigene Wegwerf-Env-Datei verwenden.

Für Frontend-E2E-Checks: echter Vite-Dev-Server (Port 5173) + echtes Backend (Port 3000, damit der Proxy in `vite.config.ts` greift) + Playwright mit dem gefälschten Cookie von oben.

## Bekannte reale Abweichungen von Microsoft Graph (vs. eigene Mock-Annahmen)

- `PUT .../content` liefert den neuen ETag nicht zuverlässig als HTTP-Header, sondern im JSON-Response-Body (`eTag`/`cTag`-Feld des zurückgegebenen DriveItem). Siehe `backend/src/graph/appFolderStore.ts::saveData` — Header zuerst versuchen, Body als Fallback.
- `GET /me/drive/special/approot:/data.json:/content` (Pfad + `:/content` kombiniert) lieferte in Produktion (2026-09-25, persönliches Konto) `400 invalidRequest`, obwohl Drive, Ordner und Datei existierten und Metadaten (`approot:/data.json`) sowie `/me/drive/items/{id}/content` (302 auf Download-URL) funktionierten. Deshalb lädt `loadData` in zwei Schritten: Metadaten per Pfad → Content per Item-ID. `saveData` (PUT auf den kombinierten Pfad) ist davon nicht betroffen. Die Mocks bilden das 400 nicht ab.
- Graph-Antwortbodies nie roh loggen: Metadaten enthalten `@microsoft.graph.downloadUrl` mit temporärem `tempauth`-Token, und `response.url` nach einem Redirect ist genau diese URL. `graphError` loggt die URL deshalb ohne Query-String.
- Falls weitere Abweichungen auftauchen: hier ergänzen, damit sie nicht zweimal gefunden werden müssen.

## Konventionen

- **Commit-Muster**: was wurde gebaut → was hat der Tester-Subagent/das `code-review`-Skill gefunden → was wurde gefixt. Git-Historie als Beispiele nehmen.
- **Backend-Fehlerbehandlung**: `mapWriteError()` in `backend/src/habits/routes.ts` zentralisiert die Zuordnung Model-Fehler → HTTP-Status (`ValidationError`→400, `NotFoundError`→404, `PreconditionFailedError`→409).
- **Concurrency**: jede mutierende Route läuft über `appFolderStore.withData()` (Load → reine Transform-Funktion → Save mit `If-Match`, Retry bei 412, max. 3 Versuche).
- **Datenschema**: `DataFile`/`Habit`/`Entry` in `backend/src/habits/types.ts`. Bewusst kein Shared-Types-Paket mit dem Frontend (siehe Projekt-Historie) — `frontend/src/types.ts` von Hand synchron halten.
- **Datum/Zeitzone**: Das Backend kennt nur UTC. Für "heute" immer das lokale Datum vom Client mitschicken (`frontend/src/dateUtils.ts::localToday()`), nie serverseitig UTC-"heute" als Nutzer-Wahrheit annehmen. `isTooFarInFuture()` toleriert bewusst einen Kulanztag für Zeitzonen-Versatz — das ist kein Sicherheits-Grenzwert, sondern ein UX-Sicherheitsnetz.
- **Farben**: `frontend/src/colors.ts` — 10 Katalog-Farben, je nur ein HSL-Basiswert; matt/gesättigt wird zur Laufzeit abgeleitet, nicht als zwei gespeicherte Werte.

## Nicht ohne Rücksprache anfassen

- `main`-Branch: der Nutzer synct ihn selbst (Fast-Forward von `claude/dazzling-knuth-9f841s`) — nicht automatisch mitziehen.
- `backend/.env`: nie lesen/schreiben. Enthält echte Nutzer-Secrets und ist lokal schon zweimal verloren gegangen (vermutlich durch ein Aufräumen wie `git clean`). Dem Nutzer empfehlen, die Werte zusätzlich als persistente Windows-Umgebungsvariablen zu setzen (`backend/.env.example` hat die Details).
