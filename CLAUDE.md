# CLAUDE.md - Bar La Marbella

## Project Overview

Bar La Marbella is a full-stack hospitality management system for a bar/restaurant business. It handles staff time tracking, payroll/overtime calculations, cash management, recipe/ingredient costing, and schedule editing. The app serves two user roles: **manager** (admin dashboard) and **staff** (employee self-service).

The primary language of the UI and comments is **Spanish**. Keep new UI strings and code comments in Spanish to maintain consistency.

## Tech Stack

- **Framework:** Next.js 16.1.4 (App Router)
- **Language:** TypeScript 5
- **UI:** React 19.2.3, Tailwind CSS 3.4.1
- **Database & Auth:** Supabase (PostgreSQL + Auth via `@supabase/ssr`)
- **Icons:** lucide-react
- **Notifications:** sonner (toast)
- **Date handling:** date-fns
- **Class merging:** clsx + tailwind-merge (via `cn()` in `src/lib/utils.ts`)
- **Font:** Inter (Google Fonts)
- **PWA:** Configured via `public/manifest.json`

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run start    # Serve production build
npm run lint     # Run ESLint
```

There is no test framework configured. No automated tests exist.

## Project Structure

```
src/
├── app/                        # Next.js App Router pages
│   ├── layout.tsx              # Root layout (Navbar, MainWrapper, BottomNav)
│   ├── page.tsx                # Root redirect to /staff/dashboard
│   ├── globals.css             # Tailwind base + safe-area CSS
│   ├── actions/                # Server Actions
│   │   └── overtime.ts         # Overtime calculation logic
│   ├── login/                  # Auth page
│   ├── profile/                # User profile
│   ├── dashboard/              # Admin-only section
│   │   ├── page.tsx            # Main admin dashboard
│   │   ├── closing/            # Cash closing workflow
│   │   ├── treasury/           # Treasury management
│   │   ├── labor/              # Labor cost analytics
│   │   ├── movements/          # Cash movement history
│   │   ├── overtime/           # Overtime management
│   │   └── history/            # Historical data
│   ├── staff/                  # Employee section
│   │   ├── dashboard/          # Staff main view
│   │   ├── history/            # Work history
│   │   └── schedule/           # Schedule view + editor
│   ├── recipes/                # Recipe management (+ /[id] detail, /import)
│   ├── ingredients/            # Ingredient management
│   └── registros/              # Attendance records
├── components/                 # Shared React components
│   ├── Navbar.tsx              # Top bar with logo, user greeting, role toggle
│   ├── Sidebar.tsx             # Desktop sidebar
│   ├── BottomNavAdmin.tsx      # Mobile bottom nav (admin)
│   ├── BottomNavStaff.tsx      # Mobile bottom nav (staff)
│   ├── BottomNavWrapper.tsx    # Conditional nav switcher
│   ├── MainWrapper.tsx         # Content wrapper
│   ├── TimeTracker.tsx         # Clock in/out component
│   ├── CreateRecipeModal.tsx   # Recipe creation modal
│   ├── CreateIngredientModal.tsx
│   └── ui/                     # Small reusable UI pieces
│       ├── ActionButton.tsx
│       ├── RecipeCard.tsx
│       └── SidebarIcon.tsx
├── lib/
│   └── utils.ts                # cn() class merging utility
├── types/
│   └── index.ts                # TypeScript interfaces (Database, Recipe, Ingredient)
├── utils/
│   └── supabase/
│       ├── client.ts           # Browser-side Supabase client
│       ├── server.ts           # Server-side Supabase client (cookie-based)
│       └── middleware.ts       # Supabase middleware helper
└── middleware.ts               # Auth guard + role-based route protection
```

Other important top-level files:
- `PROJECT_STATUS.md` — Canonical project status; lists completed and pending features.
- `.agent/rules/marbella-architect-protocol.md` — Domain-specific AI development rules and specialist skill definitions.
- `public/manifest.json` — PWA manifest (theme color `#5B8FB9`).

## Architecture Patterns

### Rendering & Data Fetching

- Most pages are **client components** (`'use client'`) that fetch data via Supabase client in `useEffect`.
- Server-side logic uses **Server Actions** (`'use server'`) — currently used for overtime calculations (`src/app/actions/overtime.ts`). The project intends to migrate more logic to Server Actions over time.
- The root layout (`src/app/layout.tsx`) renders `Navbar`, `MainWrapper`, and `BottomNavWrapper` around all pages.

### Authentication & Authorization

- **Supabase Auth** with email/password, managed via SSR cookies.
- **Middleware** (`src/middleware.ts`) runs on every request:
  - Unauthenticated users are redirected to `/login`.
  - Staff users are blocked from `/dashboard` (redirected to `/staff/dashboard`).
  - Authenticated users accessing `/login` are redirected to `/`.
- Two Supabase client factories:
  - `src/utils/supabase/client.ts` — for browser-side (Client Components).
  - `src/utils/supabase/server.ts` — for server-side (Server Actions, Server Components).

### State Management

- **React hooks only** (`useState`, `useEffect`). No external state library.
- No React Context or global store — each page manages its own state.
- User role/profile is fetched per-page from Supabase.

### Routing

- Two main route groups: `/dashboard/*` (admin/manager) and `/staff/*` (employees).
- Dynamic route: `/recipes/[id]` for recipe detail.
- `/` redirects to `/staff/dashboard`.

## Database

### Supabase Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles: role (`staff`/`manager`), hourly rates, contracted hours |
| `time_logs` | Clock in/out records |
| `weekly_snapshots` | Weekly hour balances, payment status (`is_paid`) |
| `recipes` | Recipe definitions with pricing |
| `ingredients` | Ingredient master data with prices and allergens |
| `recipe_ingredients` | Recipe-ingredient relationships with quantities |

### Key DB Fields

- `profiles.prefer_stock_hours` — If `true`, overtime accrues to hour bank; if `false`, generates payment.
- `profiles.contracted_hours_weekly` — Weekly contracted hours for overtime calculation.
- `profiles.regular_cost_per_hour` / `overtime_cost_per_hour` — Payroll rates.
- `weekly_snapshots.hours_balance` — Running overtime balance.

### Database Conventions

- Existing column names (`prefer_stock_hours`, `contracted_hours_weekly`) must be preserved to avoid schema breakage.
- RLS (Row Level Security) is required for every table.
- Always verify `auth.user` in Server Actions before DB operations.
- Prefer database functions/triggers for critical business logic (e.g., cash closing).

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

No `.env.example` file exists. Both variables use the `NEXT_PUBLIC_` prefix (exposed to browser).

## Styling Conventions

- **Tailwind CSS only** — no inline styles, no CSS modules.
- **Primary color:** `#5B8FB9` (Marbella Blue), used as body background and theme color.
- Use `cn()` from `@/lib/utils` for conditional/merged class names.
- **Touch targets:** All interactive elements must be minimum 48px height (kiosk/tablet-first design).
- **Layout pattern:** "Bento Grid" style with `rounded-xl`, `shadow-sm`, `border-zinc-100`.
- Icons use `lucide-react` exclusively.
- Toast notifications use `sonner`.
- The UI follows an "Apple Human Interface for Hospitality" aesthetic: high contrast, clean white backgrounds.

## Business Logic Rules

### Overtime / Payroll (`auditor-horas-nominas`)

- Always check `prefer_stock_hours` (called `AcumulaHoras` in business terms) **first**:
  - If `true`: overtime adds to `hours_balance` (hour bank / debt).
  - If `false`: overtime generates a payment alert.
- Use exact minutes/decimals (e.g., 8.5h). No rounding before final step.
- Weekly balances must persist to DB, not just be calculated on the fly.
- Flag any shift > 12h as a potential error.

### Financial / Costing (`gestor-stock-costes`)

- Strict separation between "Sale Price" (PVP) and "Cost Price".
- Watch for floating-point errors in money calculations.
- Margins cannot exceed +/-100% without a warning.

### Labor Cost KPI

- Labor Cost / Sales ratio > 35% triggers a critical alert.

## Path Aliases

Defined in `tsconfig.json`:
- `@/*` maps to `./src/*`
- `@components/*` maps to `./src/components/*`

## Key Conventions for AI Development

1. **Read `PROJECT_STATUS.md` before making changes** to understand what's done and what's pending.
2. **Read `.agent/rules/marbella-architect-protocol.md`** for domain-specific rules when working on UI, database, payroll, or financial logic.
3. **Keep UI text in Spanish** to match the existing codebase.
4. **Do not rename existing DB columns** — use the current naming convention to avoid schema breakage.
5. **Always use Tailwind** for styling; never inline styles.
6. **Use `cn()`** for class name merging, never manual string concatenation.
7. **Minimum 48px touch targets** for all interactive elements.
8. **RLS is mandatory** on any new Supabase table.
9. **Server Actions** should verify `auth.user` before any database operation.
10. **Update `PROJECT_STATUS.md`** when completing features or adding new tables/functionality.
