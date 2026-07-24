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

**Fuente**: `PROJECT_STATUS.md` — **última actualización:** 2026-07-24 (Asistencia: etiqueta especial en dashboard + fit real)

Hitos recientes (mismo orden que el changelog superior de `PROJECT_STATUS.md`; máx. 45 entradas):

- **Asistencia etiqueta especial visible (2026-07-24)**: El calendario del **dashboard staff** seguía con círculo F/E/B/P (por eso «no había cambio»). Ahora usa `SpecialDayLabel` compartido (historial + dashboard): nombre completo centrado, tamaño por longitud + measure con probe (sin `max-w-full`).
- **Asistencia celda: fila P encima de H (2026-07-24)**: Si hay `justified_hours` con fichaje, fila `P` (misma tipografía que H/Ex) + valor en azul, encima de `H` (solo trabajadas). Sin `+j` en la misma línea ni badge esquina.
- **Zoom browser temporal solo Héctor (2026-07-24)**: `generateViewport` en `layout.tsx` habilita pinch/double-tap zoom (`userScalable`, max 5) solo si email = `hhector7722@gmail.com`; resto del staff sigue bloqueado. También se omite `touch-manipulation` en `<body>` para ese usuario. **Revertir cuando ya no haga falta.**
- **Shadow Convergence Iteración A (2026-07-24)**: Única causa — SQL no persistía `ordinary_hours`/`extra_hours`. Fix en `fn_recalc_and_propagate_snapshots` + backfill. Shadow run `3ade336a-…` semana 2026-07-20: EMR **35,29% → 52,94%**, CDR **64,71% → 47,06%**, D006 fuera del top. Migración `20260724080000_shadow_iter_a_ordinary_extra_hours.sql`. **Sin B/C/D/E ni 8B.**
- **Shadow Validation Report (2026-07-24)**: Auditoría del run `7e73bfc9-…` (EMR 35,29%). Causas raíz agrupadas A–F (≥90% explicado). **8B bloqueado** hasta corregir A+B (ordinary/extra SQL + `end_date`). Doc: [`SHADOW_VALIDATION_REPORT.md`](SHADOW_VALIDATION_REPORT.md).
- **Shadow Mode Commit 8A — CLI ops + loaders reales (2026-07-24)**: `npm run shadow` → loaders Supabase (subjects/facts) → `executeAndPersistShadowRun` → resumen consola. Dominio sin CLI/Supabase. Fallos por sujeto no abortan. Primer run real semana `2026-07-20`: EMR 35.29%, persistido `7e73bfc9-…`. **8B NO** (cron/flags/dashboard/alertas).
- **Shadow Mode Commit 7 — Persistencia desacoplada (2026-07-24)**: Puertos `Shadow*Store` en dominio; `persistShadowRunResult`; in-memory + infra Supabase (`src/infrastructure/shadow`). Migración `20260724060000_shadow_parity_persistence.sql` (RLS manager) **aplicada**. Runner sin Supabase; persistencia opcional.
- **Shadow Mode Commit 6 — Runner in-memory (2026-07-24)**: `executeShadowRun` orquesta subjects→facts→adapters→compare→classify→`ShadowRunResult` sin persistir. Puertos inyectables + fixtures. Determinista con clock/runId fijos.
- **Shadow Mode Commits 1–5 (2026-07-24)**: Dominio `src/lib/shadow/` — Canonical Vector, adapters HE/SQL, Discrepancy+lifecycle, comparator, classifier D000–D017.
- **Asistencia celda: fuente dinámica etiqueta especial (2026-07-24)**: Día solo F/E/B/P → nombre completo centrado con tamaño Tailwind adaptativo (12→7px) según ancho de celda (`ResizeObserver`), para que «Baja»/«Festivo» lean más grandes y «Enfermedad» no se corte.
- **Asistencia celda: nombre completo y H+personal (2026-07-24)**: Día solo F/E/B/P → etiqueta completa centrada (`Festivo`, `Enfermedad`, …) sin círculo/letra. Día con fichaje + `justified_hours` → sin **P** esquina; fila `H 6 +1` con el `+1` en azul personal. Regular / no registrado sin cambio.
- **Fix horas justificadas vs `idx_one_shift_per_day` (2026-07-23)**: La BD solo permite **un** `time_logs` por empleado/día. Columna `justified_hours` (migración aplicada). El modal suma el permiso en el mismo fichaje (`total_hours = trabajadas + justificadas`). Badge **P** si `justified_hours > 0`.
- **Fix guardar horas justificadas (2026-07-23)**: El upsert de `time_logs` enviaba `id: null` en registros nuevos → `NOT NULL` y no persistían. Separados update (con id) e insert (sin id, usa `gen_random_uuid()`). Reloj sintético de justificadas a las 20:00 Madrid vía `fromZonedTime`.
- **Asistencia: día completo vs permiso parcial (2026-07-23)**: En `WeekCard`, día solo F/E/B/P = **letra grande centrada** (sin círculo, sin relojes, sin H). Día mixto (fichaje real + horas justificadas/examen) = relojes + **H** suma + **P** pequeña arriba-izquierda (sin círculo). `aggregateLogsForDay` ya no usa relojes sintéticos de eventos especiales para `clockIn`/`clockOut`.
- **Horas justificadas en asistencia (2026-07-23)**: En el modal de día (`AttendanceDetailModal`), managers pueden añadir **horas que computan** (contrato/banco) sin ser jornada trabajada — caso típico: salida anticipada por examen. Crea un segundo `time_logs` con evento `personal` (o Festivo/Enfermedad/Baja), editable en horas; se suman al total del día. No cuentan en propinas (mismo filtro tip-pool de eventos no-regular). El modal lista todos los fichajes del día (antes solo el primero). En `WeekCard` (`/staff/history`): día mixto muestra relojes reales + **H** total + badge **P** (o F/E/B); día solo justificado sigue mostrando solo la letra.
- **Fecha de finalización editable en condiciones laborales (2026-07-22)**: En `/profile/contrato`, al editar un tramo el campo «Hasta» deja de ser solo lectura («Vigente»). `rescheduleTermEnd` / `rescheduleTermBounds` recalculan el siguiente tramo (sin huecos); vacío = vigente (solo último). Si cambia el fin del último tramo, sincroniza `profiles.end_date`. Tests versionado + labor.
- **Fecha de inicio editable en condiciones laborales (2026-07-21)**: En `/profile/contrato`, al editar un tramo del histórico la fecha de inicio es editable. `rescheduleTermStart` recalcula el tramo anterior (sin huecos) y, si es el primer tramo, sincroniza `profiles.joining_date`. Tests versionado + labor.
- **Fix filtro empleado bolsa+deuda (2026-07-21)**: Pere (y similares) fallaban al filtrar en `/staff/history` — assert `EXTRAS > 0 con carryOut negativo` en modo bolsa. Footer EXTRAS = 0 si queda deuda (igual que pago). Toast con detalle del error. Tests week-card **19/19**; plantilla julio OK todos.
- **Historial filtrado alineado a plantilla (2026-07-21)**: En `/staff/history`, la vista empleado ya no usa `get_monthly_timesheet` para relojes. Semanas desde `time_logs` + TZ Madrid (`buildEmployeeWeeksFromTimeLogs`), igual que plantilla. Footer sigue con hours-engine. Export multi + simulación YTD mismo criterio. Tests: `build-employee-weeks-from-logs.test.ts` (4).
- **Fix invariante Σ extras diarias (2026-07-21)**: Redondear OT/ordinarias en `regime-policy` rompía la coherencia con `daily-breakdown` (ej. `0.619999… ≠ 0.5`) y tumba el modal «Historial semanal» (`No data found` + toast). OT/ordinarias vuelven sin redondear ahí; el banco sigue en `.0/.5` vía carry. Assert compara en escala Marbella. Suite **122/122**.
- **Asistencia UI restaurada a aspecto previo (2026-07-21)**: `PlantillaWeekCard` + `WeekCard` vuelven al look de antes del cambio de visibilidad (colores, opacity, layout). El modal de día sigue mostrando el detalle completo.
- **Plantilla asistencia: ver todos los fichajes (2026-07-21)**: En vista plantilla (`PlantillaWeekCard`) se eliminó el tope `slice(0, 4)`, el `overflow-hidden` y la `opacity-45` de días de otro mes que ocultaban fichajes (el modal sí los tenía). Celdas crecen con todos los empleados. `WeekCard` individual: sin atenuar fichajes; si hay reloj en día especial (F/E/…) también se pinta. **Revertido visualmente** (ver entrada superior).
- **Horas solo enteros o media + color Horarios (2026-07-21)**: Banco/carry y footers pasan por `roundMarbellaSigned` (nada tipo 83,7). UI (`WeekCard`, home, modal historial) formatea con `calculateRoundedHours`. Mini-calendario Horarios: revertido gris `text-gray-300` en días pasados → `text-gray-900` (igual que futuros).
- **Semana sin fichajes consume contrato (2026-07-21)**: Eliminado el early-return de `liquidateWeek` que forzaba `weeklyBalance = 0` sin fichajes. Staff con jornada: semana vacía → `weeklyBalance = −contrato` y baja el banco. Solo sin tramos (post-baja) queda balance 0. Suite hours-engine **122/122**.
- **Fix selección Pago/Bolsa semanal (2026-07-21)**: El motor ignoraba `weekly_snapshots.prefer_stock_hours_override` y repintaba siempre el `bagMode` del contrato. Ahora `liquidateWeek` acepta `bagModeOverride`; historial/modal/home leen el override y lo aplican en liquidación + carry. Aplicar Bolsa/Pago en WeekCard vuelve a persistir y verse.
- **Horas contrato enteras/medias + no cobrar con deuda (2026-07-21)**:
- **OCR albaranes en segundo plano (2026-07-21)**: En escáner `/dashboard/scanner` (y hoja extra en `/dashboard/albaranes`), **Guardar** sube imagen + crea `purchase_invoices` con `status=processing` al instante; Gemini corre en `after()`. Fallo → `ocr_failed` + `ocr_error`, UI con **Reintentar lectura** / **Sustituir foto**. Migración [`20260721120000_purchase_invoices_ocr_background.sql`](supabase/migrations/20260721120000_purchase_invoices_ocr_background.sql) **aplicada** (`ocr_error`, adjuntos `ocr_status`/`ocr_error`, `sync_purchase_invoice_status` respeta processing/ocr_failed).
- **Editar Efectivo en modal de cierre (2026-07-20)**: En `/dashboard/history`, al editar un cierre, **Efectivo** es editable: abre el desglose guardado (`cash_closings.breakdown`) con controles +/− táctiles. Al «Guardar desglose» se persiste `breakdown`/`cash_counted`/`cash_withdrawn` y el trigger `trg_cash_closing_to_treasury_v2` actualiza el `CLOSE_ENTRY` en `treasury_log` (importe + desglose + inventario/saldo) visible en `/dashboard/movements`.
- **Home staff alineado al motor — PENDIENTES = banco al inicio (2026-07-20)**: `StaffDashboardView` deja `profiles.hours_balance` / `effectivePivot`. Misma orquestación que historial: `resolveOpeningCarryIn` + `liquidateWeekForCard`. Pendiente = `carryIn`; EXTRAS/IMPORTE desde el mismo `LiquidationResult`.
- **Auditoría documental e IA (2026-07-18)**: Inventario exhaustivo solo lectura en [`AUDITORIA_DOCUMENTAL.md`](AUDITORIA_DOCUMENTAL.md) — OCR/Gemini, PDFs, Storage, Whisper, webhooks, scripts, oportunidades MinerU/VLM. Sin cambios de código ni refactor.
- **Cadena continua de carry (openingCarryIn) (2026-07-17)**: Orquestación UI — `resolveOpeningCarryIn` reconstruye el carryOut de W−1 desde el timeline del empleado. `/staff/history` y `WorkerWeeklyHistoryModal` ya no asumen `carryIn = 0` al abrir un mes/semana. `patchWeeksFromLiquidation` / `liquidateWeekForCard` exigen carry explícito. Motor/Carry/Resolver **sin cambios**. Tests: `opening-carry.test.ts` (8) — suite hours-engine **132/132**. Caso Alba S22→S23: PENDIENTES junio = −3.79.
- **Fix editar pedido staff (2026-07-16)**: `update_staff_event_order` ya no escribe `updated_at` en `event_orders` (columna inexistente). Migración [`20260716250000_fix_update_staff_event_order_no_updated_at.sql`](supabase/migrations/20260716250000_fix_update_staff_event_order_no_updated_at.sql) **aplicada**.
- **Editar histórico contractual desde la lista (2026-07-16)**: En `/profile/contrato`, pulsar un tramo del histórico abre corrección de horas/régimen/bolsa/tarifa (periodo solo lectura). Reescritura in-place vía planificador (`D = inicio del tramo`) + coalescencia. Sin editar `effective_from`/`effective_to` a mano.
- **Factura imprimible en modal pedido reservas (2026-07-16)**: Sustituida la X de cierre por icono factura (`Receipt`). Misma vía de impresión que la comanda (iframe → print). Logo, desglose qty/precios, fecha/hora reserva, base + IVA 10%, total, mensaje de gracias. Cierre del modal: tap fuera.
- **Condiciones laborales v2 — fecha efectiva + splice (2026-07-16)**: Formulario con fecha efectiva (default hoy Madrid). Planificador unificado: localiza tramo, parte o reescribe in-place, cola intacta, coalescencia de vecinos idénticos. `profiles` espeja el tramo **abierto**. UI: cabeceras petróleo en `/profile/contrato`. Sin orquestador. Tests: `test:hours-engine:contract-terms` + `labor` → suite **124/124**.
- **Fix TypeScript build Vercel — filtro FC recetas (2026-07-16)**: El ternario en `.select(needsFc ? RECIPE_FOOD_COST_SELECT : …)` rompía el parser de tipos de Supabase (`ParserError`). Ramas separadas en `/recipes` y `/recipes/[id]`; `RECIPE_FOOD_COST_SELECT` con `as const`.
- **Ver pedido: precio por fila + total (2026-07-16)**: En el modal «Tu pedido», cada línea muestra el importe (qty × precio entero/medio) y al pie el total en €.
- **Filtro Food Cost en URL + nav detalle (2026-07-16)**: `fc=optimal|alert|critical` en query (como `cat`). Lista ↔ ficha y flechas prev/next solo entre recetas que cumplen el filtro. Helper compartido [`recipe-food-cost.ts`](src/lib/recipe-food-cost.ts).
- **Navegación plantilla desde /profile (manager) (2026-07-16)**: En `/profile`, managers ven flecha atrás (sin marco) que abre `StaffSelectionModal`; al elegir trabajador → `/profile?id=`. Si el modal se abre desde perfil, su flecha vuelve al home del rol (`getHomeHrefForUser`). Desde dashboard/otras pantallas el modal no muestra esa flecha. Navbar no duplica la flecha en `/profile` para managers.
- **Condiciones laborales v1 (2026-07-16)**: Pantalla `/profile/contrato?id=` (botón «Condiciones laborales» en `/profile`, solo `hhector7722@gmail.com`). Resumen + histórico; CTA «Cambiar condiciones laborales». Escritura: Server Action → `persistContractualChange` → `hours_contract_terms` → espejo `profiles`. Bloqueo de campos contractuales en `updateProfile`. Tests: `npm run test:hours-engine:labor`. (Edición histórica y fecha efectiva: ver entradas posteriores.)
- **Filtro Food Cost en Cat. (/recipes) (2026-07-16)**: Primera opción del popup «Cat.» = «Filtrar Food Cost»; subfiltro Óptimo (<30%) / Alerta (30–35%) / Crítico (≥35%). Chip activo con X. Solo managers/supervisors (misma visibilidad que el precio FC). Compatible con filtro por categoría.
- **Badge cantidad en esquina de foto (2026-07-16)**: Círculo de unidades sobre la imagen (esquina superior derecha, inset) — 100% visible, sin sombra ni recorte. Nombre sin badge.
- **Reabrir pedido: cliente parte del pedido existente (2026-07-16)**: `/pedido/[token]` hidrata el carrito con `event_orders.items` vía RPC `get_client_event_order_items_by_token` (mapea `is_half` → `id:medio`). Reopen sigue sin borrar líneas. Migración [`20260716240000_get_client_order_items_by_token.sql`](supabase/migrations/20260716240000_get_client_order_items_by_token.sql) **aplicada**.
- **Footer pedido UX (2026-07-16)**: «Ver pedido» sin icono; unidades en badge rojo tipo notificación; botones más bajos con safe-area. Badge de cantidad en productos sin recorte (overflow + estilo campana).
- **Tarjeta semanal: footer → motor (2026-07-16)**: HORAS / PENDIENTES / EXTRAS / IMPORTE salen de `LiquidationResult` vía [`week-card-from-liquidation.ts`](src/lib/hours-engine/week-card-from-liquidation.ts) + `patchWeeksFromLiquidation`. Misma fuente que Ex. diarias → imposible discrepancia. `/staff/history` + `WorkerWeeklyHistoryModal`. RPC solo clocks/`isPaid`. Tests: `npm run test:hours-engine:week-card` (10) + suite **104/104**. Sin orquestador, sin borrar snapshots.

<!-- sync:project-status:end -->
