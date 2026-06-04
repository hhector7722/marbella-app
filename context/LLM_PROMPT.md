# Bar La Marbella — Contexto para LLM (prompt-ready)

Este documento está diseñado para **copiar/pegar** como contexto en un LLM cuando se vaya a trabajar en este repositorio.

---

## 0) Mantenimiento (OBLIGATORIO)

Este archivo (`context/LLM_PROMPT.md`) es un **artefacto “prompt-ready”**. Debe estar **siempre** actualizado y listo para copiar/pegar.

- **Sincronización automática (§11)**: la sección **«Estado actual»** se **genera sola** desde el changelog superior de `PROJECT_STATUS.md`:
  - Al guardar `PROJECT_STATUS.md` en **Cursor** → hook `afterFileEdit` (`.cursor/hooks.json`).
  - Al **commit** con `PROJECT_STATUS.md` en staging → hook `.githooks/pre-commit` (activar una vez: `npm run setup:githooks`).
  - Manual o CI: `npm run sync:llm-prompt` · comprobar sin escribir: `npm run sync:llm-prompt:check`.
- **Regla**: tras cambios en rutas, stack, reglas duras, esquema DB o APIs, **editar a mano** las secciones 1–10 de este archivo (la §11 no se edita a mano).
- **Fuente de verdad**:
  - Estado funcional y roadmap: `PROJECT_STATUS.md` (changelog superior → §11 automática)
  - Puente TPV / gateway: `context/index.txt`, `context/server.txt`
  - Precios ingredientes ↔ albaranes: `context/INGREDIENTS_PRECIOS_Y_ALBARANES.md`
  - Sync TPV / KDS: `context/ARQUITECTURA_SYNC_KDS.md`, bridge `context/index.txt`
  - Esquema y cambios DB: `supabase/migrations/` (y `schema_dump.sql` si existe)
- **Qué cambios obligan a tocar este archivo** (no exhaustivo):
  - Nuevas rutas o cambios de comportamiento en `/dashboard/*`, `/staff/*`, `/api/*`, `/carta`
  - Nuevas tablas/columnas/RPCs/triggers/RLS o cambios de permisos
  - Cambios de stack/versiones, build (Webpack), o librerías base
  - Nuevas variables de entorno o cambios en nombres/contratos
  - Nuevas “reglas duras” del proyecto (UX táctil, fechas, zero-display, anti-silent)

---

## 1) Identidad del proyecto (qué es)

**Bar La Marbella** es un sistema operativo táctil para hostelería con varios dominios:

- **Sala (Radar en vivo)**: estado de mesas/tickets en tiempo real (`estado_sala`, telemetría BDP). Ingesta ventas/caja vía bridge `context/index.txt` + gateway `context/server.txt` (UTC en origen, día negocio Madrid).
- **KDS (Cocina)**: comandas y líneas desde `estado_sala` → `kds_orders` / `kds_order_lines`.
- **Tesorería / Caja**: movimientos, arqueos, cierres, diferencia físico vs teórico; desglose TPV en cierre (`cobro_efectivo|tarjeta|pendiente`, RPC `get_closing_sales_breakdown`, staging `bdp_cash_movements`).
- **Finanzas**: PyG (devengo) vs cash flow (caja) vía RPC consolidada.
- **Personal**: asistencia, fichajes, horarios, horas extra, snapshots semanales (`AcumulaHoras`).
- **Propinas**: pools y reparto calculado en SQL.
- **Recetas / escandallo**: recetas, ingredientes, conversiones, coste (`get_recipe_cost`).
- **Carta digital**: QR público `/carta`, edición staff `/staff/carta`, Plato Marbella en 3 tramos (`PlatoMarbellaMenuView` QR; `PlatoMarbellaStaffGridView` en staff).
- **Reservas**: tabla `reservations` (INSERT `anon`/`authenticated`; gestión staff); RPC `consultar_reservas` / `gestionar_reservas`; UI `/staff/reservas` con Realtime.
- **Proveedores / albaranes**: escáner in-app (Gemini, incl. `unidad_medida` por línea) + mapeo proveedor→ingrediente con **tríada dimensional** (ud. facturación × cant./ud. contenido) + precio vía RPC `invoice_line_price_to_purchase_unit` + stock automático al mapear.
- **Pedidos**: pedidos a proveedores, PDFs y limpieza automática por cron.
- **Inventario / mermas / consumo personal**: recuento, ledger, waste, RPC `process_staff_consumption`.
- **IA integrada**: Copiloto (chat + voz LiveKit) con RBAC y registro de llamadas.
- **Insights / BI**: `/dashboard/insights` — PyG periodo (`get_financial_statement`), cobros híbridos tarjeta (`get_period_card_payments`), rentabilidad horaria y ranking margen (Recharts).
- **Pedidos por eventos**: formulario público `/eventos/[slug]` (carta digital + RPC `create_event_order`); admin `/dashboard/eventos`.
- **Hub master (Hector)**: `/master/dashboard` — carrusel Admin | Master | Staff + `MasterShortcutGrid`.

---

## 2) Stack (confirmado en repo)

- **Framework**: Next.js **16.2.6** (App Router)
- **UI**: React **19.2.6**
- **Lenguaje**: TypeScript (strict)
- **CSS**: TailwindCSS (sin estilos inline; usar `cn()` de `@/lib/utils`)
- **Iconos**: `lucide-react`
- **Estado**: `zustand`
- **Notificaciones UI**: `sonner` (+ `sileo` en pruebas)
- **Validación**: `zod`
- **IA app**: Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`)
- **Voz**: LiveKit (`livekit-client`, `livekit-server-sdk`)
- **PDF/Excel/Imagen**: `jspdf`, `jspdf-autotable`, `xlsx`, `papaparse`, `html-to-image`, `pdfjs-dist`, `pdf2json`
- **Backend**: Supabase (Postgres + Auth + RLS + Realtime + Storage)
  - SSR: `@supabase/ssr` (cookies)
- **Build**: Webpack forzado (`next dev/build --webpack`) por estabilidad en Vercel

---

## 3) Reglas duras del proyecto (NO negociables)

### UX / Frontend (táctil)
- **Touch-first**: targets ~48px+ (`min-h-12`, etc.).
- **Bento layout**: tarjetas limpias, `rounded-xl`, `shadow-sm`, `border-zinc-100`.
- **Flexbox safety**: botoneras inferiores y controles +/- con `shrink-0`; contenido superior con `flex-1`.

### Display
- **Regla Zero-Display**: en vistas de lectura (no formularios), valor **0** → **" "** (espacio).

### Fechas / Zona horaria
- **Timezone immunity**: prohibido `new Date('YYYY-MM-DD')` para fechas locales. Usar `new Date(y, m - 1, d)` o utilidades del proyecto (`parseTPVDate`, `parseDBDate`, `parseRadiografiaTimestamp`, `getStartOfLocalToday`, etc.).
- **UTC en ingesta BDP (2026-05-26)**: bridge `context/index.txt` — `toIso()` obligatorio (sufijo `Z`) en ventas y telemetría; gateway `context/server.txt` — `resolveVentaTimestamps` en UTC; `diaNegocio` solo en Europe/Madrid. **Render UI**: `formatInTimeZone` / `formatTicketTimeMadrid` en [`date-utils.ts`](src/utils/date-utils.ts); no reinterpretar ISO del TPV como hora local del navegador.
- **Anti-ISO-slice**: no manipular DateTime SQL/BDP con slices ingenuos; limpiar `T`/`Z` antes.
- **Telemetría TPV** (`context/index.txt`): `timestamp_tpv` = mínimo de todas las `Hora` válidas del ticket; cada producto lleva `hora` ISO.

### Backend / Supabase
- **RLS obligatorio** en tablas nuevas.
- **Anti-silent failures**: errores/ausencia de datos críticos → `toast.error` o `throw`; nunca `if (!data) return` en flujos principales sin alerta.
- **No inventar esquema**: confirmar en migraciones / `schema_dump.sql`.
- **QUERY SAFETY**: prohibido `.not('column', 'in', [array])` en supabase-js; usar `.neq()` encadenados u `.or()`.
- **Auth en edge/proxy**: usar **`getSession()`** para guards de ruta (no `getUser()` — puede colgar). Layout/actions críticos: timeouts con `withTimeout` / `ssrWithTimeout`.

### Horas / nóminas
- Revisar **`AcumulaHoras`** en perfil antes de lógica de extras (banco de horas vs pago).
- Horas extras en UI: solo **semanas completadas** (`p_only_completed_weeks` en RPC).
- **Fichajes especiales (2026-05-28)**: tipos distintos de `regular` (Festivo, Baja, etc.) — `updateWeeklyWorkerConfig` calcula `total_hours` entre `clock_in` y `clock_out` (redondeo Marbella) o respeta `total_hours_override`; **no** forzar 8h fijas.

### Dinero / stock
- Diferenciar **PVP** vs **coste**; funciones en `lib/utils.ts` / `lib/recipe-cost.ts`.
- Albaranes: stock `PURCHASE` idempotente por `reference_doc = 'ALB-LINE-<lineId>'`; borrado vía RPC `SECURITY DEFINER` (no DELETE directo en `stock_movements` si RLS/PostgREST fallan).
- **Conversión dimensional albarán (obligatoria en mapeo UI)**: tríada en `supplier_item_mappings` — `line_billing_unit` (ej. garrafa), `line_content_qty` + `line_content_unit` (ej. 5 + `l`). Precio catálogo: RPC `invoice_line_price_to_purchase_unit` (usa `convert_pricing_qty` o fallback `conversion_factor`). **No** recalcular en TS con `unit_price / factor` a ciegas. Trigger `handle_new_invoice_line`: `RAISE` si conversión imposible (anti-silent). Helpers UI: `src/lib/ingredient-pack-pricing.ts` (`ALBARAN_LINE_CONTENT_UNITS`, `suggestedDimensionalMappingFromIngredient`). SSOT: `context/INGREDIENTS_PRECIOS_Y_ALBARANES.md` (matriz; pendiente ampliar tríada).

---

## 4) Arquitectura y seguridad (Supabase SSR + RBAC)

### SSR Supabase
- Server: `createServerClient` (`src/utils/supabase/server.ts`).
- Client: `createBrowserClient` (`src/utils/supabase/client.ts`).

### Proxy de rutas (`src/proxy.ts`) — sustituye middleware clásico
- **Bypass**: `/api/*` sin auth (ingestas automáticas).
- **Público sin login**: `/carta`, `/carta/*`, `/eventos`, `/eventos/*`.
- Sin sesión → `/login` (salvo `/auth`, recovery en `/profile` con query tokens).
- **`/staff`** → redirect `/staff/dashboard`.
- **Staff/supervisor** en `/dashboard/*`: solo permitido:
  - `/dashboard/propinas`
  - `/dashboard/kds`
  - `/dashboard/albaranes`
  - `/dashboard/scanner`
  - `/dashboard/eventos` (lectura encargos)
  - Resto de `/dashboard/*` → redirect `/staff/dashboard`
- **`/dashboard/insights`**: solo **manager** y **admin** (supervisor → `/staff/dashboard`).
- **`/master/*`**: solo `hhector7722@gmail.com` (`isMasterDashboardUser`); resto → `/dashboard`.
- Login con sesión → home por rol (`getHomeHrefForUser`; master → `/master/dashboard`).
- Guard usa **`auth.getSession()`** + `profiles.role` con **`.maybeSingle()`**.

### Albaranes (permisos app, 2026-05-13+)
- **Lectura/lista/detalle/imagen**: todo `authenticated` (RLS `SELECT` abierto; sin filtrar por `created_by`).
- **Edición/mapeo/stock/reparar**: todo `authenticated` en server actions.
- **Mapeo línea↔ingrediente (UI activa)**: modal centrado [`LineMappingModal.tsx`](src/components/albaranes/LineMappingModal.tsx) desde [`AlbaranesHistoricoClient.tsx`](src/app/dashboard/albaranes/AlbaranesHistoricoClient.tsx) (lápiz 48px; **sin** panel inline expandible). Acciones: `confirmInvoiceLineMappingAction`, `updateMappedLineConversionFactorAction`, `resolveLineMappingAction`, `searchIngredientsForMappingAction` en [`albaranes/actions.ts`](src/app/dashboard/albaranes/actions.ts). Legacy FormData: `confirmarMapeoAction` en [`lib/actions/albaranes.ts`](src/lib/actions/albaranes.ts) — no usar en el flujo del histórico.
- **Eliminar albarán completo**: solo **manager/admin** (`deletePurchaseInvoiceAction`).
- Storage bucket `albaranes`: SELECT/UPDATE para `authenticated`; INSERT por carpeta `{uid}/`.

---

## 5) Rutas (App Router) — mapa mental

### Público
- `/carta` — carta QR (i18n ES/CA/EN, secciones desde BD)
- `/eventos/[slug]` — pedido encargo (UI carta + RPC `create_event_order`)

### Master (solo Hector)
- `/master/dashboard` — hub 3 pantallas + accesos rápidos (`MasterShortcutGrid`)

### Manager / gestión (`/dashboard/*`)
- `/dashboard` — hub
- Sala: `/dashboard/sala`
- KDS: `/dashboard/kds`
- Ventas: `/dashboard/ventas`
- Finanzas: `/dashboard/finanzas` (PyG + caja, RPC `get_financial_statement`)
- Insights: `/dashboard/insights` (manager/admin; KPIs periodo + gráficos rentabilidad)
- Eventos: `/dashboard/eventos`, pedidos `/dashboard/eventos/[eventId]/pedidos`
- Tesorería: `/dashboard/movements`
- Cierres: `/dashboard/history`
- Ledger: `/dashboard/ledger`
- Mano de obra: `/dashboard/labor`
- Horas extra: `/dashboard/overtime`
- Propinas: `/dashboard/propinas`
- Albaranes histórico: `/dashboard/albaranes`
- Escáner albaranes (única entrada): `/dashboard/scanner`
- Albaranes precios (legacy foto): `/dashboard/albaranes-precios`
- Inventario: `/dashboard/inventory`, mermas `/dashboard/inventory/waste`, auditoría `/dashboard/inventory/ledger`
- Consumo personal: `/dashboard/consumo-personal`
- Imports: `/dashboard/import`, `/dashboard/recetas-import`
- Mapeo TPV↔receta: `/dashboard/recetas-tpv`
- Carta (gestión): `/dashboard/carta`

### Operativa general
- Recetas: `/recipes`, `/recipes/[id]`, `/recipes/import`
- Ingredientes: `/ingredients`
- Proveedores: `/suppliers`
- Pedidos: `/orders/new`
- Perfil: `/profile`
- Registros: `/registros`
- Admin legacy: `/admin/import`, `/admin/mapeo`

### Staff (`/staff/*`)
- `/staff/dashboard` — hub unificado (`StaffDashboardView` / `DashboardSwitcher`)
- `/staff/history`
- `/staff/carta` — editor inline carta (toggle Editar, reorden, i18n categorías)
- `/staff/reservas` — gestión reservas del día (RPC + Realtime `public:reservations`)
- `/staff/propinas` — mis propinas (`get_tip_pool_preview`); manager/admin pueden ver vista staff desde modal Caja

---

## 6) API Routes (exactas)

### Webhooks BDP (TPV bridge)
- `POST /api/webhooks/bdp/ventas` — tickets cobrados → `tickets_marbella` / líneas (+ `cobro_efectivo|tarjeta|pendiente`)
- `POST /api/webhooks/bdp/telemetria` — radiografía sala → `estado_sala` (Radar/KDS)
- `POST /api/webhooks/bdp/caja` — movimientos caja BDP (ej. concepto 107 cobros deuda) → `bdp_cash_movements`

### Webhooks documentos
- `POST /api/webhooks/albaranes` — **410 Gone** (retirado; usar `/dashboard/scanner`)
- `POST /api/webhooks/nominas` — PDF nómina individual (Bearer `WEBHOOK_SECRET`, service role)
- `POST /api/webhooks/nominas-summary` — PDF resumen coste empresa → `payroll_monthly_totals`

### Cron
- `GET /api/cron/cleanup-order-pdfs` — Bearer `CRON_SECRET`; borra PDFs >7d bucket `orders`
- `GET /api/cron/cleanup-audio` — limpieza audio copiloto

### Copiloto (IA)
- `POST /api/copiloto` — chat
- `POST /api/copiloto/tools` — tool calling
- `POST /api/copiloto/transcribe` — transcripción
- `GET /api/copiloto/voice/token` — token LiveKit

### Eventos
- `GET /api/eventos/[eventId]/export` — CSV pedidos (auth manager/admin)

### Serving seguro (documentos)
- `GET /api/nominas/open?owner=&path=`
- `GET /api/employee-documents/open?owner=&path=&tipo=`
- `POST /api/employee-documents/dni`
- `POST /api/profile/avatar`

---

## 7) DB (esquema confirmado) — tablas y RPCs útiles

**Fuente**: `supabase/migrations/` (prioridad sobre `schema_dump.sql` si divergen).

### Tablas (principales)
- IA: `ai_call_logs`, `ai_chat_sessions`, `ai_chat_messages`
- Tesorería: `cash_boxes`, `cash_box_inventory`, `treasury_log`, `cash_closings`, `denominations_log`, `weekly_closings_log`
- Finanzas fijas: `fixed_monthly_costs`, `payroll_monthly_totals`
- Personal: `profiles`, `time_logs`, `weekly_snapshots`, `shifts`
- Ventas: `tickets_marbella` (+ `cobro_efectivo`, `cobro_tarjeta`, `cobro_pendiente`), `ticket_lines_marbella`, `ventas_marbella`
- Tesorería TPV staging: `bdp_cash_movements` (dedup por fecha+concepto+importe; no escribe `treasury_log`)
- Reservas: `reservations` (`status`: pending|confirmed|cancelled|rejected)
- Sala/KDS: `estado_sala`, `kds_orders`, `kds_order_lines`
- Recetas: `recipes` (+ `menu_category_id`, `elaboration_video_url`), `recipe_ingredients`, `ingredients` (+ `price_locked`, `inventory_visible`, pack fields), `ingredient_price_history`, `categories`, `menu_category_overrides`
- Carta: `digital_menu_overrides` (+ `plato_marbella_slot`, `plato_marbella_is_menu_price`), vistas `v_digital_menu_items`, `v_public_menu_items`
- Propinas: `tip_distribution_history`, `tip_distribution_lines`
- Eventos: `events`, `event_products`, `event_default_pack`, `event_orders`
- Consumo personal UI: `staff_consumption_recipe_display_order`
- Proveedores/albaranes: `suppliers`, `purchase_invoices`, `purchase_invoice_lines` (+ `line_unit` texto OCR; `status`: `pending_mapping`|`mapped`|`excluded`|`expense_only`), `purchase_invoice_attachments`, `supplier_item_mappings` (+ `line_billing_unit`, `line_content_qty`, `line_content_unit`)
- Stock: `stock_movements` (+ `reference_doc` tipo `ALB-LINE-<uuid>`)
- Pedidos: `purchase_orders`, `purchase_order_items`, `order_drafts`
- Documentos: `nominas`, `nominas_excepciones`, `employee_documents`
- TPV catálogo: `bdp_articulos`, `bdp_departamentos`, `bdp_familias`, `map_tpv_receta`

### RPCs / funciones (nombres exactos, selección)
- Ventas: `get_daily_sales_stats`, `get_hourly_sales`, `get_ticket_lines`, `get_product_sales_ranking`
- Finanzas: `get_financial_statement(p_start_date, p_end_date) -> jsonb`
- Insights: `get_period_card_payments(p_start, p_end)`, `get_hourly_sales_vs_labor`, `get_weekday_ticket_analysis`, `get_product_margin_ranking`
- Tesorería: `get_operational_box_status`, `get_treasury_period_summary`, `get_theoretical_balance`, `get_closing_sales_breakdown(p_date)`
- Eventos: `create_event_order(p_slug, p_responsible_name, p_items, p_notes)` — `SECURITY DEFINER`, anon OK
- Propinas: `get_tip_pool_preview`, `confirm_tip_distribution`
- Reservas: `consultar_reservas(p_fecha)`, `gestionar_reservas(p_accion, p_datos)` — acciones `confirm|reject|cancel`
- Recetas: `get_recipe_cost`, `convert_pricing_qty`
- Albaranes precio: `invoice_line_price_to_purchase_unit(p_unit_price, p_mapping_content_qty, p_mapping_content_unit, p_ingredient_purchase_unit, p_fallback_factor)`
- Personal: `get_monthly_timesheet`, `get_worker_weekly_log_grid`, `get_weekly_worker_stats` (+ `p_only_completed_weeks`), `rpc_recalculate_all_balances`, `fn_recalc_and_propagate_snapshots`, `fn_labor_effective_ordinary_rate`, `fn_worker_effective_overtime_rate`
- Consumo modal: `get_consumption_modal_recipes`, `save_staff_consumption_recipe_display_order`
- Cierres: `get_cash_closings_summary`
- Albaranes/stock: `delete_stock_movements_for_purchase_invoice`, `delete_stock_movements_for_albaran_line`, `sync_purchase_invoice_status`
- Consumo: `process_staff_consumption`
- RBAC helpers: `get_employee_role`, `get_my_employee_id`, `is_manager_or_admin()`

### Triggers albaranes (operativa crítica)
- `handle_new_invoice_line` — auto-mapeo + precio vía `invoice_line_price_to_purchase_unit` (respeta `price_locked`; en `per_pack` solo `pack_price`; **falla en voz alta** si no hay tríada/factor válido)
- `handle_invoice_line_mapped_stock` — `PURCHASE` al pasar línea a `status='mapped'`
- `sync_purchase_invoice_status` — cabecera `mapped` cuando todas las líneas resueltas (`mapped`|`excluded`|`expense_only`) + stock `ALB-LINE-*`
- Adjuntos multipágina: `purchase_invoice_attachments` (misma cabecera, varias hojas)

### Migración remota (conversión estricta)
- **Aplicada en prod** (Dashboard Supabase): versión `20260515141008`, nombre `albaranes_strict_unit_conversion` (2026-05-15).
- **Archivo local repo**: `supabase/migrations/20260515160700_albaranes_strict_unit_conversion.sql` (mismo contenido; prefijo distinto — no re-aplicar si ya existe la versión remota).

---

## 8) KDS / Radar / Puente BDP — fuente de verdad

- Documentación: `context/ARQUITECTURA_SYNC_KDS.md`
- Bridge Node: `context/index.txt` → POST telemetría/ventas/caja al dominio ERP (poll ventas + caja 12s; `VENTAS_WHERE` incluye pendientes sin `Hora_Cierre`)
- Gateway Linux: `context/server.txt` — upsert ventas, normalización UTC, `diaNegocio` Madrid
- Despliegue TPV: copiar `index.txt` → `AgenteBDP/index.js`, `pm2 restart PuenteBDP`; gateway: reiniciar receptor tras `server.txt`
- Migraciones KDS: prefijos `20260408*`, `20260417*`, `20260418*`, `20260420*`, `20260511130000*` (packs en historial)
- Tesorería BDP: `20260526150000_refactor_tesoreria_bdp.sql`
- Cliente sala: `parseRadiografiaTimestamp`, keys estables `mesa-{mesa}-{ticket}`

---

## 9) Variables de entorno (mínimo para un LLM)

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Webhooks**: `WEBHOOK_SECRET`
- **IA documentos**: `GEMINI_API_KEY`
- **Copiloto**: `OPENAI_API_KEY` (+ vars LiveKit si voz)
- **Cron**: `CRON_SECRET`
- **Carta iframe (opcional)**: `NEXT_PUBLIC_MARBELLA_WEB_ORIGIN` — `postMessage` navegación embebida

---

## 10) Prompt corto recomendado (inicio de sesión)

> Proyecto Bar La Marbella: Next.js 16 App Router + React 19 + TS + Tailwind, Supabase (Auth + RLS + Realtime + Storage) con SSR @supabase/ssr. Dominios: sala/radar, KDS, tesorería (get_closing_sales_breakdown + bdp_cash_movements), finanzas/insights (/dashboard/insights, get_financial_statement + get_period_card_payments), personal/horas (AcumulaHoras; fichajes especiales clock_in/out), propinas (/dashboard/propinas + /staff/propinas), recetas/escandallo, carta QR (/carta, Plato Marbella), reservas (/staff/reservas), eventos (/eventos/[slug], /dashboard/eventos), albaranes (/dashboard/scanner + LineMappingModal; líneas excluded/expense_only; sync_purchase_invoice_status), pedidos, inventario/mermas, hub master /master/dashboard (Hector). BDP: context/index.txt + server.txt (UTC ingesta, Madrid display). Reglas: RPCs SQL, RLS, anti-silent-fail, zero-display (0→" "), fechas sin new Date('YYYY-MM-DD'), proxy getSession() no getUser(). Esquema: supabase/migrations + PROJECT_STATUS.md (§11 auto-sync). Precios: context/INGREDIENTS_PRECIOS_Y_ALBARANES.md.

---

## 11) Estado actual (snapshot operativo)

<!-- sync:project-status:start — NO EDITAR A MANO; generado por `scripts/sync-llm-prompt-from-project-status.mjs` -->

**Fuente**: `PROJECT_STATUS.md` — **última actualización:** 2026-06-04 (Insights: cobros tarjeta periodo híbrido)

Hitos recientes (mismo orden que el changelog superior de `PROJECT_STATUS.md`; máx. 45 entradas):

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
- **Reservas: tabla + RLS + RPC + UI staff realtime (2026-05-27)**: Migración [`20260527140600_create_reservations_module.sql`](supabase/migrations/20260527140600_create_reservations_module.sql) — tabla `public.reservations` (INSERT `anon`/`authenticated`, SELECT/UPDATE `authenticated`) + RPC `consultar_reservas(p_fecha)` (array JSONB por día) y `gestionar_reservas(p_accion,p_datos)` (status `confirm|reject|cancel`). UI sala: nueva ruta [`/staff/reservas`](src/app/staff/reservas/page.tsx) + [`ReservasClient.tsx`](src/app/staff/reservas/ReservasClient.tsx) (Touch-first, Bento, Zero-display en notas, botones min-h-12, anti-silent failures con `toast.error`, realtime `channel('public:reservations')` INSERT→toast+refetch). Enlaces desde [`StaffDashboardView.tsx`](src/components/dashboards/StaffDashboardView.tsx) y [`/staff`](src/app/staff/page.tsx).
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
- **Carta QR/staff: home compacta + subcategorías con imagen + bebidas (2026-05-15)**: Home `/carta` y `/staff/carta` — fondo blanco, sin `border-b` visible, grid categorías más compacto (`overflow-hidden`, `CartaLangPicker` compact). **Subcategorías**: portada en hijos vía `categories.cover_articulo_id` o **`categories.cover_photo_url`** + [`CartaSubcategoryPickerButton.tsx`](src/components/carta/CartaSubcategoryPickerButton.tsx); [`setMenuCategoryCover`](src/app/dashboard/carta/actions.ts) / legacy `setMenuSectionCoverArticulo`; [`resolveMenuCategoryCoverById`](src/lib/carta-category-covers.ts). **Bebidas**: migración [`20260515150000_public_carta_bebidas_photos.sql`](supabase/migrations/20260515150000_public_carta_bebidas_photos.sql) (`photo_url` en QR); marco/imagen más pequeños solo en `Bebidas` ([`carta-product-photo.ts`](src/lib/carta-product-photo.ts)); más aire nombre/precio.
- **Movements `/dashboard/movements`: SALDO ACTUAL = saldo libro (2026-05-16)**: El KPI **SALDO ACTUAL** mostraba efectivo físico (`physical_balance`) y la columna **SALDO** el `running_balance` del libro — de ahí el descuadre visible (+13,75 € = **DIFER. ACTUAL**). **BD**: [`20260516120000_treasury_running_balance_per_box.sql`](supabase/migrations/20260516120000_treasury_running_balance_per_box.sql) — `v_treasury_movements_balance` con `PARTITION BY box_id`. **App**: [`movements/page.tsx`](src/app/dashboard/movements/page.tsx) — SALDO ACTUAL = último `running_balance` de la caja operativa; DIFER. = físico − libro; [`get-dashboard-data.ts`](src/app/actions/get-dashboard-data.ts) filtra ledger por `box_id` operativa. Dashboard admin **Caja Inicial** sigue mostrando dinero físico.
- **TPV ventas: artefactos despliegue (2026-05-16)**: `context/DEPLOY_BDP_VENTAS.txt` (pasos TPV + gateway), `context/backfill_ventas_fecha_hoy.sql` (solo si KPIs siguen en ayer), `context/verify_ventas_hoy.sql` (conteos dashboard). Código fuente: `context/index.txt`, `context/server.txt`.
- **TPV ventas: fix poll 0 cobros (2026-05-16)**: En producción el poll `Hora_Cierre 3h` devolvía **0 filas** (`Memoria inicial: 16`); ventas paradas desde ~14:42. **`context/index.txt`**: poll vuelve a `VENTAS_WHERE` (Fecha_Sistema); eliminada memoria semilla 24h; diagnóstico SQL al arranque (`GETDATE`, counts). Tras copiar a `AgenteBDP/index.js`: una vez `BDP_RUN_CATCHUP=1` para hueco, luego poll normal.
- **TPV ventas: poll por Hora_Cierre + memoria semilla (2026-05-16)**: Cobros nuevos no entraban tras reinicio: el poll usaba solo `Fecha_Sistema` (NULL en algunos tickets) y/o rellenaba memoria con `TOP 50` sin enviar. **`context/index.txt`**: `POLL_VIVO_WHERE` por `Hora_Cierre` últimas 3h; `seedMemoriaTicketsRecientes` (24h sin reenvío) si no hay catch-up; heartbeat `⏱ Poll`; `BDP_GATEWAY_URL` para LAN (`192.168.1.205:3000`).

<!-- sync:project-status:end -->

