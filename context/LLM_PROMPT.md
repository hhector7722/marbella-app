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

### Operativa general (auth según RLS)
- `/recipes`, `/recipes/[id]`, `/recipes/import`
- `/ingredients`, `/suppliers`, `/orders/new`
- `/profile`, `/registros`
- `/admin/import`, `/admin/mapeo`

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

**Fuente**: `PROJECT_STATUS.md` — **última actualización:** 2026-06-14 (Uso de la app — tracking completo pantallas + modales)

Hitos recientes (mismo orden que el changelog superior de `PROJECT_STATUS.md`; máx. 45 entradas):

- **Uso de la app: tracking modales completo (2026-06-14)**: Componente base [`Modal`](src/components/ui/modal.tsx) + hook [`useModalUsageTracking`](src/hooks/useModalUsageTracking.ts). Regla [`.cursor/rules/modals.mdc`](.cursor/rules/modals.mdc). Migración masiva: pedidos, caja, albaranes, propinas, carta, KDS, dashboards, recetas/ingredientes/proveedores, chat, onboarding, asistencia (incl. editar semana), confirmación envío pedido, etc. Eventos `modal_open` / `modal_dwell` visibles en [`/dashboard/uso`](src/app/dashboard/uso/page.tsx).
- **Uso de la app: tracking + dashboard `/dashboard/uso` (2026-06-14)**: Migración [`20260614120000_app_usage_tracking.sql`](supabase/migrations/20260614120000_app_usage_tracking.sql) — tabla `app_usage_events`, RLS insert propio + select solo `is_usage_analyst()` (Hector). Stack: `lib/usage/*`, API [`/api/usage/event`](src/app/api/usage/event/route.ts), tracker cliente en layout, sesiones en [`proxy.ts`](src/proxy.ts), pestañas staff en [`StaffBottomNav`](src/components/StaffBottomNav.tsx), login en [`login/page.tsx`](src/app/login/page.tsx). Dashboard master: [`/dashboard/uso`](src/app/dashboard/uso/page.tsx) + acceso rápido en [`MasterShortcutGrid`](src/components/dashboards/MasterShortcutGrid.tsx).
- **Carta: editores delegados sin rol supervisor (2026-06-12)**: Migración [`20260612120000_carta_editors.sql`](supabase/migrations/20260612120000_carta_editors.sql) — tabla `carta_editors`, helper `can_manage_carta()` (manager/admin/supervisor o fila en tabla), RLS carta/storage actualizado. **Willy** (`staff`) añadido como editor. UI: [`carta-permissions.ts`](src/lib/carta-permissions.ts), [`/staff/carta`](src/app/staff/carta/page.tsx), server actions carta. Aplicado en Supabase.
- **Carta: revert modales tras regresión 2026-06-04 mañana**: Los commits de scroll (`c6ce3bd8`, `5d8e5780`, …) rompieron los modales de sección (bottom sheet móvil, `eventOrderScrollLayout`, altura `flex-1` en lugar de `min-h-[50vh,320px]`). **Restaurado** [`MenuAccordion.tsx`](src/components/staff/MenuAccordion.tsx) y [`CartaImageLightbox.tsx`](src/components/carta/CartaImageLightbox.tsx) al estado previo (modal **centrado**, sin portal). [`StaffCartaView.tsx`](src/components/staff/StaffCartaView.tsx) vuelve a `overflow-hidden` en el panel de carta.
- **Insights: cobros tarjeta híbridos por periodo (2026-06-04)**: Migración [`20260604150000_get_period_card_payments.sql`](supabase/migrations/20260604150000_get_period_card_payments.sql) — RPC `get_period_card_payments(p_start, p_end)`: por día `SUM(tickets_marbella.cobro_tarjeta)` si > 0, si no `cash_closings.card_payments` (pre-BDP 26/05); prioridad tickets si ambos > 0. [`actions.ts`](src/app/dashboard/insights/actions.ts) `fetchPeriodCardPayments` una sola RPC (sustituye N× `get_closing_sales_breakdown`). Aplicado en Supabase.
- **Horarios: indicador rentabilidad en editor diario (2026-06-04)**: [`ScheduleDayProfitabilityBar.tsx`](src/components/schedule/ScheduleDayProfitabilityBar.tsx) en [`ScheduleDayEditor.tsx`](src/components/schedule/ScheduleDayEditor.tsx) — visible solo `hhector7722@gmail.com`. Recalcula en vivo: coste personal (horas × `fn_labor_effective_ordinary_rate` × 1,30 SS, fallback 10 €/h), facturación necesaria al 35%, ratio vs `tickets_marbella.total_documento` del día (— sin ventas). Caché tarifas sesión [`labor-rate-session-cache.ts`](src/lib/labor-rate-session-cache.ts). Sin cambios en guardado ni vista lectura del horario.
- **Insights: Resultado del periodo — cobros totales y modales KPI (2026-06-04)**: [`InsightsClient.tsx`](src/app/dashboard/insights/InsightsClient.tsx) — chips **Venta neta**, **Cobros totales** (efectivo tesorería + tarjeta), **Delta PyG-Cobros** (margen − cobros); % Margen PyG sin fondo. Modales: ventas (Facturación → Venta neta, sin devoluciones); gastos con grupos desplegables **Mano de obra** (nóminas + extras + bonus 1.700 € fijo en UI) y **Gastos fijos** (alquiler + Otros 0 €); cobros (Entradas / Salidas / Tarjeta); delta recalculado. [`actions.ts`](src/app/dashboard/insights/actions.ts) — campos `cardPayments`, `cobrosTotales`, `deltaPygCobros` (tarjeta: ver RPC híbrida 2026-06-04). Chip **Gastos totales** sigue siendo total RPC (bonus 1.700 € solo en desglose modal).
- **Albaranes: actualizar solo precio si cambia, sin tocar unidades/recetas (2026-06-04)**: Migración [`20260604140000_albaran_price_preserve_ingredient_config.sql`](supabase/migrations/20260604140000_albaran_price_preserve_ingredient_config.sql) — `handle_new_invoice_line` compara precio antes de escribir; en `per_pack` ajusta `pack_price` (no `purchase_unit` ni `recipe_unit`). App: [`ingredient-price-sync.ts`](src/lib/ingredient-price-sync.ts), [`albaranes/actions.ts`](src/app/dashboard/albaranes/actions.ts) `resyncIngredientPriceForMappedLine`, wizard express en edición desde albarán solo precio. `/dashboard/albaranes-precios` sigue pudiendo cambiar unidades con asistente explícito (`allowUnitChanges: true`).
- **Propinas: sanciones sin doble conteo + shadowAmount (2026-06-03)**: Migración [`20260604130000_tip_pool_preview_sanction_shadow_amount.sql`](supabase/migrations/20260604130000_tip_pool_preview_sanction_shadow_amount.sql) — sancionados `totalAmount`/`weekdayAmount`/`weekendAmount` = 0; `shadowAmount` / `shadowWeekdayAmount` / `shadowWeekendAmount` en JSON; `confirm_tip_distribution` no reparte bonus a sancionados. UI: [`SanctionedTipMoney.tsx`](src/components/tips/SanctionedTipMoney.tsx) en [`TipsDashboardView`](src/components/tips/TipsDashboardView.tsx) y [`StaffPropinasView`](src/components/tips/StaffPropinasView.tsx). Aplicado en Supabase (`tip_pool_preview_sanction_shadow_amount_fix`, `confirm_tip_distribution_sanction_zero_bonus`).
- **Propinas: doble vista manager (2026-06-03)**: `/dashboard/propinas` desde master/admin (gestión); `/staff/propinas` desde modal Caja en staff (vista empleado, sin redirect manager). [`staff/propinas/page.tsx`](src/app/staff/propinas/page.tsx) permite `manager`/`admin` en vista staff.
- **Staff nav inferior: Pedidos + sin Propinas (2026-06-03)**: [`src/app/staff/layout.tsx`](src/app/staff/layout.tsx) — ítem **Pedidos**; **Propinas** en modal **Caja** (`/icons/tip.png` → `/staff/propinas`).
- **Propinas: chef en reparto + tipos Supabase (2026-06-03)**: Migración [`20260604120000_tip_pool_preview_include_chef.sql`](supabase/migrations/20260604120000_tip_pool_preview_include_chef.sql) — `get_tip_pool_preview` incluye rol `chef` en CTE `staff`. `src/types/supabase.ts` regenerado. [`BottomNavWrapper`](src/components/BottomNavWrapper.tsx) no duplica barra en `/staff/*`.
- **Staff: vista «Mis propinas» `/staff/propinas` (2026-06-03)**: Página mobile-first para `staff` / `supervisor` / `chef` — reparto actual vía RPC `get_tip_pool_preview` (desde último `tip_distribution_history` hasta hoy), desglose TJI con barra de umbrales e impacto € estimado ([`StaffPropinasView.tsx`](src/components/tips/StaffPropinasView.tsx), [`tip-distribution-display.ts`](src/lib/tip-distribution-display.ts)). Historial: `tip_distribution_lines` + `tip_distribution_history` filtrado por `user_id`. Manager/admin redirigen a `/dashboard/propinas`.
- **Consumo personal: orden manual + ranking por uso en modal fichaje (2026-06-03)**: Migración [`20260603100000_staff_consumption_recipe_display_order.sql`](supabase/migrations/20260603100000_staff_consumption_recipe_display_order.sql) — tabla `staff_consumption_recipe_display_order`, RPCs `get_consumption_modal_recipes` (orden: veces consumido ↓, `sort_order` base ↑), `staff_consumption_recipe_usage_counts`, `save_staff_consumption_recipe_display_order`. [`ConsumptionModal.tsx`](src/app/staff/ConsumptionModal.tsx) carga vía RPC. Dashboard [`/dashboard/consumo-personal`](src/app/dashboard/consumo-personal/page.tsx): botón orden (icono lista) → [`ConsumptionRecipeOrderModal.tsx`](src/components/consumo-personal/ConsumptionRecipeOrderModal.tsx) drag-and-drop bebidas/comida; primera apertura siembra orden acceso rápido ([`staff-consumption-display.ts`](src/lib/staff-consumption-display.ts)). **Solo Hector** (`hhector7722@gmail.com`) edita; **todo el staff** ve el mismo grid al fichar ([`20260603130000_consumption_modal_order_hector_base_global.sql`](supabase/migrations/20260603130000_consumption_modal_order_hector_base_global.sql): posición = `sort_order` base − boost uso). UI + [`20260603110000_staff_consumption_order_hector_only.sql`](supabase/migrations/20260603110000_staff_consumption_order_hector_only.sql).
- **Compartir enlace (WhatsApp): sin descripción “Sistema de Gestión” (2026-06-02)**: En [`src/app/layout.tsx`](src/app/layout.tsx) se elimina `metadata.description` (evita `meta[name=description]`) y se fuerza `openGraph.description=""` + `twitter.description=""` para que al compartir `marbella-app.vercel.app` (y carta) no aparezca texto secundario bajo el título.
- **Carta embebida: postMessage de navegación al parent (2026-06-02)**: [`carta-iframe-bridge.ts`](src/lib/carta-iframe-bridge.ts) + [`IframeNavBridge.tsx`](src/components/IframeNavBridge.tsx) envían `window.parent.postMessage({ type:'marbella:carta:navigation', pathname, isCategoriesRoot })` al cargar y en cambios de ruta/hash. [`MenuAccordion.tsx`](src/components/staff/MenuAccordion.tsx) (`homeCompact`) reporta la pantalla interna (`openKey`, plato marbella, reorder) porque la carta no cambia URL al navegar categorías. Montado en [`src/app/carta/layout.tsx`](src/app/carta/layout.tsx). `targetOrigin` vía `NEXT_PUBLIC_MARBELLA_WEB_ORIGIN` (fallback `document.referrer` o `*`).
- **Insights: horas extras en PyG + modal desglose KPI (2026-05-31)**: Migración [`20260531110000_financial_statement_add_overtime.sql`](supabase/migrations/20260531110000_financial_statement_add_overtime.sql) — `get_financial_statement` suma `weekly_snapshots.total_cost` como línea `overtime` en gastos; guard `is_manager_or_admin()`. [`actions.ts`](src/app/dashboard/insights/actions.ts) expone `incomeLines`, `expenseLines`, `cashIn`, `cashOut`. [`InsightsClient.tsx`](src/app/dashboard/insights/InsightsClient.tsx) — chips «Resultado del periodo» clicables con `FinancialDetailModal` (portal, bottom sheet móvil, Zero-Display).
- **Albaranes: cabecera `purchase_invoices.status` sincronizada con líneas+stock (2026-05-31)**: Migración [`20260531100000_sync_purchase_invoice_status.sql`](supabase/migrations/20260531100000_sync_purchase_invoice_status.sql) — RPC `sync_purchase_invoice_status` + triggers en `purchase_invoice_lines` y `stock_movements`; cuando todas las líneas están resueltas (`mapped`|`excluded`) y existe `PURCHASE` `ALB-LINE-*`, la cabecera pasa a `mapped` (devengo en finanzas); al desmapear o faltar stock vuelve a `pending_mapping`. Backfill al aplicar. App: [`actions.ts`](src/app/dashboard/albaranes/actions.ts) invoca la RPC tras mapeo/reparar/excluir/desmapear/auto-mapear; lista actualiza `status` junto al tick verde.
- **Tesorería: autorrelleno desglose en salida caja (2026-05-30)**: [`CashDenominationForm.tsx`](src/components/CashDenominationForm.tsx) — botón «Autorrellenar» (Wand2, petróleo `#36606F`) en salidas OUT con importe > 0; greedy sobre inventario real vía server action [`getBoxInventoryForAutofill`](src/app/actions/cash-box-inventory.ts) + [`greedy-cash-breakdown.ts`](src/lib/greedy-cash-breakdown.ts). Toast warning si no cuadra el importe exacto. Integrado en dashboard admin, movimientos y modal legacy staff.
- **Horas extras: tarifa €/h semanal alineada en todo el sistema (2026-05-30)**: Migraciones [`20260530160000_weekly_overtime_price_snapshot_ui.sql`](supabase/migrations/20260530160000_weekly_overtime_price_snapshot_ui.sql) + [`20260530170000_align_overtime_price_snapshot_globally.sql`](supabase/migrations/20260530170000_align_overtime_price_snapshot_globally.sql) — helper `fn_worker_effective_overtime_rate` (snapshot → término laboral → perfil). UI `/staff/history` edita `overtime_price_snapshot`. Consumidores unificados: `get_monthly_timesheet`, `get_weekly_worker_stats` (`/dashboard/overtime`, dashboard admin), `fn_labor_overtime_allocated_day` (`/dashboard/labor`), `fn_worker_hourly_rate` (Insights), prorrateo ventas, `fn_recalc` (`total_cost`).
- **Insights: capa datos rentabilidad horaria — backend (2026-05-30)**: Migración [`20260530143000_insights_hourly_profitability.sql`](supabase/migrations/20260530143000_insights_hourly_profitability.sql) — RPCs `get_hourly_sales_vs_labor`, `get_weekday_ticket_analysis`, `get_product_margin_ranking`. Parche casts: [`20260530150000`](supabase/migrations/20260530150000_fix_recipe_cost_casts_and_insights_rpc3.sql). Weekday simplificado (sin `events`/encargos): [`20260530180000`](supabase/migrations/20260530180000_insights_weekday_remove_encargos.sql).
- **Insights: panel `/dashboard/insights` — UI (2026-05-30)**: SSR [`page.tsx`](src/app/dashboard/insights/page.tsx) + client [`InsightsClient.tsx`](src/app/dashboard/insights/InsightsClient.tsx) — 3 visualizaciones Recharts (venta vs coste hora, weekday, ranking margen producto), presets 7/30/Ayer, refetch por sección, acceso master vía [`MasterShortcutGrid`](src/components/dashboards/MasterShortcutGrid.tsx), proxy manager/admin en [`src/proxy.ts`](src/proxy.ts).
- **Staff: eliminada página legacy `/staff/page.tsx` (2026-05-30)**: El hub de sala vive en `/staff/dashboard` (`StaffDashboardView` vía `DashboardSwitcher`). Ruta `/staff` redirige en [`proxy.ts`](src/proxy.ts) → `/staff/dashboard`. Eliminado duplicado de ~850 líneas (fichaje, consumo, horarios) que coexistía con el dashboard unificado.
- **Albaranes: fix auto-mapeo RPC ambigua (2026-05-30)**: Migración [`20260530120000_fix_auto_map_invoice_lines_fuzzy_overload.sql`](supabase/migrations/20260530120000_fix_auto_map_invoice_lines_fuzzy_overload.sql) — elimina sobrecarga duplicada `auto_map_invoice_lines_fuzzy(uuid, double precision)` que provocaba error PostgREST al pulsar auto-mapeo; queda solo firma `(uuid, numeric)`.
- **Master dashboard personal Hector (2026-05-29)**: Nueva ruta `/master/dashboard` exclusiva para `hhector7722@gmail.com` — carrusel de 3 pantallas (Admin | Master | Staff) con indicadores iOS; sección de ventas dinámicas compartida (`DashboardVentasSection`) + rejilla de 19 accesos rápidos (`MasterShortcutGrid`) incluyendo Caja Inicial verde en tiempo real y cajas de cambio. Guards en [`proxy.ts`](src/proxy.ts), redirect `/` → master, Navbar y BottomNav apuntan a hub central.
- **Pedidos por eventos: formulario público = carta digital (2026-05-28)**: `/eventos/[slug]` carga `v_public_menu_items` filtrado por `event_products` ([`load-event-carta-menu.ts`](src/lib/load-event-carta-menu.ts)) y renderiza **`MenuAccordion`** (misma UI que `/carta` y `/staff/carta`) con controles +/− por producto ([`EventCartaOrderControls`](src/components/carta/EventCartaOrderControls.tsx), [`event-order-carta.ts`](src/lib/event-order-carta.ts)). Pack inicial del evento pre-rellena cantidades. Staff/supervisor acceden a `/dashboard/eventos` en lectura desde Info → Encargos ([`StaffDashboardView`](src/components/dashboards/StaffDashboardView.tsx), proxy).
- **Pedidos por eventos: admin + formulario público + CSV (2026-05-28)**: Nueva migración [`20260528162000_event_orders_system.sql`](supabase/migrations/20260528162000_event_orders_system.sql) — tablas `event_products`, `event_default_pack` (singleton), `events`, `event_orders` con RLS; función `create_event_order(p_slug,p_responsible_name,p_items,p_notes)` `SECURITY DEFINER` para permitir INSERT anónimo validado (evento activo/no pasado, productos permitidos/activos, total calculado en servidor). **Proxy**: `/eventos/*` bypass público como `/carta` ([`src/proxy.ts`](src/proxy.ts)). **Admin**: nueva ruta `/dashboard/eventos` (manager/admin) con gestión de productos de eventos desde `v_digital_menu_items` → `event_products`, editor pack por defecto, creación de eventos (slug `slugify(name)-YYYY-MM-DD-xxxx`), listado con copiar URL + toggle activo, y vista pedidos `/dashboard/eventos/[eventId]/pedidos` con cambio de estado. **Export**: `/api/eventos/[eventId]/export` descarga CSV (auth manager/admin). **Público**: `/eventos/[slug]` — resumen sticky y confirmación vía RPC `create_event_order`.
- **Docs: `LLM_PROMPT.md` sincronizado automáticamente con este archivo (2026-05-28)**: La §11 de [`context/LLM_PROMPT.md`](context/LLM_PROMPT.md) se regenera desde el changelog superior de `PROJECT_STATUS.md` vía `npm run sync:llm-prompt`, hook Git (`.githooks/pre-commit` tras `npm run setup:githooks`) y hook Cursor (`.cursor/hooks.json` → `afterFileEdit` al guardar este archivo).
- **Fichajes especiales: horas desde entrada/salida (2026-05-28)**: Al guardar tipos distintos de `regular` (Festivo, Baja, Enfermedad, Personal, etc.) [`updateWeeklyWorkerConfig`](src/app/actions/overtime.ts) ya no fuerza `total_hours = 8`; calcula con redondeo Marbella entre `clock_in` y `clock_out` (o respeta `total_hours_override` del manager). Fichajes históricos con 8h fijas requieren re-guardar el día o recálculo manual para corregir `time_logs.total_hours`.
- **UTC verdad única en ingesta BDP + render Madrid (2026-05-26)**: Bridge [`context/index.txt`](context/index.txt) — `toIso()` obligatorio (Z) en ventas y telemetría. Gateway [`context/server.txt`](context/server.txt) — `resolveVentaTimestamps` UTC puro; `diaNegocio` solo Madrid; telemetría normaliza `timestamp_tpv` a ISO. Webhooks Next [`ventas/route.ts`](src/app/api/webhooks/bdp/ventas/route.ts), [`telemetria/route.ts`](src/app/api/webhooks/bdp/telemetria/route.ts). Frontend: [`date-utils.ts`](src/utils/date-utils.ts) (`formatInTimeZone`), [`formatTicketTimeMadrid`](src/utils/date-utils.ts) en ventas/admin, [`getHourFromTicketTime`](src/lib/utils.ts) por hora Madrid. Sin migración BD ni backfill histórico. Desplegar: copiar `index.txt` + `server.txt` y reiniciar PuenteBDP/receptor.
- **Tesorería TPV BDP: desglose cobros + staging caja (2026-05-26)**: Migración [`20260526150000_refactor_tesoreria_bdp.sql`](supabase/migrations/20260526150000_refactor_tesoreria_bdp.sql) — `tickets_marbella.cobro_efectivo|tarjeta|pendiente`, tabla `bdp_cash_movements` (concepto 107, UNIQUE dedup), RPC `get_closing_sales_breakdown(p_date)`. Puente [`context/index.txt`](context/index.txt): `VENTAS_WHERE` incluye `Hora_Cierre IS NOT NULL OR Pendiente = 1` (a cuenta sin cierre); poll prioriza pendientes sin cierre; `Documentos_Pagos` + firma de cobros (re-upsert al pagar); poll caja 12s. Radar sala **sin cambios** (Comandas + DIRECTO 15 min). Receptores upsert `numero_documento`: [`context/server.txt`](context/server.txt), [`src/app/api/webhooks/bdp/ventas/route.ts`](src/app/api/webhooks/bdp/ventas/route.ts), [`src/app/api/webhooks/bdp/caja/route.ts`](src/app/api/webhooks/bdp/caja/route.ts). Cierre: [`CashClosingModal.tsx`](src/components/CashClosingModal.tsx). Dashboard/KPIs: `get_daily_sales_stats` suma `total_documento` de todos los tickets del día (pendientes = devengo). Desplegar migración; TPV: `index.txt` → `AgenteBDP/index.js`, `pm2 restart PuenteBDP`; gateway Linux: `server.txt` + reinicio.
- **Reservas: tabla + RLS + RPC + UI staff realtime (2026-05-27)**: Migración [`20260527140600_create_reservations_module.sql`](supabase/migrations/20260527140600_create_reservations_module.sql) — tabla `public.reservations` (INSERT `anon`/`authenticated`, SELECT/UPDATE `authenticated`) + RPC `consultar_reservas(p_fecha)` (array JSONB por día) y `gestionar_reservas(p_accion,p_datos)` (status `confirm|reject|cancel`). UI sala: nueva ruta [`/staff/reservas`](src/app/staff/reservas/page.tsx) + [`ReservasClient.tsx`](src/app/staff/reservas/ReservasClient.tsx) (Touch-first, Bento, Zero-display en notas, botones min-h-12, anti-silent failures con `toast.error`, realtime `channel('public:reservations')` INSERT→toast+refetch). Enlaces desde [`StaffDashboardView.tsx`](src/components/dashboards/StaffDashboardView.tsx) y [`/staff/dashboard`](src/app/staff/dashboard/page.tsx).
- **Reservas: eliminar con confirmación + soft-delete (2026-06-11)**: Migración [`20260611160000_reservations_delete_with_cancel_fallback.sql`](supabase/migrations/20260611160000_reservations_delete_with_cancel_fallback.sql) — `gestionar_reservas` acción `delete` (DELETE físico; si falla → `status=cancelled` + `soft_deleted`). RLS DELETE `authenticated`. UI [`ReservasClient.tsx`](src/app/staff/reservas/ReservasClient.tsx): modal de confirmación antes de eliminar, oculta `cancelled` en calendario, fallback cliente `cancel` si RPC antigua sin `delete`. **Desplegar migración en Supabase.**
- **Consumo personal: cantidad visible en modal y dashboard (2026-05-26)**: [`ConsumptionModal.tsx`](src/app/staff/ConsumptionModal.tsx) — filas táctiles `−` / `×N` / `+`, badge `×N` en grid, `handleDecrement` (a 0 elimina línea). [`20260526120000_staff_consumption_day_detail_quantity.sql`](supabase/migrations/20260526120000_staff_consumption_day_detail_quantity.sql) — RPC `get_staff_consumption_day_detail` devuelve `quantity` (suma por `reference_doc` de `SUM(quantity movimientos) / COUNT(ingredientes receta)`). [`consumo-personal/page.tsx`](src/app/dashboard/consumo-personal/page.tsx) — desglose `Nombre ×4 — 1,44 €`. Desplegar migración en Supabase.
- **Cierre de caja: rediseño paso 1 Datos (2026-05-25)**: [`CashClosingModal.tsx`](src/components/CashClosingModal.tsx) — 6 filas (Clima→Ventas→Tickets→Tarjeta→Cobros→Pendiente), títulos petróleo `#36606F`, inputs borde petróleo. Clima: selector por iconos [`/public/icons/clima/`](public/icons/clima/) sin selección por defecto ([`cash-closing-weather.ts`](src/lib/cash-closing-weather.ts)). Fotos: botones verdes «Añadir informe» / «Añadir totales» + submodal cámara ([`ClosingStep1Parts.tsx`](src/components/cash-closing/ClosingStep1Parts.tsx)). Siguiente verde; sync TPV automático sin botón Refresh.
- **Horas: cron recálculo global semanal + DST Madrid (2026-05-25)**: Dos jobs pg_cron con guarda CET/CEST: `weekly_recalculate_balances_winter` (`0 3 * * 1`, offset Madrid=1) y `weekly_recalculate_balances_summer` (`0 2 * * 1`, offset=2); wrappers `cron_weekly_recalculate_balances_if_madrid_*`. Migración [`20260525120000_cron_weekly_recalculate_all_balances.sql`](supabase/migrations/20260525120000_cron_weekly_recalculate_all_balances.sql). Sin `CREATE EXTENSION pg_cron`.
- **Cierres de caja: fotos obligatorias datáfonos + ticket BDP (2026-05-24)**: Columnas `cash_closings.dataphone_totals_photo_path` y `bdp_closing_ticket_photo_path` (rutas en bucket privado `cash_closings`). Migración [`20260524180000_cash_closing_photos.sql`](supabase/migrations/20260524180000_cash_closing_photos.sql). **Cierre**: [`CashClosingModal.tsx`](src/components/CashClosingModal.tsx) exige ambas fotos en paso 1, preview en resumen, subida vía [`uploadCashClosingPhotoAction`](src/app/actions/cash-closing-photos.ts) antes del INSERT. **Historial**: [`history/page.tsx`](src/app/dashboard/history/page.tsx) muestra thumbnails + lightbox con URLs firmadas; al borrar cierre se eliminan objetos del Storage.
- **Albaranes: portes / sin cargo / ajustes sin ingrediente (2026-05-24)**: Nuevo estado `purchase_invoice_lines.status = 'excluded'` para líneas que no van a almacén (portes, sin cargo, ajustes). Cuentan como **resueltas** en el tick verde del albarán sin `mapped_ingredient_id` ni PURCHASE. UI: botón **Portes / ajuste / sin cargo** en [`LineEditModal.tsx`](src/components/albaranes/LineEditModal.tsx); icono gris en lista; **Volver a mapear** restaura a `pending`. Server action [`excludeInvoiceLineFromMappingAction`](src/app/dashboard/albaranes/actions.ts). Helpers [`albaranes-line-status.ts`](src/lib/albaranes-line-status.ts). Migración [`20260524120000_purchase_invoice_lines_excluded_status.sql`](supabase/migrations/20260524120000_purchase_invoice_lines_excluded_status.sql) (comentario + RPC auto-mapeo ignora excluidas).
- **Fichajes: «Eliminar día completo» no borraba en producción (2026-05-24)**: El calendario agrupa por `(clock_in AT TIME ZONE 'Europe/Madrid')::date`, pero `deleteManagerDayLogs` filtraba con `new Date(y,m-1,d)` en **UTC del servidor** (Vercel) → 0 filas borradas y toast de éxito. Fix: [`madridDayUtcRangeIso`](src/lib/madrid-date-bounds.ts) en [`overtime.ts`](src/app/actions/overtime.ts) + comprobación de filas borradas; mismo rango en [`AttendanceDetailModal.tsx`](src/components/modals/AttendanceDetailModal.tsx) y horas en Madrid vía `formatMadridHmFromIso`.
- **Horarios: selector «Añadir personal» unificado + sin bajas (2026-05-23)**: [`ScheduleDayEditor.tsx`](src/components/schedule/ScheduleDayEditor.tsx) usa [`StaffSelectionModal`](src/components/modals/StaffSelectionModal.tsx) (`variant="profile-list"`, como Plantilla/labor) en lugar del modal propio; solo activos (`end_date` NULL) y excluye quien ya está en el día. Avatares vía `avatar_url`. Turnos históricos de bajas siguen visibles en la rejilla si ya existían.
- **Staff: salida con consumo obligatorio y fallo RPC silenciado (2026-05-20)**: Al fichar salida, carrito vacío → aviso y sin `clock_out` ([`ConsumptionModal.tsx`](src/app/staff/ConsumptionModal.tsx), botón deshabilitado). Con ítems: [`submitPersonalConsumption`](src/app/staff/actions.ts) guarda vía `process_staff_consumption`; si la RPC falla (unidades, red, BD), se omite el consumo en silencio (`consumptionSkipped`, log servidor) y se permite `handleClockAction('out')`. Servidor rechaza `items.length === 0` (anti-bypass DevTools).
- **Ingredientes: `recipe_unit` + alta en recetas con unidad por defecto (2026-05-23)**: Columna `ingredients.recipe_unit` (`g|kg|ml|cl|l|ud`, backfill desde `purchase_unit`). Editable en `/ingredients` (modal, wizard paso opcional, creación experta). En `/recipes/[id]` al añadir línea se usa la unidad del catálogo (badge en el modal); selector «Forzar unidad» opcional; la unidad sigue editable en la tabla de la receta. Migración [`20260523120000_ingredients_recipe_unit.sql`](supabase/migrations/20260523120000_ingredients_recipe_unit.sql); helpers `resolveIngredientRecipeUnit` / `defaultRecipeUnitFromPurchase` en [`recipe-cost.ts`](src/lib/recipe-cost.ts).
- **Carta: portada categoría/subcategoría con imagen libre (2026-05-18)**: Columnas `categories.cover_photo_url` y `cover_photo_scale` (S/M/L); si hay URL, prevalece sobre `cover_articulo_id`. Migración [`20260518140000_categories_cover_custom_photo.sql`](supabase/migrations/20260518140000_categories_cover_custom_photo.sql) recrea vistas carta. Subida normalizada a Storage `carta_items/category-covers/{category_id}/…` vía [`uploadNormalizedCategoryCoverPhoto`](src/app/dashboard/carta/photo-actions.ts); persistencia [`setMenuCategoryCover`](src/app/dashboard/carta/actions.ts). Modal [`MenuCategoryEditModal.tsx`](src/components/carta/MenuCategoryEditModal.tsx): pestañas Sin / Producto / Archivo + talla en modo archivo. Resolución [`resolveMenuCategoryCoverById`](src/lib/carta-category-covers.ts) y páginas `/carta` y `/staff/carta` con fallback si faltan columnas.
- **Carta: grid alineado nombre/precio con fotos S/M/L mezcladas (2026-05-18)**: En cada fila del grid (3 columnas), el marco de foto usa la escala **máxima** de la fila (`getCartaProductGridRowFrameStyle`); cada imagen sigue escalando con `transform` **centrada** en ese hueco. Nombre y precio quedan a la misma altura en `/carta` y staff.
- **Carta: tallas de foto S / M / L por producto (2026-05-15)**: `digital_menu_overrides.carta_photo_scale` (`s`|`m`|`l`, default `m`); migración [`20260515170000_carta_photo_scale.sql`](supabase/migrations/20260515170000_carta_photo_scale.sql); vistas carta exponen el campo. Helpers en [`carta-product-photo.ts`](src/lib/carta-product-photo.ts): `getCartaProductPhotoScaleFactor`, marco con `getCartaProductPhotoFrameStyle` (ratio/altura acorde al factor para no dejar hueco vertical), `cartaProductGridRowDensity` + `chunkCartaProductGridRows` (fila del grid más compacta si todas las fotos visibles son S, o solo S/M). Grid producto (Tapas/Bocadillos/Platos/Bebidas), Plato Marbella, portadas subcategoría y home. Editor: selector S·M·L + mini-preview en [`MenuItemEditModal.tsx`](src/components/carta/MenuItemEditModal.tsx).

<!-- sync:project-status:end -->
