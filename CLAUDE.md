# CLAUDE.md

Arbeits-Kontext für Claude-Code-Sessions, die an diesem Repo weiterarbeiten. Für den allgemeinen Projektüberblick (Architektur, Setup, Status) siehe `README.md` — hier geht es nur um Dinge, die eine Session sonst mühsam neu herausfinden müsste.

## Aktueller Stand

M0–M6 sind fertig, committet und getestet (Milestone-Tabelle: `README.md`). **Nächster Schritt: M7 (Railway-Deployment)** — der Nutzer übernimmt das laut Absprache selbst, kann bei Bedarf aber unterstützt werden.

## Ohne echtes Microsoft-Konto testen

In der Entwicklungsumgebung ist kein echtes Azure/Microsoft-Konto verfügbar. Microsoft wird nur noch für den Login gebraucht; die Daten liegen als `<uid>.json` in `DATA_DIR` (`backend/src/store/fileStore.ts`). Bewährtes Muster:

1. `DATA_DIR` auf ein Wegwerf-Verzeichnis im Scratch-Verzeichnis zeigen lassen (nie unter dem Repo).
2. Gültige Session **ohne echten Login** erzeugen: `buildApp()` aus `dist/app.js` importieren, dann `app.createSecureSession({uid, name})` + `app.encodeSecureSession(session, 'session')` — ergibt einen echten, korrekt verschlüsselten Cookie-Wert.
   - **Gotcha**: Das Ergebnis enthält ein wörtliches `;`. Vor Verwendung in einem rohen `Cookie:`-Header oder in Playwrights `context.addCookies()` immer `encodeURIComponent()` anwenden, sonst schneidet der Header-Parser den Wert ab und die Auth schlägt still fehl.
3. Nur für den Login-Flow selbst: ein Mock-Token-Endpoint (plain `http.createServer`), auf den `MS_IDENTITY_BASE_URL` zeigt.
4. Nie `backend/.env` lesen, ausgeben oder verändern — kann echte Secrets des Nutzers enthalten. Immer eine eigene Wegwerf-Env-Datei verwenden.

Für Frontend-E2E-Checks: echter Vite-Dev-Server (Port 5173) + echtes Backend (Port 3000, damit der Proxy in `vite.config.ts` greift) + Playwright mit dem gefälschten Cookie von oben.

## Konventionen

- **Commit-Muster**: was wurde gebaut → was hat der Tester-Subagent/das `code-review`-Skill gefunden → was wurde gefixt. Git-Historie als Beispiele nehmen.
- **Backend-Fehlerbehandlung**: `mapWriteError()` in `backend/src/habits/routes.ts` zentralisiert die Zuordnung Model-Fehler → HTTP-Status (`ValidationError`→400, `NotFoundError`→404).
- **Concurrency**: jede mutierende Route läuft über `fileStore.withData()` (Load → reine Transform-Funktion → atomares Save), pro Nutzer strikt nacheinander (In-Process-Lock — setzt genau eine Instanz voraus, was Railway mit Volume ohnehin erzwingt).
- **Datenschema**: `DataFile`/`Habit`/`Entry` in `backend/src/habits/types.ts`. Bewusst kein Shared-Types-Paket mit dem Frontend (siehe Projekt-Historie) — `frontend/src/types.ts` von Hand synchron halten.
- **Datum/Zeitzone**: Das Backend kennt nur UTC. Für "heute" immer das lokale Datum vom Client mitschicken (`frontend/src/dateUtils.ts::localToday()`), nie serverseitig UTC-"heute" als Nutzer-Wahrheit annehmen. `isTooFarInFuture()` toleriert bewusst einen Kulanztag für Zeitzonen-Versatz — das ist kein Sicherheits-Grenzwert, sondern ein UX-Sicherheitsnetz.
- **Farben**: `frontend/src/colors.ts` — 10 Katalog-Farben, je nur ein HSL-Basiswert; matt/gesättigt wird zur Laufzeit abgeleitet, nicht als zwei gespeicherte Werte.

## Nicht ohne Rücksprache anfassen

- `main`-Branch: der Nutzer synct ihn selbst (Fast-Forward von `claude/dazzling-knuth-9f841s`) — nicht automatisch mitziehen.
- `backend/.env`: nie lesen/schreiben. Enthält echte Nutzer-Secrets und ist lokal schon zweimal verloren gegangen (vermutlich durch ein Aufräumen wie `git clean`). Dem Nutzer empfehlen, die Werte zusätzlich als persistente Windows-Umgebungsvariablen zu setzen (`backend/.env.example` hat die Details).
