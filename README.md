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

M1–M6 wurden während der Entwicklung gegen Mock-Microsoft/Graph-Server getestet (kein echtes Microsoft-Konto in der Entwicklungsumgebung verfügbar). Die OneDrive-Speicherung aus M2 wurde inzwischen durch eine Datei pro Nutzer auf einem Railway-Volume ersetzt (schneller, keine Graph-Abweichungen mehr).

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
Microsoft identity platform (login.microsoftonline.com/common) — nur Login (id_token)

Fastify-Backend → Railway-Volume (DATA_DIR)
   → eine <tid>.<oid>.json pro Nutzer: { habits: [...], entries: [...] }
```

Kein eigenes Datenbanksystem — jeder Nutzer hat eine JSON-Datei auf dem Railway-Volume (`backend/src/store/fileStore.ts`). Schreibzugriffe pro Nutzer laufen nacheinander (In-Process-Lock) und atomar (Temp-Datei + Rename). Microsoft wird nur für den Login verwendet, nicht für die Datenspeicherung. Sessions sind zustandslos: ein verschlüsselter, signierter Cookie (`@fastify/secure-session`) statt eines Server-seitigen Session-Stores — passt zu zustandslosen Deployment-Umgebungen wie Railway.

## Tech-Stack

- **Backend**: Fastify + TypeScript
- **Frontend**: Vue 3 + TypeScript, Vite, vue-router
- **Auth**: Microsoft OAuth2 (Authorization Code + PKCE), private und Arbeits-/Schulkonten
- **Datenspeicherung**: JSON-Datei pro Nutzer auf einem Railway-Volume
- **Deployment (geplant, M7)**: Railway.com, ein einzelner Service (Backend liefert die gebaute SPA selbst aus)

## Projektstruktur

```
backend/src/
  auth/         OAuth-Flow (oauth.ts, routes.ts), Session-Prüfung (requireAuth.ts)
  store/        Datei-Speicherung pro Nutzer (fileStore.ts: load/save mit Lock pro Nutzer)
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
5. **API permissions** → Microsoft Graph → Delegated permissions: `openid`, `profile`. (`Files.ReadWrite.AppFolder` und `offline_access` werden nicht mehr gebraucht und können entfernt werden.)

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
   | `DATA_DIR` | `/data` (Mount-Pfad des Volumes, siehe nächster Schritt) |

   `FRONTEND_URL`, `MS_IDENTITY_BASE_URL` **nicht setzen** (leer lassen) — das Produktionsverhalten hängt genau davon ab, dass sie fehlen. `PORT` nicht manuell setzen, Railway injiziert es automatisch.
   Ausserdem in den Service-Settings:
   - **Volume** anlegen und an den Service hängen, Mount-Pfad `/data`. Ohne Volume gehen bei jedem Deploy alle Daten verloren.
   - **Volume-Backups** in den Volume-Settings aktivieren (Verfügbarkeit je nach Railway-Plan prüfen).
   - **App Sleeping** ausgeschaltet lassen und eine **EU-Region** wählen — sonst wird die App langsam.
   - Hinweis: Ein Service mit Volume läuft als einzelne Instanz und hat bei jedem Deploy wenige Sekunden Downtime.
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

- **Datenschutz**: Die App speichert Gesundheitsdaten aller Nutzer selbst. Für einen öffentlichen Betrieb fehlen noch Konto-/Datenlöschung, Datenexport und eine Datenschutzerklärung (nDSG/DSGVO).
- **M7 (Railway-Deployment)**: noch nicht umgesetzt.
