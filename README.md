# HabitTracker

Eine bewusst einfache App zum Tracken von Gewohnheiten für mentale Gesundheit. Kernidee: Self-Monitoring + wöchentliches Feedback — die zwei am besten belegten Hebel aus der Verhaltensforschung — ohne unnötige Zusatzfeatures (Pareto-Prinzip).

## Status

| Milestone | Status |
|---|---|
| M0 – Projekt-Grundgerüst | ✅ |
| M1 – Microsoft-Login (OAuth2 + PKCE) | ✅ |
| M2 – OneDrive-Speicherung (Microsoft Graph) | ✅ |
| M3 – Habits-CRUD + Farbkatalog | ✅ |
| M4 – Tages-Toggle + Datumsnavigation | ✅ |
| M5 – 7-Tage-Auswertung | ✅ |
| M6 – Politur | ✅ |
| M7 – Railway-Deployment | ⏳ offen |

M1–M6 wurden während der Entwicklung gegen Mock-Microsoft/Graph-Server getestet (kein echtes Microsoft-Konto in der Entwicklungsumgebung verfügbar) und werden aktuell lokal mit einem echten Konto verifiziert. Details zu bereits gefundenen und behobenen Abweichungen zwischen echtem Microsoft Graph und den Mocks: siehe [Bekannte offene Punkte](#bekannte-offene-punkte).

## Design-Prinzipien

- **Pareto-Prinzip**: nur die Features, die den grössten Nutzen bringen — 3 Screens, keine Extras.
- **Nicht beschämend**: gleitendes 7-Tage-Fenster statt harter Streaks; ein neu angelegtes Habit zeigt nie eine künstlich niedrige Quote für Tage vor seiner Erstellung.
- **Toggle statt Einwegklick**: jede Aktion ist rückgängig machbar, auch rückwirkend für vergangene Tage.
- **Sofortiges Feedback**: der Tap selbst ist der "Reward"-Moment (optimistisches UI, Farbwechsel).

## Screens

1. **Heute** (`/`) — ein Button pro Gewohnheit, Tap = erledigt/nicht erledigt. Zurück-/Vor-Navigation erlaubt das Nachtragen vergangener Tage.
2. **Woche** (`/week`) — gleitendes 7-Tage-Fenster pro Gewohnheit (Tage vor der Erstellung werden nicht angezeigt).
3. **Verwalten** (`/habits`) — Gewohnheiten anlegen/umbenennen/löschen, Farbe aus einem Katalog von 10 Farben wählen.

Jede Gewohnheit hat ihre eigene Farbe: matt/dunkel wenn nicht erledigt, gesättigt/hell wenn erledigt (`frontend/src/colors.ts`).

## Architektur

```
Browser (Vue 3 SPA)
   │  Cookie-Auth, same-origin
   ▼
Fastify-Backend (ein Prozess: API, später auch die gebaute SPA)
   │  OAuth2 Authorization Code + PKCE, server-seitig (kein MSAL, kein Client-Token)
   ▼
Microsoft identity platform (login.microsoftonline.com/common)
   │  Graph-Access-Token (aus Refresh-Token gemintet, pro Request rotiert)
   ▼
Microsoft Graph API → OneDrive-App-Ordner des jeweiligen Nutzers
   → eine data.json pro Nutzer: { habits: [...], entries: [...] }
```

Kein eigenes Datenbanksystem — jeder Nutzer speichert seine Daten in seinem eigenen OneDrive (`Files.ReadWrite.AppFolder`-Scope, sieht nur den eigenen App-Ordner). Sessions sind zustandslos: ein verschlüsselter, signierter Cookie (`@fastify/secure-session`) statt eines Server-seitigen Session-Stores — passt zu zustandslosen Deployment-Umgebungen wie Railway.

## Tech-Stack

- **Backend**: Fastify + TypeScript
- **Frontend**: Vue 3 + TypeScript, Vite, vue-router
- **Auth**: Microsoft OAuth2 (Authorization Code + PKCE), private und Arbeits-/Schulkonten
- **Datenspeicherung**: Microsoft Graph API, OneDrive-App-Ordner
- **Deployment (geplant, M7)**: Railway.com, ein einzelner Service (Backend liefert die gebaute SPA selbst aus)

## Projektstruktur

```
backend/src/
  auth/         OAuth-Flow (oauth.ts, routes.ts), Session-Zugriff (graphToken.ts, requireAuth.ts)
  graph/        OneDrive-Zugriff (appFolderStore.ts: load/save mit ETag-Concurrency)
  habits/       Habits-CRUD sowie Tages-/Wochen-Logik als reine Funktionen (model.ts), Routen (routes.ts)
  plugins/      Fastify-Plugins (session.ts)
  util/         Datums-Hilfsfunktionen (dates.ts)
  types/        TypeScript-Erweiterungen (fastify.d.ts)

frontend/src/
  views/        DayView, WeekView, HabitsView, LoginView
  components/   BottomNav, HabitToggleButton, WeekBar
  composables/  useApi, useAuth, useHabits
  colors.ts     10-Farben-Katalog + matt/gesättigt-Ableitung (HSL)
```

## Lokal starten

Voraussetzung: Node.js 20+ und eine Azure App Registration (siehe unten).

**Backend** (Terminal 1):
```bash
cd backend
npm install
npm run dev
```
Läuft auf `http://localhost:3000` (Health-Check: `/healthz`).

**Frontend** (Terminal 2):
```bash
cd frontend
npm install
npm run dev
```
Läuft auf `http://localhost:5173`, leitet `/api/*` automatisch ans Backend weiter.

Browser öffnen: `http://localhost:5173`.

### Azure App Registration (einmalig)

1. [portal.azure.com](https://portal.azure.com) → Microsoft Entra ID → App registrations → New registration.
2. **Supported account types**: "Accounts in any organizational directory and personal Microsoft accounts" (wichtig — sonst schlägt der Login mit `unauthorized_client` fehl).
3. **Redirect URI**, Plattform **Web**: `http://localhost:3000/api/auth/callback`.
4. **Certificates & secrets** → neues Client Secret erzeugen (Wert sofort sichern, wird nur einmal angezeigt).
5. **API permissions** → Microsoft Graph → Delegated permissions: `Files.ReadWrite.AppFolder`, `offline_access`, `openid`, `profile`.

### Umgebungsvariablen

Siehe `backend/.env.example` für die vollständige Liste. Empfehlung: die Werte zusätzlich als persistente Umgebungsvariablen setzen (Details im Kommentar der Datei) statt sich nur auf `.env` zu verlassen — eine Datei im Projektordner kann durch `git clean`/`checkout` verloren gehen, Umgebungsvariablen nicht.

## Deployment (Railway)

Der Backend-Service liefert im Produktivbetrieb die gebaute SPA selbst aus (`backend/src/app.ts`, aktiv wenn `NODE_ENV=production`). Deployt wird aus einem eigenen `release`-Branch, der manuell (Fast-Forward/Merge von `main`) aktualisiert wird, sobald ein Stand live gehen soll — kein Auto-Deploy von `main`. Railway deployt automatisch bei jedem Push auf `release`.

### Einmalige Einrichtung (manuell durch den Nutzer)

1. `release`-Branch anlegen und pushen:
   ```bash
   git checkout -b release main
   git push -u origin release
   ```
2. In Railway: New Project → Deploy from GitHub repo → dieses Repo auswählen → in den Service-Settings unter "Source" den Branch auf `release` setzen.
3. In den Railway-Service-Settings → Variables folgende Umgebungsvariablen setzen:

   | Variable | Wert |
   |---|---|
   | `NODE_ENV` | `production` |
   | `AZURE_CLIENT_ID` | aus der Azure App Registration übernehmen |
   | `AZURE_CLIENT_SECRET` | aus der Azure App Registration übernehmen (ggf. eigenes Secret für Produktion anlegen) |
   | `AZURE_TENANT` | `common` (übernehmen) |
   | `AZURE_REDIRECT_URI` | `https://<deine-railway-domain>/api/auth/callback` — Railway-Domain, nicht localhost |
   | `SESSION_COOKIE_KEY` | frisch generieren: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `OAUTH_TXN_COOKIE_KEY` | frisch generieren (eigener Aufruf, eigener Wert — nicht derselbe wie oben) |

   `FRONTEND_URL`, `GRAPH_BASE_URL`, `MS_IDENTITY_BASE_URL` **nicht setzen** (leer lassen) — das Produktionsverhalten hängt genau davon ab, dass sie fehlen. `PORT` nicht manuell setzen, Railway injiziert es automatisch.
4. In Azure Portal → App registrations → (bestehende App) → Authentication → Redirect URI (Web): die Railway-URL als **zweite** Redirect-URI ergänzen (`https://<deine-railway-domain>/api/auth/callback`), zusätzlich zur bestehenden `http://localhost:3000/api/auth/callback` — nicht ersetzen.
5. Deploy auslösen (Push auf `release`, oder "Deploy" in Railway) und Build-/Start-Logs prüfen.
6. Nach dem Deploy verifizieren:
   - `https://<deine-railway-domain>/healthz` → `{"status":"ok"}`
   - `https://<deine-railway-domain>/` → SPA lädt
   - Login mit echtem Microsoft-Konto funktioniert end-to-end
   - Ein direkter Aufruf von `/week` oder `/habits` (nicht über Client-Side-Navigation) lädt die SPA statt eines 404

### Spätere Deploys

```bash
git checkout release
git merge --ff-only main
git push
```

## Bekannte offene Punkte

- **Cookie-Grösse**: Die Länge des echten Microsoft-Refresh-Tokens muss noch geprüft werden (Backend-Log-Zeile `"Microsoft refresh token length"` beim ersten echten Login), um zu entscheiden, ob das zustandslose Cookie-Design bleibt oder ein Redis-Fallback nötig wird.
- **M7 (Railway-Deployment)**: noch nicht umgesetzt.
- Reale Abweichungen zwischen Microsoft Graph und den in der Entwicklung genutzten Mock-Servern wurden bereits gefunden und behoben, z.B.: `PUT .../content` liefert den ETag nicht zuverlässig als HTTP-Header, sondern im JSON-Response-Body (`appFolderStore.ts`).
