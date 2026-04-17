# Bar La Marbella — Contexto para LLM (prompt-ready)

Este documento está diseñado para **copiar/pegar** como contexto en un LLM cuando se vaya a trabajar en este repositorio.

---

## 1) Identidad del proyecto (qué es)

**Bar La Marbella** es un sistema operativo táctil para hostelería con varios dominios:

- **Sala (Radar en vivo)**: estado de mesas/tickets en tiempo real.
- **KDS (Cocina)**: comandas y líneas, reconciliadas por deltas desde el Radar.
- **Tesorería / Caja**: movimientos, arqueos, cierres, diferencia físico vs teórico.
- **Personal**: asistencia, fichajes, horarios, horas extra y snapshots semanales.
- **Propinas**: pools y reparto calculado en SQL.
- **Recetas / escandallo**: recetas, ingredientes, conversiones y coste.
- **Proveedores / albaranes**: extracción cognitiva (IA) + mapeo proveedor→ingrediente + actualización de precios.
- **Pedidos**: pedidos a proveedores, PDFs y limpieza automática por cron.
- **IA integrada**: chat (y voz/tiempo real en partes) con RBAC y registro de llamadas.

---

## 2) Stack (confirmado en repo)

- **Framework**: Next.js **16.1.4** (App Router)
- **UI**: React **19.2.3**
- **Lenguaje**: TypeScript (strict)
- **CSS**: TailwindCSS (sin estilos inline)
- **Iconos**: `lucide-react`
- **Estado**: `zustand`
- **Notificaciones UI**: `sonner`
- **PDF/Excel/Imagen**: `jspdf`, `jspdf-autotable`, `xlsx`, `papaparse`, `html-to-image`, `pdfjs-dist`, `pdf2json`
- **Backend**: Supabase (Postgres + Auth + RLS + Realtime + Storage)
  - SSR: `@supabase/ssr` (cookies)
- **Build**: Webpack forzado (por estabilidad en Vercel)

---

## 3) Reglas duras del proyecto (NO negociables)

### UX / Frontend (táctil)
- **Touch-first**: cualquier elemento interactivo debe ser cómodo al tacto (targets ~48px+).
- **Bento layout**: tarjetas limpias, bordes suaves, sombras contenidas.
- **Flexbox safety**: las botoneras/zonas táctiles **no deben colapsar** (p. ej. `shrink-0` donde aplique).

### Display
- **Regla Zero-Display**: en vistas de lectura (no formularios), cualquier valor igual a **0** debe mostrarse como **" "** (espacio) para evitar ruido visual.

### Fechas / Zona horaria
- **Timezone immunity**: prohibido `new Date('YYYY-MM-DD')` para fechas locales (provoca shifts). Usar:
  - `new Date(y, m - 1, d)` o
  - utilidades safe del proyecto (`parseTPVDate`, `parseDBDate`, `getStartOfLocalToday`, etc.).
- **Anti-ISO-slice (cuando aplique)**: no manipular strings DateTime SQL/BDP con slices ingenuos sin limpiar `T`/`Z`.

### Backend / Supabase
- **RLS obligatorio** para tablas (policies explícitas).
- **Anti-silent failures**: no esconder ausencia de datos o errores críticos; la UI debe alertar (toast/error) o el servidor debe `throw`.
- **No inventar esquema**: no inventes nombres de tablas/columnas. Si falta confirmación, consulta `schema_dump.sql` o migraciones.

---

## 4) Arquitectura y seguridad (Supabase SSR + RBAC)

### SSR Supabase
- Server: `createServerClient` con cookies (`src/utils/supabase/server.ts`).
- Client: `createBrowserClient` (`src/utils/supabase/client.ts`).

### Middleware (RBAC + bypass)
- **Bypass crítico**: `/api/*` pasa sin auth para evitar redirecciones que rompan ingestas automáticas.
- Protección global: sin sesión → `/login`.
- Staff/supervisor bloqueados de `/dashboard/*` salvo excepciones operativas (ver `src/middleware.ts`).

---

## 5) Rutas (App Router) — mapa mental

### Manager / gestión (`/dashboard/*`)
- Sala: `/dashboard/sala`
- KDS: `/dashboard/kds`
- Ventas: `/dashboard/ventas`
- Tesorería: `/dashboard/movements`
- Cierres: `/dashboard/history`
- Ledger: `/dashboard/ledger`
- Mano de obra: `/dashboard/labor`
- Horas extra: `/dashboard/overtime`
- Propinas: `/dashboard/propinas`
- Imports: `/dashboard/import`, `/dashboard/recetas-import`
- Albaranes precios (foto + mapeo): `/dashboard/albaranes-precios`

### Staff (`/staff/*`)
- `/staff/dashboard`
- `/staff/history`
- `/staff/schedule`
- etc.

### Perfil
- `/profile` (vista por rol: staff / manager-self / manager-employee)

---

## 6) API Routes (exactas)

### Webhooks
- `POST /api/webhooks/albaranes`
  - Auth: `Authorization: Bearer WEBHOOK_SECRET`
  - Requiere: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`
  - Flujo: Gemini extrae JSON → sube PDF a bucket `albaranes` → inserta cabecera en `purchase_invoices` y líneas en `purchase_invoice_lines`.
- `POST /api/webhooks/nominas`
  - Auth: `Authorization: Bearer WEBHOOK_SECRET`
  - Usa: service role
  - Flujo: parse PDF (pdf2json) → extrae DNI/NIE válido → sube a bucket `nominas` → inserta fila en `nominas` (y opcional en `employee_documents`).

### Cron
- `GET /api/cron/cleanup-order-pdfs`
  - Auth: `Authorization: Bearer CRON_SECRET` (si existe)
  - Usa: service role
  - Flujo: borra PDFs >7 días del bucket `orders` y pone `purchase_orders.pdf_url = null`.

### Serving seguro (documentos en dominio app)
- `GET /api/nominas/open?owner=<uuid>&path=<storagePath>`
- `GET /api/employee-documents/open?owner=<uuid>&path=<storagePath>&tipo=<comunicado|contrato|sancion>`

---

## 7) DB (esquema confirmado) — tablas y RPCs útiles

**Fuente**: `schema_dump.sql` (y migraciones `supabase/migrations/`).

### Tablas (principales)
- IA: `ai_call_logs`, `ai_chat_sessions`, `ai_chat_messages`
- Tesorería: `cash_boxes`, `cash_box_inventory`, `treasury_log`, `cash_closings`, `denominations_log`, `weekly_closings_log`
- Personal/horas: `profiles`, `time_logs`, `weekly_snapshots`, `shifts`
- Ventas: `tickets_marbella`, `ticket_lines_marbella`, `ventas_marbella`
- Recetas/ingredientes: `recipes`, `recipe_ingredients`, `ingredients`, `ingredient_price_history`, `categories`
- Proveedores/albaranes: `suppliers`, `purchase_invoices`, `purchase_invoice_lines`, `supplier_item_mappings`
- Pedidos: `purchase_orders`, `purchase_order_items`, `order_drafts`
- Documentos: `nominas`, `nominas_excepciones`, `employee_documents`
- TPV catálogo: `bdp_articulos`, `bdp_departamentos`, `bdp_familias`, `map_tpv_receta`

### RPCs / funciones (nombres exactos)
- Ventas:
  - `get_daily_sales_stats(target_date date) -> jsonb`
  - `get_hourly_sales(p_start_date date, p_end_date date) -> table(fecha, hora, total)`
  - `get_ticket_lines(p_numero_documento text) -> table(...)`
  - `get_product_sales_ranking(p_start_date date, p_end_date date) -> table(...)`
- Tesorería:
  - `get_operational_box_status() -> table(box_id, theoretical_balance, physical_balance, difference)`
  - `get_treasury_period_summary(p_box_id uuid, p_start_date timestamptz, p_end_date timestamptz) -> table(income, expense)`
  - `get_theoretical_balance(target_date timestamptz) -> numeric`
- Personal/horas:
  - `get_monthly_timesheet(p_user_id uuid, p_year int, p_month int) -> jsonb`
  - `get_worker_weekly_log_grid(p_user_id uuid, p_start_date date, p_contracted_hours numeric) -> jsonb`
  - `get_weekly_worker_stats(p_start_date date, p_end_date date, p_user_id uuid) -> jsonb`
  - `rpc_recalculate_all_balances() -> jsonb`
  - `fn_recalc_and_propagate_snapshots(p_user_id uuid, p_start_date date)`
- Cierres:
  - `get_cash_closings_summary(p_start_date date, p_end_date date) -> jsonb`

---

## 8) KDS / Radar (Gemelo Digital) — fuente de verdad

El pipeline operativo TPV→Supabase→KDS está documentado en:
- `context/ARQUITECTURA_SYNC_KDS.md`
- Migraciones KDS (ver `supabase/migrations/20260408*`, `20260417*`, `20260418*`, `20260420*`, etc.)

Nota: este dominio puede no estar reflejado en `schema_dump.sql` si el dump está desfasado respecto a migraciones.

---

## 9) Variables de entorno (lo mínimo que debe conocer un LLM)

- **Supabase (cliente)**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Supabase (server privileged)**:
  - `SUPABASE_SERVICE_ROLE_KEY`
- **Webhooks**:
  - `WEBHOOK_SECRET`
- **IA extracción documentos**:
  - `GEMINI_API_KEY`
- **Cron**:
  - `CRON_SECRET`

---

## 10) Prompt corto recomendado (para iniciar trabajo con otro LLM)

Pega esto como “contexto del proyecto”:

> Proyecto Bar La Marbella: Next.js 16 App Router + React 19 + TS + Tailwind, backend Supabase (Auth + RLS + Realtime + Storage) con SSR via @supabase/ssr. Dominio: sala/radar, KDS cocina, tesorería/caja, personal/horas, propinas, recetas/escandallo, pedidos, proveedores/albaranes cognitivos y documentos empleados. Regla clave: frontend tonto (agregaciones/reglas en SQL RPCs), RLS estricto, anti-silent-fail, zero-display (0→" "), y fechas inmunes a timezone shifts (prohibido new Date('YYYY-MM-DD')). No inventes columnas/tabla; usa schema_dump.sql y migraciones como fuente de verdad.

