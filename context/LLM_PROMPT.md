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

**Fuente**: `PROJECT_STATUS.md` — **última actualización:** 2026-07-16 (Fix build: select FC recetas)

Hitos recientes (mismo orden que el changelog superior de `PROJECT_STATUS.md`; máx. 45 entradas):

- **Fix TypeScript build Vercel — filtro FC recetas (2026-07-16)**: El ternario en `.select(needsFc ? RECIPE_FOOD_COST_SELECT : …)` rompía el parser de tipos de Supabase (`ParserError`). Ramas separadas en `/recipes` y `/recipes/[id]`; `RECIPE_FOOD_COST_SELECT` con `as const`.
- **Ver pedido: precio por fila + total (2026-07-16)**: En el modal «Tu pedido», cada línea muestra el importe (qty × precio entero/medio) y al pie el total en €.
- **Filtro Food Cost en URL + nav detalle (2026-07-16)**: `fc=optimal|alert|critical` en query (como `cat`). Lista ↔ ficha y flechas prev/next solo entre recetas que cumplen el filtro. Helper compartido [`recipe-food-cost.ts`](src/lib/recipe-food-cost.ts).
- **Navegación plantilla desde /profile (manager) (2026-07-16)**: En `/profile`, managers ven flecha atrás (sin marco) que abre `StaffSelectionModal`; al elegir trabajador → `/profile?id=`. Si el modal se abre desde perfil, su flecha vuelve al home del rol (`getHomeHrefForUser`). Desde dashboard/otras pantallas el modal no muestra esa flecha. Navbar no duplica la flecha en `/profile` para managers.
- **Condiciones laborales v1 (2026-07-16)**: Pantalla `/profile/contrato?id=` (botón «Condiciones laborales» en `/profile`, solo `hhector7722@gmail.com`). Resumen + histórico; CTA «Cambiar condiciones laborales»; fecha efectiva = hoy Madrid (sin selector). Escritura: Server Action → `persistContractualChange` → `hours_contract_terms` → espejo `profiles`. Bloqueo de campos contractuales en `updateProfile`. Tests: `npm run test:hours-engine:labor` (7). Sin fechas libres, sin edición histórica, sin orquestador.
- **Filtro Food Cost en Cat. (/recipes) (2026-07-16)**: Primera opción del popup «Cat.» = «Filtrar Food Cost»; subfiltro Óptimo (<30%) / Alerta (30–35%) / Crítico (≥35%). Chip activo con X. Solo managers/supervisors (misma visibilidad que el precio FC). Compatible con filtro por categoría.
- **Badge cantidad en esquina de foto (2026-07-16)**: Círculo de unidades sobre la imagen (esquina superior derecha, inset) — 100% visible, sin sombra ni recorte. Nombre sin badge.
- **Reabrir pedido: cliente parte del pedido existente (2026-07-16)**: `/pedido/[token]` hidrata el carrito con `event_orders.items` vía RPC `get_client_event_order_items_by_token` (mapea `is_half` → `id:medio`). Reopen sigue sin borrar líneas. Migración [`20260716240000_get_client_order_items_by_token.sql`](supabase/migrations/20260716240000_get_client_order_items_by_token.sql) **aplicada**.
- **Footer pedido UX (2026-07-16)**: «Ver pedido» sin icono; unidades en badge rojo tipo notificación; botones más bajos con safe-area. Badge de cantidad en productos sin recorte (overflow + estilo campana).
- **Tarjeta semanal: footer → motor (2026-07-16)**: HORAS / PENDIENTES / EXTRAS / IMPORTE salen de `LiquidationResult` vía [`week-card-from-liquidation.ts`](src/lib/hours-engine/week-card-from-liquidation.ts) + `patchWeeksFromLiquidation`. Misma fuente que Ex. diarias → imposible discrepancia. `/staff/history` + `WorkerWeeklyHistoryModal`. RPC solo clocks/`isPaid`. Tests: `npm run test:hours-engine:week-card` (10) + suite **104/104**. Sin orquestador, sin borrar snapshots.
- **Ración medio en comanda sin «1/2» duplicado (2026-07-16)**: Producto = `1/2 ENT. LLOM PLANXA` (cantidad aparte). Ya no se muestra `1/2` otra vez en notas. RPC `fn_event_order_apply_racion` + UI/print. Migración [`20260716230000_half_ration_name_no_dup.sql`](supabase/migrations/20260716230000_half_ration_name_no_dup.sql) **aplicada**.
- **Icono calendario = avisos reservas + pedido (2026-07-16)**: `ReservationsBell` muestra `reservation_new` y `client_order_submitted` (badge + panel). La campana general los excluye. Destinatarios sin cambio (alba/hernan/pere/hector).
- **Fix ver pedido cliente en staff (2026-07-16)**: Al abrir el modal de encargo (o deep-link `?eventId=`), se refetch de `events` + `event_orders` — ya no se muestra el shell vacío en caché.
- **Pedido cliente: campana + push como reservas (2026-07-16)**: Al «Enviar pedido», mismos destinatarios que reservas (alba/hernan/pere/hector). In-app en campana (`client_order_submitted`) y **push** vía pg_net → `/api/webhooks/reservations-push`. También `reservation_new` vuelve a mostrarse en la campana (mismo centro). Migración [`20260716210000_client_order_push_and_notify.sql`](supabase/migrations/20260716210000_client_order_push_and_notify.sql) **aplicada**.
- **Pedido carta fotocopia + picker Entero/Medio (2026-07-16)**: Misma UI de precios que la carta (`CartaDualRacionPrices`). Tap en producto → suma al carrito (no lightbox). Si hay precio medio (bocadillo/ración TPV), tap abre modal Entero/Medio.
- **Modal del día desktop (2026-07-16)**: `PavilionDayModal` + `ActivitiesTab` y vista día de `StaffScheduleModal` — utilidades `day-modal-*` (≥1024px): panel a `100dvh`, filas de hora iguales, chips/filas de turnos repartidas, dots ocultos. Smartphone/tablet sin cambios.
- **Tramos contractuales versionados (2026-07-16)**: Tabla `hours_contract_terms` (RLS + seed desde perfil actual, 22 empleados). Contract Resolver / liquidación / Ex. diarias leen **solo** tramos versionados vía `loadEmployeeBoundaryFacts` + `employeeFactsFromContractTerms`. Eliminado `employeeFactsFromProfile`. Tarifa OT versionada en el tramo (`overtimeRatePerHour`). Tests: `npm run test:hours-engine:contract-terms` + suite **80/80**. Migración [`20260716200000_hours_contract_terms.sql`](supabase/migrations/20260716200000_hours_contract_terms.sql) **aplicada**. Inmutabilidad del pasado demostrada (cambiar tramo vigente/futuro no reinterpreta histórico).
- **Pedido ración medio = mismo artículo TPV (2026-07-16)**: Como en TPV (opción ración), Entero/Medio sobre el mismo `articulo_id` + `override_precio_medio`. Carrito: claves `id` / `id:medio`. Resumen cliente: 2 líneas (`ENT…` y `1/2 · ENT…`). Comanda staff: mismo product_id, `notes: 1/2`, precio medio. RPC `fn_event_order_apply_racion` + `save_client` / staff create/update.
- **Ex. diarias migradas al motor (2026-07-16)**: `LiquidationResult.dailyBreakdown` (regla running = misma funcional). UI (`StaffDashboardView`, `WorkerWeeklyHistoryModal`, `/staff/history`) pinta Ex. desde `liquidateWeek` / `patchWeeksDailyExtrasFromEngine`. RPCs `get_worker_weekly_log_grid` y `get_monthly_timesheet` ya **no calculan** `extraHours` (siempre 0). Migración [`20260716193000_daily_extras_from_hours_engine.sql`](supabase/migrations/20260716193000_daily_extras_from_hours_engine.sql) **aplicada**. Tests: `npm run test:hours-engine:daily` + suite **68/68**. Invariante runtime: Σ extras diarias = extras semanales.
- **Pedido cliente UX pie + confirmación + WhatsApp (2026-07-16)**: Pie compacto «Ver pedido» + «Enviar pedido» (desglose en modal, no fijo). Confirmación obligatoria antes de enviar. WhatsApp post-envío = `profiles.phone` de `hhector7722@gmail.com` vía RPC `get_pedido_contact_whatsapp_phone` ([`20260716190000`](supabase/migrations/20260716190000_get_pedido_contact_whatsapp_phone.sql)).
- **Pedido carta: elegir Entero o 1/2 bocadillo (2026-07-16)**: El merge entero/medio guarda `medio_articulo_id`. En pedido (cliente/staff sobre carta) aparecen botones Entero/Medio; el resumen y el envío usan el `product_id` del TPV medio. Si hay lista blanca de productos, se incluye el medio emparejado.
- **Pedido `/pedido/[token]` sin Navbar ni barra inferior (2026-07-16)**: Ruta añadida a `isFullscreenCartaPath` (como `/eventos` y `/carta`). El cliente solo ve la bienvenida/carta, no el shell interno de la app.
- **Aviso visual pedido cliente (2026-07-16)**: Al «Enviar pedido», RPC inserta `user_notifications` (`client_order_submitted`) para alba/hernan/pere/hector — aparece en campana. Deep link `/staff/reservas?eventId=`. Badge rojo discreto sobre el punto verde/naranja/azul del calendario mientras la notificación esté sin leer; se quita al abrir el pedido. Sin tablas nuevas ni cambio de colores/leyenda. Migración [`20260716180000_notify_client_order_submitted.sql`](supabase/migrations/20260716180000_notify_client_order_submitted.sql) **aplicada**.
- **UX pedido por enlace (2026-07-16)**: Bienvenida antes de la carta (`PedidoBienvenidaView` → «Empezar pedido»). Carta sin cambios. Confirmación post-envío rediseñada (`PedidoEnviadoView` + WhatsApp al 932 254 427 / `NEXT_PUBLIC_MARBELLA_WHATSAPP`). Mensaje WhatsApp staff más cuidado (fecha/hora/personas + URL). Sin cambios de modelo, permisos ni lógica de pedidos.
- **Calendarios mensuales: filas iguales y menos agobio en escritorio (2026-07-16)**: Fix CSS `month-cal-*` — celdas `height:100%` + `min-height:0` (el contenido ya no estira filas); semanas `flex:1` iguales; chips densos (`month-cal-chips`). Historial calendario: oculta gráfico en `lg`, KPIs compactos, calendario `flex-1` con filas uniformes. Smartphone/tablet sin cambios.
- **Fase 2 Invalidation Orchestrator (2026-07-16)**: Módulo [`src/lib/hours-engine/orchestrator/`](src/lib/hours-engine/orchestrator/) — impacto → confirmación → reapertura Pagada → `liquidateWeek` → propagación por `carryOut` → persistencia de `LiquidationResult`. Núcleo Fase 1 **sin cambios**. Stores en memoria (`MemoryFactStore` / `MemoryResultStore`) como puertos. Tests: `npm run test:hours-engine:orchestrator` (20) + suite completa **58/58**. Sin UI, sin migración legacy, sin Cost Engine.
- **Reabrir pedido al cliente (2026-07-16)**: Eliminado el concepto «Solicitar nuevo pedido». Acción staff: «Reabrir pedido al cliente» (solo si ya hubo envío) con confirmación obligatoria. Al confirmar: `client_edit_enabled=true` + `client_order_submitted_at=NULL` **sin tocar** `event_orders`. El próximo «Enviar pedido» del cliente sustituye líneas/totales y vuelve a cerrar el enlace. Auditoría informativa: `events.created_from` (`reservation`|`standalone`), `events.filled_by` (`staff`|`client`). RPC `reopen_client_order`. Migraciones [`20260716162000_reopen_client_order_audit.sql`](supabase/migrations/20260716162000_reopen_client_order_audit.sql) + [`20260716170000_filled_by_on_order_save.sql`](supabase/migrations/20260716170000_filled_by_on_order_save.sql) **aplicadas**.
- **Pedido cliente endurecido (2026-07-16)**: Columna `events.client_order_submitted_at`. Carta solo si `client_edit_enabled` **y** `submitted_at IS NULL`. Tras envío: cierra enlace + marca submitted. «Permitir edición cliente» bloqueado si ya enviado; reopen vía `reopen_client_order` (antes «Solicitar nuevo pedido»). Migración [`20260716160000_client_order_submitted_guard.sql`](supabase/migrations/20260716160000_client_order_submitted_guard.sql) **aplicada**.
- **ADR-003 cerrado + Fase 1 oficialmente finalizada (2026-07-16)**: `Regime Policy` ya no calcula `días/7 × jornada`; consume `contractedHours` del Contract Resolver (reparto entre buckets solo por proporción de días). Única implementación del prorrateo: [`contract-resolver.ts`](src/lib/hours-engine/contract-resolver.ts). Suite `npm run test:hours-engine` → **38/38**. Arquitectura del núcleo **congelada**. Siguiente: Fase 2 (Invalidation Orchestrator).
- **Calendarios mensuales: caben en 1 pantalla en escritorio (2026-07-16)**: Utilidades CSS `month-cal-*` (solo `@media ≥1024px`) — shell a `100dvh − header − bottom nav`, celdas fluidas (`grid-auto-rows: 1fr` / semanas flex). Aplicado en `/horario`, `/staff/actividades`, `/staff/reservas`, `/dashboard/history` (modo calendario), `/dashboard/consumo-personal`, `/dashboard/labor`. Smartphone/tablet **sin cambios**.
- **Pedido cliente one-shot (2026-07-16)**: Tras «Enviar pedido», RPC `save_client_event_order_by_token` pone `client_edit_enabled=false` (token se conserva). Reabrir `/pedido/[token]` muestra [`PedidoEnviadoView`](src/app/pedido/[token]/PedidoEnviadoView.tsx) — sin carta ni edición. Solo staff edita después vía editor interno. Migración [`20260716153000_client_pedido_oneshot_close.sql`](supabase/migrations/20260716153000_client_pedido_oneshot_close.sql) **aplicada**.
- **Pedido cliente por enlace privado (2026-07-16)**: Permiso opcional en `events` (`client_edit_enabled` + `client_edit_token`). Al crear pedido desde `/staff/reservas` se elige «Lo introduciré yo» (editor staff) o «Lo introducirá el cliente» (token + share WhatsApp/copiar). Ruta pública [`/pedido/[token]`](src/app/pedido/[token]/page.tsx) reutiliza carta digital (`EventEncargoCartaClient` variant `client-token`) y **actualiza** el `event_orders` primario vía RPC `save_client_event_order_by_token` (no crea pedido nuevo). Migración [`20260716134100_events_client_edit_token.sql`](supabase/migrations/20260716134100_events_client_edit_token.sql) **aplicada en Supabase**. Colores calendario sin cambios (verde/naranja/azul). Desde «Ver pedido» se puede activar enlace cliente a posteriori.
- **Layout escritorio calendarios/revisión (2026-07-16)**: `/horario`, `/staff/actividades` y `/staff/actividades/revision` adaptados a desktop (`lg:` ≥1024px) — celdas más altas, tipografía legible, cabeceras táctiles, contenedor max 1400px; revisión en rejilla tipo tabla. Smartphone/tablet (`< lg`) sin cambios.
- **Motor de horas — Fase 1 núcleo determinista (2026-07-16)**: Nuevo módulo puro [`src/lib/hours-engine/`](src/lib/hours-engine/) — `Contract Resolver`, `Attendance Aggregator` (Europe/Madrid), `Regime Policy` (staff / agosto / manager / fixed / pre-alta), `Carry Engine` (waterfall por tramo bolsa/pago), `Liquidation Engine` (`liquidateWeek`). Sin persistencia, sin UI, sin Cost Engine, sin tocar legacy. Bolsa/pago y régimen se resuelven **por tramo** (composición semanal). Tests: `npm run test:hours-engine`. Spec v1.0 + diseño técnico + ADR. **No sustituye** `fn_recalc_and_propagate_snapshots` todavía.
- **Asistencia: normalización horas Europe/Madrid (2026-07-13)**: Migración [`20260713140000_fix_weekly_log_grid_madrid_with_prorate.sql`](supabase/migrations/20260713140000_fix_weekly_log_grid_madrid_with_prorate.sql) — `get_worker_weekly_log_grid` volvía a usar `MIN(clock_in)::time` (UTC) tras el prorrateo `joining_date`; corregido con `to_char(... AT TIME ZONE 'Europe/Madrid', 'HH24:MI')`. Cliente: [`staff/history/page.tsx`](src/app/staff/history/page.tsx) (vista plantilla), [`StaffDashboardView.tsx`](src/components/dashboards/StaffDashboardView.tsx), [`TimeTracker.tsx`](src/components/TimeTracker.tsx) usan `formatMadridHmFromIso` / `madridDayUtcRangeIso`. **Aplicada en Supabase**.
- **Notificaciones push reservas: trigger BD → pg_net → webhook (2026-07-08)**: Migración [`20260708120000_reservations_push_via_pgnet.sql`](supabase/migrations/20260708120000_reservations_push_via_pgnet.sql) — `CREATE EXTENSION IF NOT EXISTS pg_net`; tabla `app_settings` (RLS, key `push_webhook_url`); `fn_notify_reservation_insert()` actualizada: inserta in-app en `user_notifications` Y llama `net.http_post` al webhook [`/api/webhooks/reservations-push`](src/app/api/webhooks/reservations-push/route.ts) con `service_role_key` para bypassear RLS. Fix [`20260708130000_fix_pgnet_parameter_order.sql`](supabase/migrations/20260708130000_fix_pgnet_parameter_order.sql) — parámetros en orden correcto y body como `jsonb`. Trigger [`20260707120000_reservations_notify_trigger.sql`](supabase/migrations/20260707120000_reservations_notify_trigger.sql) — `trg_reservations_notify_insert` AFTER INSERT. Fix destinatarios [`20260707120500_update_reservation_notify_recipients.sql`](supabase/migrations/20260707120500_update_reservation_notify_recipients.sql).
- **Insights: fix `get_hourly_sales` timezone Madrid (2026-07-05)**: Migración [`20260705120000_fix_get_hourly_sales_timezone.sql`](supabase/migrations/20260705120000_fix_get_hourly_sales_timezone.sql) — `get_hourly_sales` usaba la hora UTC del texto directamente; ahora usa `fn_parse_ticket_hora_cierre_ts` + `timezone('Europe/Madrid', ...)` para mostrar la hora real Madrid.
- **Reporte actividades pabellón: formulario fin de semana `/reporte` (2026-07-03)**: Nueva ruta pública [`/reporte`](src/app/reporte/page.tsx) — formulario para registrar actividades del fin de semana (sábado + domingo). Campos: actividad (selector o texto libre), hora convocatoria/finalización, categorías de participantes con picklist, total participantes. Server action [`submitReporteAction`](src/app/reporte/actions.ts). Migraciones: [`20260703000000_reporte_form_time_fields.sql`](supabase/migrations/20260703000000_reporte_form_time_fields.sql) — `activity_occurrences`: columnas `form_start_time`, `form_end_time`, `preferred_start_time`, `preferred_end_time` (pdf|form); categorías de edad (`prebenjamí`, `benjamí`, `aleví`, `cadet`, `juvenil`, `senior`). [`20260703200000_reporte_total_participants.sql`](supabase/migrations/20260703200000_reporte_total_participants.sql) — `total_participants integer`.
- **Horas extras: fix `overtime_price_snapshot` por defecto NULL (2026-07-01)**: Migración [`20260701143000_fix_overtime_price_default.sql`](supabase/migrations/20260701143000_fix_overtime_price_default.sql) — `weekly_snapshots.overtime_price_snapshot` cambia default de `0` a `NULL`; UPDATE pone NULL donde era 0 para que `fn_worker_effective_overtime_rate` pueda hacer fallback al perfil correctamente.
- **Propinas: TJI equitativo — penalizaciones justas y redistribución (2026-06-29)**: Migración [`20260629000000_tip_pool_preview_fair_tji.sql`](supabase/migrations/20260629000000_tip_pool_preview_fair_tji.sql) — `get_tip_pool_preview` recalculada: penalizaciones TJI se redistribuyen entre el resto del equipo; usuario exento hardcoded (`baacc78a…`). Parche de datos históricos incluido.
- **Actividades pabellón: color por actividad + categoría por ocurrencia (2026-06-28)**: Migraciones [`20260628100000_activities_color.sql`](supabase/migrations/20260628100000_activities_color.sql) — `activities.color text`; [`20260628110000_activity_occurrences_category.sql`](supabase/migrations/20260628110000_activity_occurrences_category.sql) — `activity_occurrences.participant_category_id`. Gestión de colores con paleta completa en [`/staff/actividades/gestion`](src/app/staff/actividades/gestion/page.tsx).
- **Actividades pabellón: calendario mensual + modal día (2026-06-26)**: Migración [`20260626120000_pavilion_calendar_enhancements.sql`](supabase/migrations/20260626120000_pavilion_calendar_enhancements.sql) — `venues.affects_bar boolean`; `activity_kinds.icon text`; seeds de 11 tipos de actividad con emoji. UI: [`/staff/actividades`](src/app/staff/actividades/page.tsx) — calendario mensual con celdas de actividades agrupadas (`groupActivities`); [`PavilionDayModal.tsx`](src/components/pavilion/PavilionDayModal.tsx) con tabs (Actividades / PDF / Resumen); [`PavilionTimeSlot.tsx`](src/components/pavilion/PavilionTimeSlot.tsx), [`PavilionVenueChip.tsx`](src/components/pavilion/PavilionVenueChip.tsx). Subrutas: [`/staff/actividades/revision`](src/app/staff/actividades/revision/page.tsx) — revisión y guardado de actividades desde PDF parseado; [`/staff/actividades/gestion`](src/app/staff/actividades/gestion/page.tsx) — CRUD actividades, merge, color.
- **Consumo personal: fix casts explícitos SQL (2026-06-25)**: Migraciones [`20260625163000_staff_consumption_explicit_casts.sql`](supabase/migrations/20260625163000_staff_consumption_explicit_casts.sql) + [`20260625164000_reprocess_staff_consumption_errors.sql`](supabase/migrations/20260625164000_reprocess_staff_consumption_errors.sql) — corrección de errores de tipo en RPC consumo; reprocesado de registros con error previo.
- **Actividades pabellón: esquema maestro BD (2026-06-23)**: Migración [`20260623180500_pavilion_events_schema.sql`](supabase/migrations/20260623180500_pavilion_events_schema.sql) — tablas `activities` (catálogo maestro, `name`, `external_name` para matching PDF, `color`), `participant_categories`, `activity_kinds`, `venues` (`code`, `affects_bar`), `activity_occurrences` (fechas, `start_time`/`end_time`, campos generados `sys_start_timestamp`/`sys_end_timestamp` AT TIME ZONE Madrid, `form_start_time`/`form_end_time`, `preferred_start_time`/`preferred_end_time`, `total_participants`, `participant_category_id`, `source_pdf_id`). RLS sobre todas las tablas.
- **Insights: ranking productos con filtro horario (2026-06-21)**: Migración [`20260621160500_ventas_product_ranking_time_filter.sql`](supabase/migrations/20260621160500_ventas_product_ranking_time_filter.sql) — `get_product_sales_ranking` acepta `p_start_time`/`p_end_time` opcionales para filtrar por franja horaria. UI actualizada en [`InsightsClient.tsx`](src/app/dashboard/insights/InsightsClient.tsx).

<!-- sync:project-status:end -->
