# AGENTS.md

Bar La Marbella — restaurant/bar management app (kiosk POS, staff hours & payroll,
inventory/costs, purchasing, cash/treasury, public digital menu, AI copilot).
Stack: Next.js 16 (App Router, React 19, webpack) + Supabase (Auth + Postgres + Storage).

The canonical project state and business rules live in `PROJECT_STATUS.md` (source of
truth) and `context/`. Read those before making functional changes.

## Cursor Cloud specific instructions

### Services
Single service: the Next.js app. There is no separate backend to run — the backend is
a hosted **remote Supabase project** (`feqjbwxkelpgzsdiphei.supabase.co`). The app talks
to it directly via `@supabase/ssr`. There is no local Supabase / Docker setup (no
`supabase/config.toml`, no seed); development runs against the remote project.

### Standard commands (see `package.json` scripts)
- Dev server: `npm run dev` (Next.js on http://localhost:3000, webpack).
- Lint: `npm run lint`. NOTE: the repo currently has many pre-existing lint
  errors/warnings — a non-clean lint result is expected, not caused by your setup.
- Unit tests: `npm run test:hours-engine` (Node test runner over the hours-engine
  TypeScript suites; ~124 tests, all green). Other `test:hours-engine:*` scripts run
  individual suites. These tests are pure logic and need no DB/env.
- Build: `npm run build` (Next.js production build; not needed for dev).

### Required env (`.env.local`)
The app will not boot without Supabase env vars. A `.env.local` is created during setup
with the **public** Supabase URL + anon key (both are non-secret and already committed in
repo helper scripts such as `test-supabase.js`). If `.env.local` is missing, recreate it:

```
NEXT_PUBLIC_SUPABASE_URL=https://feqjbwxkelpgzsdiphei.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from test-supabase.js>
```

`.env.local` is gitignored, so it is never committed and may need recreating on a fresh VM.

### What works with only the anon key
Public, read-only flows work end-to-end (they hit the remote DB via RLS with the anon
role): the public digital menu `/carta` (reads real menu data), and the other public
routes exempted in `src/proxy.ts` (`/eventos`, `/pedido`, `/reporte`, `/login`).

### Auth & the proxy (gotchas)
- `src/proxy.ts` (Next.js middleware, note: file is `proxy.ts`, the new Next.js name)
  guards every non-public route. With no session it redirects to `/login`, so hitting
  `/` returns a 307 → `/login`. This is correct behavior, not a bug.
- Login uses Supabase `signInWithPassword` — there is **no self-service signup**. Testing
  any authenticated flow (dashboard, staff, master, KDS, etc.) requires real credentials
  for an account that exists in the remote Supabase project. Provide these via Secrets /
  a test login; they are not present by default.
- The proxy intentionally uses `getSession()` (not `getUser()`) with short timeouts to
  avoid hanging; keep that in mind when debugging auth redirects.

### Sensitive env that unlocks extra features (optional, not needed to boot)
Set as Secrets when the related feature is under test:
- `SUPABASE_SERVICE_ROLE_KEY` — service-role reads/writes used by cron cleanup routes,
  `/api/nominas/*`, and `/api/webhooks/*`.
- `OPENAI_API_KEY` (+ `STT_PROVIDER`) — AI copilot / speech-to-text (`/api/ai/*`).
- `GEMINI_API_KEY` — recipe/scanner OCR imports.
- `VAPID_*` / `WEBHOOK_SECRET` / `VOICE_WS_SECRET` — push notifications, webhooks, voice WS.

The optional real-time voice WS server documented in `README.md` (`voice-server/`) is not
present on this branch, so ignore it unless that directory is added.
