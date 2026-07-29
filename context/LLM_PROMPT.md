# Bar La Marbella — Contexto para LLM (prompt-ready)

Este documento está diseñado para **copiar/pegar** como contexto en un LLM cuando se vaya a trabajar en este repositorio.

> Optimizado tras auditoría 2026-06-05 para consumo autónomo (~90/100). Ver `llm_context_audit.md` para el informe completo.

---

## 0) Mantenimiento (OBLIGATORIO)

Este archivo (`context/LLM_PROMPT.md`) es un **artefacto "prompt-ready"**. Debe estar **siempre** actualizado y listo para copiar/pegar.

### Jerarquía de fuentes (en caso de conflicto)

1. **Código en `src/` y `supabase/migrations/`** — verdad ejecutable
2. **`PROJECT_STATUS.md`** — estado funcional y changelog (§17 de este doc se auto-genera desde aquí)
3. **`context/LLM_PROMPT.md`** — artefacto producción (editar a mano §§1-16 tras cambios estructurales; §17 no se edita a mano)
4. **`schema_dump.sql`** — referencia esquema (puede ir detrás de migraciones)
5. **`README.md`** — **parcialmente obsoleto** (no confiar en rutas `/api/ai/*`)

### Sincronización automática (§17)

- Hook Cursor: `.cursor/hooks.json` → al guardar `PROJECT_STATUS.md`
- Hook Git: `.githooks/pre-commit` → `npm run setup:githooks`
- Manual: `npm run sync:llm-prompt` · check: `npm run sync:llm-prompt:check`

### Qué cambios obligan a tocar este archivo (manual §§1-16)

- Nuevas rutas o cambios de comportamiento en `/dashboard/*`, `/staff/*`, `/api/*`, `/carta`
- Nuevas tablas/columnas/RPCs/triggers/RLS o cambios de permisos
- Cambios de stack/versiones, build (Webpack), o librerías base
- Nuevas variables de entorno o cambios en nombres/contratos
- Nuevas "reglas duras" del proyecto (UX táctil, fechas, zero-display, anti-silent)

### Documentación satélite (leer según tarea)

| Archivo | Cuándo leerlo |
|---------|---------------|
| `context/INGREDIENTS_PRECIOS_Y_ALBARANES.md` | Precios ingredientes, tríada albarán, `per_pack` |
| `context/ARQUITECTURA_SYNC_KDS.md` | KDS, telemetría, reconciliación |
| `context/HORAS_SNAPSHOTS_Y_ARRASTRE.md` | Nóminas, snapshots, arrastre horas |
| `context/index.txt` | Puente TPV Node (ventas, telemetría, caja) |
| `context/server.txt` | Gateway Linux receptor BDP |
| `context/DEPLOY_BDP_VENTAS.txt` | Runbook despliegue ventas TPV |
| `context/Mapa_Tablas_BDP.txt` | Esquema SQL Server origen |
| `supabase/migrations/README_MIGRACIONES.md` | Renombres migraciones legacy |

---

## 1) Identidad del proyecto

**Bar La Marbella** es un sistema operativo táctil para hostelería (Next.js + Supabase). Dominios:

| Dominio | Descripción | Ruta principal |
|---------|-------------|----------------|
| **Sala / Radar** | Estado mesas/tickets tiempo real | `/dashboard/sala` |
| **KDS Cocina** | Comandas desde `estado_sala` | `/dashboard/kds` |
| **Ventas** | Tickets BDP, KPIs diarios | `/dashboard/ventas` |
| **Insights / Finanzas** | PyG, cash flow, rentabilidad horaria (**NO** existe `/dashboard/finanzas`) | `/dashboard/insights` |
| **Tesorería** | Movimientos, arqueos, cierres | `/dashboard/movements`, modal cierre |
| **Personal** | Fichajes, horarios, horas extra, snapshots | `/staff/dashboard`, `/dashboard/overtime` |
| **Propinas** | Pools, reparto SQL, sanciones | `/dashboard/propinas`, `/staff/propinas` |
| **Recetas / escandallo** | Costes, ingredientes, mapeo TPV | `/recipes`, `/dashboard/recetas-tpv` |
| **Carta digital** | QR público, edición staff, Plato Marbella 3 tramos | `/carta`, `/staff/carta` |
| **Reservas** | RPC + Realtime | `/staff/reservas` |
| **Albaranes** | OCR Gemini, mapeo dimensional, stock | `/dashboard/scanner`, `/dashboard/albaranes` |
| **Pedidos proveedor** | PDFs, borrador, cron limpieza | `/orders/new` |
| **Inventario** | Recuento, mermas, ledger | `/dashboard/inventory` |
| **Consumo personal** | Modal fichaje + dashboard orden | `/staff/dashboard`, `/dashboard/consumo-personal` |
| **Eventos / encargos** | Formulario público + admin | `/eventos/[slug]`, `/dashboard/eventos` |
| **Copiloto IA** | Chat + voz OpenAI Realtime + tools RBAC | FAB global `ChatMarbella` |
| **Notificaciones** | In-app + push web (VAPID) | Campana `NotificationsBell` |
| **Perfil empleado** | Avatar, nóminas, DNI, contrato | `/profile` |
| **Horarios** | Plantilla diaria, rentabilidad (Hector) | Modal `ScheduleDayEditor` |
| **Hub Master** | Solo Hector — 3 pantallas | `/master/dashboard` |
| **PWA** | Instalable, service worker | `public/sw.js`, `manifest.json` |

---

## 2) Stack tecnológico

| Capa | Tecnología | Notas |
|------|------------|-------|
| Framework | Next.js **16.2.6** App Router | Webpack forzado: `--webpack` |
| UI | React **19.2.6**, Tailwind 3.4 | `cn()` de `@/lib/utils`; sin inline styles |
| Lenguaje | TypeScript strict | Paths `@/*`, `@components/*` |
| Estado cliente | Zustand (`src/store/aiStore.ts`) | Solo IA chat principalmente |
| Validación | Zod 4.4 | Server Actions y copilot tools |
| Gráficos | Recharts | `/dashboard/insights` |
| DnD | @dnd-kit | Orden consumo, carta |
| Backend | Supabase (Postgres, Auth, RLS, Realtime, Storage) | SSR `@supabase/ssr` 0.8 |
| IA chat/OCR | Gemini (`GEMINI_API_KEY`), OpenAI (`OPENAI_API_KEY`) | Scanner, copilot, traducción |
| Voz | **OpenAI Realtime API** | `/api/copiloto/voice/token` — **NO** LiveKit en runtime |
| PDF/Excel | jspdf, xlsx, papaparse, pdfjs, sharp | |
| Notificaciones UI | sonner + **sileo** (prod en layout) | `/test-sileo` página prueba |
| Push | web-push + VAPID | `ServiceWorkerRegistration.tsx` |

**Dependencias instaladas sin uso en `src/`:** `@n8n/chat`, paquetes LiveKit — no configurar ni importar sin verificar.

---

## 3) Reglas duras (NO negociables)

### UX táctil
- Targets **≥48px** (`min-h-12`)
- Bento: `rounded-xl`, `shadow-sm`, `border-zinc-100`
- Botoneras inferiores: `shrink-0`; contenido scroll: `flex-1`

### Zero-Display
- Vistas de **lectura** (no formularios): valor `0` → espacio `" "`

### Fechas / timezone
- **PROHIBIDO** `new Date('YYYY-MM-DD')` para fechas locales → `new Date(y, m-1, d)`
- **SSOT fechas negocio:** `src/utils/date-utils.ts` (`parseTPVDate`, `formatTicketTimeMadrid`, `parseRadiografiaTimestamp`)
- **⚠️ TRAMPA:** `src/lib/date-utils.ts` es solo ISO-week UTC — **no** usar para UI operativa
- **BDP ingesta:** UTC con sufijo `Z` (`context/index.txt` `toIso()`); display Madrid con `formatInTimeZone`
- **Anti-ISO-slice:** limpiar `T`/`Z` antes de manipular DateTime SQL/BDP

### Supabase / backend
- **RLS obligatorio** en tablas nuevas
- **Anti-silent failures:** `toast.error` o `throw`; nunca `if (!data) return` en flujos críticos
- **No inventar esquema** — confirmar en `supabase/migrations/`
- **QUERY SAFETY:** prohibido `.not('column', 'in', [array])` → `.neq()` encadenados u `.or()`
- **Auth guards:** `getSession()` en proxy/layout (no `getUser()` — cuelga)
- **Borrado stock albarán:** RPC `delete_stock_movements_for_*` (no DELETE directo)

### Horas / nóminas
- Revisar **`AcumulaHoras`** en perfil primero
- Extras UI: solo semanas completadas (`p_only_completed_weeks`)
- Fichajes especiales: horas desde `clock_in`/`clock_out` (no 8h fijas)
- Turnos >12h → flag error potencial

### Dinero / stock / albaranes
- PVP ≠ coste; funciones en `lib/utils.ts`, `lib/recipe-cost.ts`
- **Tríada dimensional obligatoria:** `line_billing_unit`, `line_content_qty`, `line_content_unit`
- Precio catálogo: RPC `invoice_line_price_to_purchase_unit` — no dividir en TS a ciegas
- Stock idempotente: `reference_doc = 'ALB-LINE-<lineId>'`
- Estados línea: `pending_mapping` | `mapped` | `excluded` | `expense_only`

---

## 4) Arquitectura técnica

```
[TPV BDP] --context/index.txt--> [Gateway server.txt] --POST--> [/api/webhooks/bdp/*]
                                                                      |
[PWA Browser] --> [src/proxy.ts] --> [RSC pages + Server Actions] --> [Supabase PG + Storage]
                     |                        |
                     +--> [/api/copiloto/*] --> [OpenAI / Gemini]
```

| Capa | Ubicación |
|------|-----------|
| Guard rutas | `src/proxy.ts` (no `middleware.ts`) |
| SSR Supabase | `src/utils/supabase/server.ts` |
| Browser Supabase | `src/utils/supabase/client.ts` |
| Server Actions | `src/app/**/actions.ts`, `src/app/actions/*.ts` |
| API Routes | `src/app/api/**/route.ts` |
| Tipos DB | `src/types/supabase.ts` (regenerar tras migraciones) |

**next.config.ts:** `serverActions.bodySizeLimit: 12mb`, `optimizePackageImports: lucide-react, date-fns`, `serverExternalPackages: pdf-parse, sharp`.

---

## 5) Mapa de localización — "¿Dónde toco qué?"

| Funcionalidad | Ruta | Archivo principal | Actions |
|---------------|------|-------------------|---------|
| Insights / PyG | `/dashboard/insights` | `InsightsClient.tsx` | `dashboard/insights/actions.ts` |
| Albaranes lista | `/dashboard/albaranes` | `AlbaranesHistoricoClient.tsx` | `dashboard/albaranes/actions.ts` |
| Escáner OCR | `/dashboard/scanner` | `ScannerClient.tsx` | `dashboard/scanner/actions.ts` |
| Mapeo línea | Modal | `LineMappingModal.tsx` | `confirmInvoiceLineMappingAction` |
| Cierre caja | Modal | `CashClosingModal.tsx` | `actions/cash-closing-photos.ts` |
| Fichaje staff | `/staff/dashboard` | `StaffDashboardView.tsx` | `staff/actions.ts` |
| Consumo fichaje | Modal | `ConsumptionModal.tsx` | `process_staff_consumption` RPC |
| Horarios | Modal | `ScheduleDayEditor.tsx` | `actions/overtime.ts` |
| Propinas admin | `/dashboard/propinas` | `TipsDashboardView.tsx` | RPC preview/confirm |
| Propinas staff | `/staff/propinas` | `StaffPropinasView.tsx` | — |
| Reservas | `/staff/reservas` | `ReservasClient.tsx` | `consultar_reservas` RPC |
| Carta pública | `/carta` | `PublicCarta.tsx` | — |
| Carta staff | `/staff/carta` | `StaffCartaView.tsx` | `dashboard/carta/actions.ts` |
| Eventos admin | `/dashboard/eventos` | `eventos/page.tsx` | `dashboard/eventos/actions.ts` |
| Pedido evento | `/eventos/[slug]` | `eventos/[slug]/page.tsx` | `create_event_order` RPC |
| Copiloto | FAB global | `ChatMarbella.tsx` | `lib/copilot/*` |
| Notificaciones | Navbar | `NotificationsBell.tsx` | `actions/notifications.ts` |
| KDS | `/dashboard/kds` | `dashboard/kds/page.tsx` | `useKDSv2.ts` |
| Inventario | `/dashboard/inventory` | `inventory/page.tsx` | `inventory/actions.ts` |
| Master hub | `/master/dashboard` | `MasterShortcutGrid.tsx` | — |

**Layouts globales:** `src/app/layout.tsx` monta Navbar, BottomNav, Chat, SW, Notificaciones, Onboarding, Sileo.

---

## 6) Rutas App Router (completas)

### Público (sin login)
- `/carta`, `/carta/*`
- `/eventos`, `/eventos/[slug]`

### Auth
- `/login`
- `/` → redirect por rol (`getHomeHrefForUser`)

### Master (solo `hhector7722@gmail.com`)
- `/master/dashboard`

### Dashboard admin/manager (`/dashboard/*`)
- `/dashboard` — hub
- `/dashboard/sala`, `/dashboard/kds`, `/dashboard/ventas`
- `/dashboard/insights` — **PyG + finanzas + BI** (manager/admin only)
- `/dashboard/eventos`, `/dashboard/eventos/[eventId]/pedidos`, `/dashboard/eventos/pedidos`
- `/dashboard/movements`, `/dashboard/history`, `/dashboard/ledger`
- `/dashboard/labor`, `/dashboard/overtime`, `/dashboard/propinas`
- `/dashboard/albaranes`, `/dashboard/scanner`, `/dashboard/albaranes-precios`
- `/dashboard/inventory`, `/dashboard/inventory/waste`, `/dashboard/inventory/ledger`
- `/dashboard/consumo-personal`
- `/dashboard/import`, `/dashboard/recetas-import`, `/dashboard/recetas-tpv`, `/dashboard/carta`

### Staff (`/staff/*`)
- `/staff` → redirect `/staff/dashboard`
- `/staff/dashboard`, `/staff/history`, `/staff/carta`, `/staff/reservas`, `/staff/propinas`
- `/staff/actividades` — calendario mensual pabellón (acceso desde modal Horarios)
- `/staff/actividades/revision` — revisión/guardado actividades desde PDF parseado
- `/staff/actividades/gestion` — CRUD actividades, merge, color (solo Hector)

### Operativa general (auth según RLS)
- `/recipes`, `/recipes/[id]`, `/recipes/import`
- `/ingredients`, `/suppliers`, `/orders/new`
- `/profile`, `/registros`
- `/admin/import`, `/admin/mapeo`
- `/reporte` — formulario **público** fin de semana (registrar actividades pabellón)

### Dev / pruebas
- `/test-sileo` — toasts sileo

### ⚠️ Ruta que NO existe
- `/dashboard/finanzas` — **eliminada/absorbida por `/dashboard/insights`**

---

## 7) API Routes

| Método | Ruta | Auth | Propósito |
|--------|------|------|-----------|
| POST | `/api/webhooks/bdp/ventas` | Bearer `WEBHOOK_SECRET` | Tickets cobrados |
| POST | `/api/webhooks/bdp/telemetria` | Bearer | Sala → `estado_sala` |
| POST | `/api/webhooks/bdp/caja` | Bearer | `bdp_cash_movements` |
| POST | `/api/webhooks/albaranes` | — | **410 Gone** — usar scanner |
| POST | `/api/webhooks/nominas` | Bearer + service role | PDF nómina |
| POST | `/api/webhooks/nominas-summary` | Bearer | Resumen coste empresa |
| POST | `/api/webhooks/pavilion-activities` | Apps Script | Ingesta PDFs pabellón |
| POST | `/api/webhooks/reservations-push` | service role (pg_net) | Push notif nueva reserva |
| GET | `/api/cron/cleanup-order-pdfs` | Bearer `CRON_SECRET` | PDFs >7d |
| GET | `/api/cron/cleanup-audio` | Bearer `CRON_SECRET` | Audio copiloto |
| POST | `/api/copiloto` | Sesión | Chat |
| POST | `/api/copiloto/tools` | Sesión | Tool calling |
| POST | `/api/copiloto/transcribe` | Sesión | STT OpenAI |
| GET | `/api/copiloto/voice/token` | Sesión | **OpenAI Realtime** sesión voz |
| GET | `/api/eventos/[eventId]/export` | manager/admin | CSV pedidos |
| GET | `/api/nominas/open` | Auth | Serving seguro |
| GET | `/api/employee-documents/open` | Auth | Docs empleado |
| POST | `/api/employee-documents/dni` | Auth | Upload DNI |
| POST | `/api/profile/avatar` | Auth | Avatar |
| POST | `/api/usage/event` | Auth | Tracking uso app |

**Bypass proxy:** todo `/api/*` sin auth de cookies (usan sus propios secrets).

---

## 8) Server Actions — índice

### Compartidas (`src/app/actions/`)
- `overtime.ts` — fichajes, horarios, snapshots, eliminar día (Madrid bounds)
- `get-dashboard-data.ts`, `get-treasury-snapshot.ts`
- `cash-box-inventory.ts`, `cash-closing-photos.ts`
- `notifications.ts` — push VAPID
- `profile.ts` — avatar, documentos
- `recalculate.ts`, `import-legacy.ts`, `translate-ca-es.ts`

### Por módulo (`src/app/dashboard/*/actions.ts`)
- `albaranes/`, `scanner/`, `albaranes-precios/`, `insights/`, `carta/`, `carta/photo-actions.ts`
- `eventos/`, `consumo-personal/`, `inventory/`, `inventory/waste/`, `inventory/ledger/`
- `recetas-import/`, `recetas-tpv/`, `recipes/`

### Staff
- `src/app/staff/actions.ts` — clock in/out, consumo

### Legacy (evitar en flujos nuevos)
- `src/lib/actions/albaranes.ts` — `confirmarMapeoAction` FormData

---

## 9) Auth, RBAC y proxy (`src/proxy.ts`)

### Roles
`admin`, `manager`, `supervisor`, `staff`, `chef`

### Staff/supervisor — único subset permitido en `/dashboard/*`
```
/dashboard/propinas
/dashboard/albaranes (+ subrutas)
/dashboard/scanner
/dashboard/eventos (+ subrutas)
```
**Todo otro `/dashboard/*` → redirect `/staff/dashboard`**

### Reglas especiales
- `/dashboard/insights` — solo `manager` y `admin`
- `/master/*` — solo `isMasterDashboardUser(email)`
- `/dashboard/kds` — **NO** accesible staff/supervisor (solo admin/manager)
- Login con sesión → redirect home por rol
- Recovery password en `/profile` con query tokens — bypass login

### Copilot RBAC
`src/lib/copilot/permissions.ts` — `chef` alineado a `supervisor`; `admin` = `manager` (todas las tools).

---

## 10) Base de datos

**Fuente:** `supabase/migrations/` (229 archivos). Prioridad sobre `schema_dump.sql`.

### Tablas principales

| Grupo | Tablas |
|-------|--------|
| Ventas/TPV | `tickets_marbella`, `ticket_lines_marbella`, `ventas_marbella`, `bdp_cash_movements`, `bdp_articulos`, `map_tpv_receta` |
| Sala/KDS | `estado_sala`, `kds_orders`, `kds_order_lines` |
| Tesorería | `cash_boxes`, `cash_box_inventory`, `treasury_log`, `cash_closings`, `denominations_log`, `weekly_closings_log`, `manager_ledger` |
| Finanzas | `fixed_monthly_costs`, `payroll_monthly_totals` |
| Personal | `profiles`, `time_logs`, `weekly_snapshots`, `shifts` |
| Propinas | `tip_distribution_history`, `tip_distribution_lines` |
| Reservas | `reservations` |
| Recetas | `recipes`, `recipe_ingredients`, `ingredients`, `ingredient_price_history`, `categories`, `menu_category_overrides` |
| Carta | `digital_menu_overrides`, vistas `v_digital_menu_items`, `v_public_menu_items` |
| Albaranes | `suppliers`, `purchase_invoices`, `purchase_invoice_lines`, `purchase_invoice_attachments`, `supplier_item_mappings` |
| Stock | `stock_movements` |
| Pedidos | `purchase_orders`, `purchase_order_items`, `order_drafts` |
| Eventos | `events`, `event_products`, `event_default_pack`, `event_orders` |
| Consumo | `staff_consumption_recipe_display_order` |
| IA | `ai_call_logs`, `ai_chat_sessions`, `ai_chat_messages` |
| Notificaciones | `user_notifications` |
| Documentos | `nominas`, `nominas_excepciones`, `employee_documents` |
| Imports | `import_runs` |
| Pabellón | `activities`, `participant_categories`, `activity_kinds`, `venues`, `activity_occurrences`, `pavilion_activity_sheets` |
| Config | `app_settings` (key/value, RLS, ej: `push_webhook_url`) |
| Analytics | `app_usage_events` |

### RPCs críticas

| RPC | Uso |
|-----|-----|
| `get_financial_statement` | PyG periodo |
| `get_period_card_payments` | Cobros tarjeta híbridos |
| `get_closing_sales_breakdown` | Desglose cierre día |
| `get_tip_pool_preview` / `confirm_tip_distribution` | Propinas |
| `invoice_line_price_to_purchase_unit` | Precio albarán → unidad compra |
| `get_recipe_cost` / `convert_pricing_qty` | Escandallo |
| `process_staff_consumption` | Consumo personal |
| `create_event_order` | Pedido evento anónimo |
| `consultar_reservas` / `gestionar_reservas` | Reservas |
| `sync_purchase_invoice_status` | Tick verde albarán |
| `delete_stock_movements_for_purchase_invoice` | Borrado stock |
| `get_weekly_worker_stats` | Horas extra (`p_only_completed_weeks`) |
| `fn_worker_effective_overtime_rate` | Tarifa extras unificada |
| `get_hourly_sales_vs_labor` / `get_product_margin_ranking` | Insights |
| `get_consumption_modal_recipes` | Grid consumo fichaje |
| `is_manager_or_admin()` | Guards SQL |

### Triggers albaranes (críticos)
- `handle_new_invoice_line` — auto-mapeo + precio; RAISE si conversión imposible
- `handle_invoice_line_mapped_stock` — PURCHASE al mapear
- `sync_purchase_invoice_status` — cabecera `mapped` cuando líneas resueltas + stock

### Storage buckets
`albaranes`, `cash_closings`, `carta_items`, `employee_documents`, `nominas`, `orders`, `ai_assets`, `suppliers`

### ⚠️ Migraciones
- Remota `20260515141008` = local `20260515160700_albaranes_strict_unit_conversion.sql` (mismo contenido)
- Colisión timestamp: dos archivos `20260604150000_*` — verificar orden aplicación

---

## 11) Integraciones

### BDP / TPV
- Bridge: `context/index.txt` → `AgenteBDP/index.js` (pm2 `PuenteBDP`)
- Gateway: `context/server.txt`
- Poll ventas + caja 12s; `VENTAS_WHERE` incluye pendientes sin `Hora_Cierre`
- UTC en origen; `diaNegocio` solo Europe/Madrid en gateway

### IA
- **Gemini:** OCR scanner, traducción CA, import legacy
- **OpenAI:** copilot chat, transcribe, **Realtime voice** (no LiveKit)
- Registro: `ai_call_logs`, sesiones `ai_chat_sessions`

### Push notifications
- VAPID keys + `ServiceWorkerRegistration` en layout
- Tabla `user_notifications` + reglas en migraciones `202606031*`

---

## 12) Flujos de negocio (resumen operativo)

### Fichaje salida
1. Consumo modal obligatorio (UI bloquea vacío)
2. `process_staff_consumption` → si falla, salida permitida con log (`consumptionSkipped`)

### Albarán → stock
1. Scanner → líneas `pending_mapping`
2. Mapeo modal → tríada + RPC precio
3. Trigger stock `ALB-LINE-<uuid>`
4. `excluded` / `expense_only` resuelven sin stock; `expense_only` cuenta en PyG

### Cierre caja
1. Sync TPV automático en modal
2. Fotos datáfono + ticket BDP obligatorias
3. `get_closing_sales_breakdown` + INSERT `cash_closings`

### Propinas
1. Preview desde último reparto
2. Sancionados: `shadowAmount` visible, `totalAmount=0` en reparto
3. Confirmación solo manager/admin

### Horas extra
1. `AcumulaHoras` determina banco vs pago
2. Tarifa: `fn_worker_effective_overtime_rate`
3. Recálculo global: pg_cron lunes (DST Madrid)

---

## 13) Variables de entorno

| Variable | Requerida | Uso |
|----------|:---------:|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Webhooks, cron, serving |
| `WEBHOOK_SECRET` | ✅ | BDP + nominas webhooks |
| `GEMINI_API_KEY` | ✅ | Scanner, traducción |
| `OPENAI_API_KEY` | ✅ | Copiloto + voz |
| `CRON_SECRET` | ✅ prod | Crons Vercel |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | push | |
| `VAPID_PRIVATE_KEY` | push | |
| `VAPID_SUBJECT` | opcional | mailto: |
| `NEXT_PUBLIC_MARBELLA_WEB_ORIGIN` | opcional | iframe carta |

---

## 14) DevOps

| Item | Detalle |
|------|---------|
| Deploy | Vercel (git push) |
| Build | `next build --webpack` |
| Crons | `vercel.json`: 03:00 audio, 03:30 PDFs |
| Hooks | Git pre-commit + Cursor afterFileEdit → sync LLM |
| TPV deploy | Copiar `index.txt`/`server.txt`, reiniciar pm2 |
| CI tests | **No configurado** |

---

## 15) Testing y calidad

- **Sin suite formal** (Jest/Vitest/Playwright ausentes)
- Lint: `npm run lint`
- Scripts manuales: `test-supabase.js`, `scripts/check-copilot-voice-schemas.mjs`
- LLM: no asumir CI verde tras cambios

---

## 16) Prompt corto (inicio de sesión)

> Bar La Marbella: Next.js 16 App Router + React 19 + TS + Tailwind + Supabase (RLS, Realtime, Storage). Dominios: sala/radar, KDS (/dashboard/kds, solo admin/manager), tesorería, **Insights** (/dashboard/insights = PyG + finanzas, NO /dashboard/finanzas), personal (AcumulaHoras), propinas (doble vista), recetas, carta QR, reservas, eventos, albaranes (scanner + LineMappingModal, tríada dimensional), pedidos, inventario, consumo, copiloto OpenAI (chat+voz Realtime, NO LiveKit), notificaciones push, PWA. BDP: context/index.txt + server.txt (UTC ingesta, Madrid display). Reglas: zero-display, fechas sin new Date('YYYY-MM-DD'), usar src/utils/date-utils.ts (NO lib/date-utils para UI), proxy getSession(), RPC para stock albarán, .not(in) prohibido. Mapa: §5. Esquema: supabase/migrations + PROJECT_STATUS.md (§17 auto-sync).

---

## 17) Estado actual (snapshot operativo)

<!-- sync:project-status:start — NO EDITAR A MANO; generado por `scripts/sync-llm-prompt-from-project-status.mjs` -->

**Fuente**: `PROJECT_STATUS.md` — **última actualización:** 2026-07-29 (Fix realtime dashboard subscribe)

Hitos recientes (mismo orden que el changelog superior de `PROJECT_STATUS.md`; máx. 45 entradas):

- **Fix `/dashboard` crash realtime (2026-07-29)**: Error `cannot add postgres_changes callbacks ... after subscribe()` en canal fijo `realtime_tickets_dashboard` (remount Strict Mode / canal ya subscribed). Canal con UUID único + `useMemo` del client en [`DashboardVentasSection.tsx`](src/components/dashboards/DashboardVentasSection.tsx); mismo patrón en reservas master.
- **Fix build Vercel — `getPageGeom` literales `as const` (2026-07-29)**: `DS_PAGE.width/height` inferían `595.28`/`841.89` y `doc.internal.pageSize.getWidth()` (`number`) fallaba en `chrome.ts` (y callers). Parámetros tipados como `number` en [`layout.ts`](src/lib/pdf/design-system-v2/layout.ts).
- **Cierre caja — Esperado con fallback BDP (2026-07-28)**: Si `ventas − tarjeta − pendiente` queda negativo (p.ej. Ventas/Tarjeta del papel + Pendiente BDP), ya no se clampa a 0 ni el descuadre = efectivo entero. Fallback a `cobro_efectivo` del RPC `get_closing_sales_breakdown`. Paso 1 vuelve a mostrar **Pendiente** y **Cobros**. Toast al avanzar si se usa el fallback. [`CashClosingModal.tsx`](src/components/CashClosingModal.tsx).
- **Pedido a proveedor — estilo legacy confirmado (2026-07-28)**: Preview DS v2 **rechazado**. Producción sigue en [`pdf-generator.ts`](src/utils/orders/pdf-generator.ts) (petroleum). Variante preview eliminada. Jornada/encargos permanecen en DS v2.
- **Migración PDF → Design System v2.0 (2026-07-28)**: Jornada/plantilla/simulación (`timesheet-pdf.ts`) y encargos/factura (`print-encargo-document.ts`) usan el kit DS v2. **Pedido a proveedor** sigue en legacy (`pdf-generator.ts`); preview visual en `tmp/preview-pedido-proveedor-ds-v2.pdf` vía `scripts/preview-order-pdf-ds-v2.ts` + `pdf-generator-ds-v2.ts` — pendiente aceptación. Preview jornada: `tmp/preview-jornada-ds-v2.pdf`.
- **PDF Design System v2.0 (2026-07-28)**: Kit reutilizable para **PDFs nuevos** según manual editorial (`#1F5FAF`, retícula 8pt, A4/pt, cabecera/pie, KPI, tablas, alertas). Código: [`src/lib/pdf/design-system-v2/`](src/lib/pdf/design-system-v2/). Manual: [`docs/design-system/Marbella-PDF-Design-System-v2.0.pdf`](docs/design-system/Marbella-PDF-Design-System-v2.0.pdf). Regla Cursor: [`.cursor/rules/pdf-design-system-v2.mdc`](.cursor/rules/pdf-design-system-v2.mdc). Preview: `scripts/preview-pdf-design-system-v2.ts` → `tmp/preview-design-system-v2.pdf`. **Legacy intacto** (pedidos, timesheet, encargos).
- **Shell instantáneo en `/dashboard`, `/master/dashboard`, `/staff/dashboard` (2026-07-28)**: Sin spinner a pantalla completa. Admin: tesorería/ventas/OT con spinner por sección. Master: OT solo última semana completada (no 60d); spinner en C INICIAL / H. extras / ventas. Staff: calendario+HE y fichaje cargan en paralelo; spinner en tarjeta semana y botón fichaje; atajos usables al montar.
- **`/dashboard` overtime en paralelo (2026-07-27)**: `getDashboardData` ya no espera HE/60d. Tesorería/ventas pintan al llegar; sección Horas Extras con spinner propio vía `getOvertimeData`. `/master/dashboard`: spinner en tile H. extras durante la carga.
- **Fase 1d — `close_week_for_all_users` desconectado (2026-07-27)**: Último productor SQL vivo post-Gate era pg_cron `close-previous-week` → `close_week_for_all_users` (INSERT/UPSERT columnas C desde `profiles` + `view_daily_hours_breakdown`, sin HE/Writer). Migración `20260727152000_phase1d_disable_close_week_sql_c_motor`: función → delegación HTTP Writer; job cron → `cron_close_previous_week_via_writer()`; `fn_recalc_and_propagate_snapshots` → no-op (0 funciones SQL con INSERT a `weekly_snapshots` C). Ops: `app_settings.cron_recalc_bearer` alineado con `CRON_SECRET` (antes PLACEHOLDER). Remoto: dry-run sin escritura C; smoke pg_net OK. ADR / Contract / HE / Cost **no modificados**.
- **Fase 1c — `trigger_recalc_snapshots` eliminado (2026-07-27)**: Único productor SQL residual post-1b era `time_logs.trigger_recalc_snapshots` → `recalc_snapshots_on_log_change` → `fn_recalc`. Migración `20260727145300_phase1c_disable_time_logs_recalc_trigger`: DROP trigger + función no-op. Remoto verificado: 0 triggers recalc/propagate activos; cron sin `perform rpc_recalculate_all_balances`. Columnas C → único escritor efectivo: Writer TS (`writeWeeklyProjection`). ADR / Contract / HE / Cost **no modificados**.
- **Fase 1b — Writer único cableado (2026-07-27)**: Todos los flujos funcionales escriben columnas C solo vía `writeWeeklyProjection` (wrappers `writeProjectionFromWeek` / `writeProjectionForEmployees` / `recalculateAllBalancesAndPersist`). Migrados: cron, fichajes, imports, toggle paid/prefer stock, config semanal, contratos, scripts. Overrides B se escriben directo + Writer regenera C. Legacy inerte: `persistOvertimeCostFromEngine`, `recalcSnapshotsAndPersistOvertimeCost`, RPCs `fn_recalc`/`rpc_recalculate_*` (sin callers app). Migración SQL `20260727135641_phase1b_disable_sql_c_producers`: trigger propagate no-op + pg_cron solo HTTP Writer. ADR / Projection Contract / HE / Cost / Mapper / Validator **no modificados**.
- **Gate Fase 1 — validaciones pre-commit completadas (2026-07-27)**: `validate-projection` cubre INV-C01 (semilla 0), C02, C03–C09 (C04 vía oráculo `computeCarry` sobre partes del resultado), L01–L04 (coherencia del `LiquidationResult`; L05 documentada como exclusiva HE). Sin cambios de mapping/payload/HE/Cost/dryRun. Tests writer **26/26**. **Sin Fase 1b.**
- **Fase 1 — Writer único `writeWeeklyProjection` (2026-07-27)**: Orquestador HE + Cost → validación contrato → persistencia columnas C de `weekly_snapshots` (UPSERT por `user_id`+`week_start`; no toca overrides B). Metadata conceptual en retorno (`he-1.0.0` / `cost-1.0.0` / `projection-contract-v1`); sin columnas físicas nuevas. Módulo: `src/lib/hours-engine/projection/`. Tests writer **10/10**. **Sin** cablear cron/fichajes/imports/toggle/contratos (**Fase 1b pendiente**). ADR y Projection Contract **no modificados**.
- **Fase 0b — PROJECTION CONTRACT v1 (2026-07-27)**: Especificación funcional del contrato Hours/Cost → Writer → `weekly_snapshots` (mapeo, autoridades, idempotencia, versionado conceptual, validación/errores). Subordinado a ADR-HE-SSOT-001. Doc: [`docs/PROJECTION_CONTRACT_v1.md`](docs/PROJECTION_CONTRACT_v1.md). **Sin Writer ni migraciones.**
- **ADR-HE-SSOT-001 definitivamente congelado (2026-07-27)**: Refuerzo documental: trazabilidad de proyección (metadata), INV-J06/J07 regenerabilidad, INV-D01 determinismo, separación dominio↔metadata. Sin cambio de reglas de negocio ni del plan Fases 0b–5. Doc: [`docs/ADR-HE-SSOT-001.md`](docs/ADR-HE-SSOT-001.md). **Sin implementación de cutover.**
- **ADR-HE-SSOT-001 congelado (2026-07-27)**: Hours Engine = único productor. `weekly_snapshots` = proyección persistida. Lectura oficial: hechos → HE (write) → snapshots → Read Model → DTO → UI. Semilla global: `carryIn(timelineStart)=0`. Plan cutover Fases 0b–5. Doc: [`docs/ADR-HE-SSOT-001.md`](docs/ADR-HE-SSOT-001.md). **Sin implementación de cutover aún.**
- **Vista semana Dashboard = `/staff/history` (2026-07-27)**: Una sola representación visual (`WeekCard`). `WorkerWeeklyHistoryModal` deja de pintar UI propia; carga `HistoryWeekDto` vía `getEmployeeHistoryWeek` (mismo read-model HE que history) y renderiza `WeekCard` con `readOnly`. Sin editar/overrides/clics. Sin WeekCardLite/Dashboard/Readonly duplicados.
- **Read-model semana unificado con HE/Cost (2026-07-27)**: Eliminado `footerFromSnapshot` (derivaba extras/importe/bolsa desde columnas crudas). DTO de pintura vía `week-display-from-engine.ts` ← `liquidateWeekForCard`. History/Overtime/Dashboard/Labor/Insights leen HE. UI pinta sin interpretar bolsa/carry. Invariantes: `carryOut<0` ⇒ extras=importe=0. Caso Pere W30 (deuda+bolsa) resuelto sin parche.
- **`/dashboard/uso` muestra Ramon (2026-07-27)**: El filtro de analytics ya no aplica `HIDDEN_PLANTILLA_FIRST_NAMES` (`ramon`/`empleado`). `fogotorrat@gmail.com` (Ramon Sole) aparece y su actividad se agrega. La exclusión de plantilla operativa se mantiene en propinas/horario/etc.
- **Fix modal Plantilla vacío en `/master/dashboard` (2026-07-27)**: Tras quitar SSR de `getDashboardData`, `MasterDashboardView` no cargaba `allEmployees`. Carga en cliente **solo al abrir** el modal (`profiles` con `visible_in_plantilla=true`), sin impacto en el montaje de la página.
- **`/profile/contrato` editar/borrar tramos (2026-07-27)**: Editar un tramo (condiciones o fechas) **no crea tramos nuevos** (`persistTermBoundsReschedule` / rewrite). Eliminar tramo: `deleteContractTerm` — el anterior absorbe el rango; no se puede borrar el único. Recalc + persist Cost tras cambio. UI: «Editar condiciones vigentes» + «Nueva vigencia desde fecha» (splice opcional) + botón Eliminar. Tests versioning ampliados.
- **Pantallas READ sin Hours/Cost Engine (2026-07-26)**: Regla congelada: ninguna pantalla ejecuta lógica de negocio en carga. Overtime / Labor / Dashboard / Insights / History / modal semana / StaffDashboard leen DTOs desde `weekly_snapshots` (`src/lib/read-models/weekly-snapshot-dto.ts` + `history-read.ts`). Escritura (fichaje, toggle, cron, import, persist) sigue con HE/Cost Engine. **Merino:** `profiles.end_date` era igual a `joining_date` (baja ficticia) → fence post-baja; corregido a `NULL` + recalc+persist W30 (`total_hours=4`, `extra_hours=4`, `total_cost=64`). Script ops: `scripts/recalc-merino-w30.ts`.
- **`/dashboard/uso` incluye inactivos (2026-07-26)**: El filtro ya no se limita a `visible_in_plantilla=true` (aparecen bajas / fuera de plantilla, p.ej. Sergi). Los resúmenes agregan todos los eventos (paginación), no solo los 2000 más recientes. Placeholders (ramon/empleado) siguen ocultos. Héctor sigue fuera de la selección por defecto.
- **Overlay fichaje fade + Pere (2026-07-26)**: Cierre difuminado (~900 ms opacity+blur) del vídeo al fichar. `pereboladeres@gmail.com` usa `/icons/video-españa.mp4` en entrada/salida (igual que Héctor).
- **Fase 1B — cobertura persist Cost Engine (2026-07-26)**: Cerrados huecos vivos: `StaffDashboardView` → `syncOvertimeCostAfterTimeLogChange`; `togglePaidStatus` → `recalcSnapshotsAndPersistOvertimeCost`; cron SQL → rpc horas + pg_net `persist-only` + refuerzo Vercel `/api/cron/recalculate-balances`; `import-legacy` + `/admin/import` → `persistOvertimeCostForEmployees`. Wrapper único: `recalculateAllBalancesAndPersist` / `persistOvertimeCostFromEngine`. RPCs `*_from_week` sin caller TS documentados (`cost-engine-coverage.ts`). **Ops:** alinear `app_settings.cron_recalc_bearer` con `CRON_SECRET`. **No** Fase 2.
- **Auditoría caminos `time_logs` / `fn_recalc` → persist Cost Engine (2026-07-26)**: Cubiertos: overtime actions (config/logs/fichaje manager), labor-conditions, recalculateAllBalances (UI), TimeTracker (código muerto sin imports). **Fuera (stale `total_cost` posible):** (1) `StaffDashboardView` fichaje in/out — camino vivo, solo trigger SQL; (2) cron lunes `rpc_recalculate_all_balances`; (3) `togglePaidStatus` → trigger snapshot sin persist; (4) `import-legacy` + `/admin/import` inserts. RPCs parciales `rpc_recalculate_*_from_week` sin caller TS. Ver informe en chat. Sin código de fix aún.
- **Overtime Cost Engine Fase 1 — persistencia `total_cost` (2026-07-26)**: SQL `fn_recalc` ya **no calcula dinero** (sin `fn_worker_effective_overtime_rate`; INSERT omite `total_cost`→NULL; UPDATE no lo toca). Único escritor: `persistOvertimeCostFromEngine` (TS Cost Engine → `weekly_snapshots.total_cost` + validación read-back). Cableado en overtime/labor/recalculate + `TimeTracker` vía Server Action. Backfill **22/22** empleados, **0 fallos**. `total_cost` DEFAULT NULL. Tests cost/week-card/persist OK. **No** Fase 2 (consumidores).
- **Overtime Cost Engine — política liquidación carry (2026-07-26)**: Aprobada: banco = solo horas; sin tarifas históricas ni ampliación HE. Cost Engine único `estimatedValue`. Internamente: waterfill P⁺ por segmentos + residual banco × `settlementRateAtWeekStart` (lunes); override semanal absoluto. Loaders leen `overtime_price_snapshot`; History vacío→NULL. Shadow HE `otCost` vía Cost Engine. Tests cost **11/11**, week-card **28/28**, shadow adapters/runner OK. SQL `total_cost` aún legacy (P1: persistir estimatedValue TS, no segundo motor SQL).
- **Overtime Cost Engine P0 — núcleo (2026-07-26)**: Nuevo `overtime-cost-engine.ts` (puro). `estimatedValue` ya no es `netPayable × overtimeRateForWeek`; sale de `priceWeekOvertime` (override semanal absoluto o Σ payable×rate por segmento post-carry). Cableado en `week-card-from-liquidation.ts`. Tests week-card/opening-carry **28/28**. Pendiente validación: loaders snapshot, UX override NULL, Shadow, SQL persist.
- **Overlay fichaje Hernán + Fernando (2026-07-25)**: `hernang6799@gmail.com` y `fggutierrez98es@gmail.com` usan `/icons/video-españa.mp4` en entrada y salida (`fichaje-overlay-videos.ts`).
- **Arranque master/admin sin SSR pesado (2026-07-25)**: `/master/dashboard` ya **no** await `getDashboardData()` (ventas+plantilla+60d HE bloqueaban 5–15s). Shell inmediata; datos en cliente. Bugfix: timeout de `profiles` ya no redirige master→staff. `/dashboard` igual (AdminDashboardView carga en cliente). MasterView: `getSession` no `getUser`.
- **Overlay fichaje sin fullscreen (2026-07-25)**: Vuelve el tamaño `min(90vw,90vh)` (como el círculo); ya no pantalla completa. Contenedor `rounded-2xl` + `object-cover` (no círculo).
- **Fix pantalla blanca al iniciar/navegar (2026-07-25)**: Root layout **síncrono** (sin `await getSession`). Push/usage/display-mode resuelven auth en cliente. Proxy: `profiles` solo en `/`, `/login` y gates `/dashboard` que lo necesitan; master (Héctor) redirige home **solo con email JWT**. Timeouts proxy 1.5s/1.2s. Master/staff dashboard: `getSession`+timeout + Suspense (adiós `getUser()` que colgaba GoTrue). Elimina waterfall PostgREST en cada navegación staff.
- **Layout más rápido — sin onboarding/zoom (2026-07-25)**: Quitado query `profiles.needs_onboarding` + `OnboardingOverlay` del root layout. Viewport estático bloqueado para todos (sin `generateViewport`/zoom Héctor). `touch-manipulation` siempre. Push prompt ya no espera onboarding.
- **Overlay fichaje Héctor (2026-07-25)**: `hhector7722@gmail.com` reproduce `/icons/video-españa.mp4` en entrada y salida (`fichaje-overlay-videos.ts` + asset en `public/icons/`).
- **Fix build Vercel — overtime profiles select (2026-07-25)**: `PLANTILLA_EMPLOYEE_SELECT + ', role'` rompía el tipado Supabase (`GenericStringError[]`). Select literal `as const` + cast seguro. Typecheck OK.
- **Hardening productor `payroll_monthly_totals` (2026-07-24)**: Parser v1 etiquetado (sin Math.max), hash SHA-256, `payroll_import_runs` append-only, rectificaciones sin overwrite, tests 12/12. May/jun 2026 importes intactos. Migración `20260724190000_…` aplicada. Doc: [`docs/HARDENING_PRODUCTOR_PAYROLL_MONTHLY_TOTALS.md`](docs/HARDENING_PRODUCTOR_PAYROLL_MONTHLY_TOTALS.md). Sin tocar Labor/HE/Shadow.
- **Auditoría productor `payroll_monthly_totals` FASE 1 (2026-07-24)**: Pipeline Gmail→GAS→`nominas-summary`→pdf2json→`Math.max` en ventana 300 chars. Re-parse Storage may/jun = BD exacta. Veredicto: **Sí, con reservas**. Doc: [`docs/AUDITORIA_PRODUCTOR_PAYROLL_MONTHLY_TOTALS.md`](docs/AUDITORIA_PRODUCTOR_PAYROLL_MONTHLY_TOTALS.md). Sin cambios de código.
- **Diseño pipeline `payroll_monthly_totals` SSOT (2026-07-24)**: Auditoría de ingestión (Gmail/GAS + webhooks; **no hay login portal**). Huecos: hash, validación, rectificaciones, auditoría, extracción bruto/neto/SS. Doc diseño (sin código de pipeline): [`docs/PAYROLL_MONTHLY_TOTALS_SSOT_PIPELINE.md`](docs/PAYROLL_MONTHLY_TOTALS_SSOT_PIPELINE.md). Sin tocar Labor / HE / Shadow / schema.
- **Coste laboral diario `/dashboard/labor` (2026-07-24)**: Fijo = `payroll_monthly_totals` / **días naturales** del periodo. Extras = HE `estimatedValue` (misma liquidación History/Overtime). Total = fijo + extras. Sin `fn_labor_*` ni `profile_labor_cost_terms`. Doc: [`docs/COSTE_LABORAL_DIARIO_SSOT.md`](docs/COSTE_LABORAL_DIARIO_SSOT.md).
- **Migración consumidores SSOT — pantallas (2026-07-24)**: Overtime/Dashboard/Master Extras unificados a HE (`buildOvertimeWeeksFromSsot`; adiós lista≠modal). `/dashboard/labor` sin `fn_labor_*`/`get_labor_cost_*`. Insights M.O. horaria + tarifas Horario/Schedule vía SSOT. Doc: [`docs/MIGRACION_CONSUMIDORES_SSOT_FASE2.md`](docs/MIGRACION_CONSUMIDORES_SSOT_FASE2.md). Sin tocar núcleo HE / Shadow / snapshots / payroll.
- **Filtro empleado cabecera solo nombre (2026-07-24)**: En `/staff/history`, al filtrar por empleado la cabecera muestra solo `first_name` (sin apellidos). Export PDF/Excel sigue con nombre completo.
- **Cierre módulo laboral SSOT (2026-07-24)**: `/profile` deja de editar alta/baja (solo lectura). Frontera + jornada solo en `/profile/contrato`. `updateProfile` bloquea `joining_date`/`end_date`. `updateLaborConditions` dispara `fn_recalc_and_propagate_snapshots` tras guardar. Alta sigue creando tramo vía trigger. Módulo laboral **cerrado** (sin bugs; espejo profiles←terms intencional para SQL).
- **Corrección bug Bali (2026-07-24)**: Fence de baja en `fn_recalc` usa `hours_contract_terms` (día a día), no `profiles.contracted_hours_weekly`. Migración `20260724120000_shadow_bali_fence_contract_terms.sql`. Run `4b0b3a55-…` vs `bfdb100b-…`: EMR **82,35% → 88,24%**, Exact **14→15**, Diff **3→2**. Bali → EXACT. Fernando exact. Héctor/Pere intactos. Tests **42/42**. Productor SQL **técnicamente convergido**; pendiente solo semilla Pere. Doc: residual/validation § Corrección Bali.
- **Validation Gate SSOT (2026-07-24)**: Revisión final sin código. Héctor = **regla de negocio validada**. Pere = **decisión funcional** (semilla HE vs banco pre-joining). Bali = **bug SQL independiente** (fence `end_date` usa perfil 0 ≠ tramos). Conclusión proyecto: **B — queda 1 bug real (Bali)**. Doc: [`SHADOW_RESIDUAL_ANALYSIS.md`](SHADOW_RESIDUAL_ANALYSIS.md) § Validation Gate.

<!-- sync:project-status:end -->
