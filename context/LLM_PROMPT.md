# Bar La Marbella — Contexto para LLM (prompt-ready)

Este documento está diseñado para **copiar/pegar** como contexto en un LLM cuando se vaya a trabajar en este repositorio.

---

## 0) Mantenimiento (OBLIGATORIO)

Este archivo (`context/LLM_PROMPT.md`) es un **artefacto “prompt-ready”**. Debe estar **siempre** actualizado y listo para copiar/pegar.

- **Regla**: tras **cualquier cambio** relevante en el repo (código, migraciones, rutas, permisos, env vars, reglas duras), **revisar y actualizar** este documento si aplica.
- **Fuente de verdad**:
  - Estado funcional y roadmap: `PROJECT_STATUS.md`
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

- **Sala (Radar en vivo)**: estado de mesas/tickets en tiempo real (`estado_sala`, telemetría BDP).
- **KDS (Cocina)**: comandas y líneas desde `estado_sala` → `kds_orders` / `kds_order_lines`.
- **Tesorería / Caja**: movimientos, arqueos, cierres, diferencia físico vs teórico.
- **Finanzas**: PyG (devengo) vs cash flow (caja) vía RPC consolidada.
- **Personal**: asistencia, fichajes, horarios, horas extra, snapshots semanales (`AcumulaHoras`).
- **Propinas**: pools y reparto calculado en SQL.
- **Recetas / escandallo**: recetas, ingredientes, conversiones, coste (`get_recipe_cost`).
- **Carta digital**: QR público `/carta`, edición staff `/staff/carta`, Plato Marbella en 3 tramos.
- **Proveedores / albaranes**: escáner in-app (Gemini, incl. `unidad_medida` por línea) + mapeo proveedor→ingrediente con **tríada dimensional** (ud. facturación × cant./ud. contenido) + precio vía RPC `invoice_line_price_to_purchase_unit` + stock automático al mapear.
- **Pedidos**: pedidos a proveedores, PDFs y limpieza automática por cron.
- **Inventario / mermas / consumo personal**: recuento, ledger, waste, RPC `process_staff_consumption`.
- **IA integrada**: Copiloto (chat + voz LiveKit) con RBAC y registro de llamadas.

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
- **Público sin login**: `/carta`, `/carta/*`.
- Sin sesión → `/login` (salvo `/auth`, recovery en `/profile` con query tokens).
- **Staff/supervisor** en `/dashboard/*`: solo permitido:
  - `/dashboard/propinas`
  - `/dashboard/kds`
  - `/dashboard/albaranes`
  - `/dashboard/scanner`
  - Resto de `/dashboard/*` → redirect `/staff/dashboard`
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

### Manager / gestión (`/dashboard/*`)
- `/dashboard` — hub
- Sala: `/dashboard/sala`
- KDS: `/dashboard/kds`
- Ventas: `/dashboard/ventas`
- Finanzas: `/dashboard/finanzas` (PyG + caja, RPC `get_financial_statement`)
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
- `/staff/dashboard`
- `/staff/history`
- `/staff/carta` — editor inline carta (toggle Editar, reorden, i18n categorías)
- `/staff` — redirect hub

---

## 6) API Routes (exactas)

### Webhooks BDP (TPV bridge)
- `POST /api/webhooks/bdp/ventas` — tickets cobrados → `tickets_marbella` / líneas
- `POST /api/webhooks/bdp/telemetria` — radiografía sala → `estado_sala` (Radar/KDS)

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
- Ventas: `tickets_marbella`, `ticket_lines_marbella`, `ventas_marbella`
- Sala/KDS: `estado_sala`, `kds_orders`, `kds_order_lines`
- Recetas: `recipes` (+ `menu_category_id`, `elaboration_video_url`), `recipe_ingredients`, `ingredients` (+ `price_locked`, `inventory_visible`, pack fields), `ingredient_price_history`, `categories`, `menu_category_overrides`
- Carta: `digital_menu_overrides` (+ `plato_marbella_slot`, `plato_marbella_is_menu_price`), vistas `v_digital_menu_items`, `v_public_menu_items`
- Proveedores/albaranes: `suppliers`, `purchase_invoices`, `purchase_invoice_lines` (+ `line_unit` texto OCR), `purchase_invoice_attachments`, `supplier_item_mappings` (+ `line_billing_unit`, `line_content_qty`, `line_content_unit`)
- Stock: `stock_movements` (+ `reference_doc` tipo `ALB-LINE-<uuid>`)
- Pedidos: `purchase_orders`, `purchase_order_items`, `order_drafts`
- Documentos: `nominas`, `nominas_excepciones`, `employee_documents`
- TPV catálogo: `bdp_articulos`, `bdp_departamentos`, `bdp_familias`, `map_tpv_receta`

### RPCs / funciones (nombres exactos, selección)
- Ventas: `get_daily_sales_stats`, `get_hourly_sales`, `get_ticket_lines`, `get_product_sales_ranking`
- Finanzas: `get_financial_statement(p_start_date, p_end_date) -> jsonb`
- Tesorería: `get_operational_box_status`, `get_treasury_period_summary`, `get_theoretical_balance`
- Recetas: `get_recipe_cost`, `convert_pricing_qty`
- Albaranes precio: `invoice_line_price_to_purchase_unit(p_unit_price, p_mapping_content_qty, p_mapping_content_unit, p_ingredient_purchase_unit, p_fallback_factor)`
- Personal: `get_monthly_timesheet`, `get_worker_weekly_log_grid`, `get_weekly_worker_stats` (+ `p_only_completed_weeks`), `rpc_recalculate_all_balances`, `fn_recalc_and_propagate_snapshots`
- Cierres: `get_cash_closings_summary`
- Albaranes/stock: `delete_stock_movements_for_purchase_invoice`, `delete_stock_movements_for_albaran_line`
- Consumo: `process_staff_consumption`
- RBAC helpers: `get_employee_role`, `get_my_employee_id`, `is_manager_or_admin()`

### Triggers albaranes (operativa crítica)
- `handle_new_invoice_line` — auto-mapeo + precio vía `invoice_line_price_to_purchase_unit` (respeta `price_locked`; **falla en voz alta** si no hay tríada/factor válido)
- `handle_invoice_line_mapped_stock` — `PURCHASE` al pasar línea a `status='mapped'`
- Adjuntos multipágina: `purchase_invoice_attachments` (misma cabecera, varias hojas)

### Migración remota (conversión estricta)
- **Aplicada en prod** (Dashboard Supabase): versión `20260515141008`, nombre `albaranes_strict_unit_conversion` (2026-05-15).
- **Archivo local repo**: `supabase/migrations/20260515160700_albaranes_strict_unit_conversion.sql` (mismo contenido; prefijo distinto — no re-aplicar si ya existe la versión remota).

---

## 8) KDS / Radar — fuente de verdad

- Documentación: `context/ARQUITECTURA_SYNC_KDS.md`
- Bridge Node: `context/index.txt` → POST telemetría/ventas al dominio ERP
- Migraciones KDS: prefijos `20260408*`, `20260417*`, `20260418*`, `20260420*`, `20260511130000*` (packs en historial)
- Cliente sala: `parseRadiografiaTimestamp`, keys estables `mesa-{mesa}-{ticket}`

---

## 9) Variables de entorno (mínimo para un LLM)

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Webhooks**: `WEBHOOK_SECRET`
- **IA documentos**: `GEMINI_API_KEY`
- **Copiloto**: `OPENAI_API_KEY` (+ vars LiveKit si voz)
- **Cron**: `CRON_SECRET`

---

## 10) Prompt corto recomendado (inicio de sesión)

> Proyecto Bar La Marbella: Next.js 16 App Router + React 19 + TS + Tailwind, Supabase (Auth + RLS + Realtime + Storage) con SSR @supabase/ssr. Dominios: sala/radar, KDS, tesorería, finanzas (RPC get_financial_statement), personal/horas (AcumulaHoras), propinas, recetas/escandallo, carta QR (/carta, Plato Marbella 3 tramos), albaranes vía /dashboard/scanner + histórico /dashboard/albaranes con LineMappingModal (tríada dimensional + RPC invoice_line_price_to_purchase_unit; webhook email 410), pedidos, inventario/mermas. Reglas: frontend tonto (agregaciones en SQL RPCs), RLS estricto, anti-silent-fail, zero-display (0→" "), fechas sin new Date('YYYY-MM-DD'), proxy con getSession() no getUser(). No inventes columnas; usa supabase/migrations y PROJECT_STATUS.md. Precios ingredientes: context/INGREDIENTS_PRECIOS_Y_ALBARANES.md.

---

## 11) Estado actual (snapshot operativo)

**Fuente**: `PROJECT_STATUS.md` — **última actualización prompt: 2026-05-26** (ver `PROJECT_STATUS.md` para entradas hasta 2026-05-26).

Hitos recientes (evitar drift al copiar este prompt):

- **Carta (2026-05-15)**: subcategoría `platos-marbella` — vista `PlatoMarbellaMenuView` (entrante / principal / guarnición); `digital_menu_overrides.plato_marbella_slot`, `plato_marbella_is_menu_price`; editor en `MenuItemEditModal`.
- **Albaranes: conversión dimensional estricta (2026-05-15)**:
  - **BD aplicada** en remoto: `20260515141008` / `albaranes_strict_unit_conversion` (columnas `line_unit`, tríada en `supplier_item_mappings`, RPC `invoice_line_price_to_purchase_unit`, trigger `handle_new_invoice_line` reforzado).
  - **Escáner**: Gemini devuelve `unidad_medida`; insert con `line_unit` ([`scanner/actions.ts`](src/app/dashboard/scanner/actions.ts)).
  - **UI mapeo**: [`LineMappingModal.tsx`](src/components/albaranes/LineMappingModal.tsx) — modal Bento (match + ecuación garrafa × 5 l); integrado en histórico; **retirado** panel inline en fila.
  - **Server**: mapeo dimensional en `confirmInvoiceLineMappingAction` / `updateMappedLineConversionFactorAction`; resync precio vía RPC, no `unit_price/factor` en TS.
- **Albaranes (2026-05-11 → 2026-05-17)**:
  - Entrada única: `/dashboard/scanner` con proveedor obligatorio; webhook `/api/webhooks/albaranes` = **410 Gone**.
  - Multipágina: `purchase_invoice_attachments`.
  - Acceso amplio `authenticated`; delete albarán solo manager/admin.
  - RPCs `delete_stock_movements_for_purchase_invoice` / `_albaran_line` (migración repo `20260517140000` — confirmar en Dashboard si no aparece en lista reciente).
  - Stock automático al mapear; `price_locked` bloquea actualización de precio desde albarán.
- **Albaranes: “portes / ajuste / sin cargo” (2026-05-24)**: líneas con `purchase_invoice_lines.status='excluded'` para conceptos que no van a almacén; cuentan como resueltas sin `mapped_ingredient_id` ni `PURCHASE`.
- **Cierres de caja: fotos obligatorias datáfonos + ticket BDP (2026-05-24)**: obligatorias en paso 1 (`dataphone_totals_photo_path`, `bdp_closing_ticket_photo_path`) y se muestran en historial con URLs firmadas.
- **Cierre de caja: rediseño paso 1 (Datos) (2026-05-25)**: UI/flujo del paso 1 reestructurado (clima por iconos, botones de fotos “Añadir informe/totales”, sin refresh manual; sync TPV automático).
- **Horas: cron recálculo global semanal + DST Madrid (2026-05-25)**: dos jobs `pg_cron` con guardas CET/CEST (invierno/verano) para recalcular balances semanales sin drift de horario.
- **Consumo personal (staff y dashboard): quantity visible + RPC actualizada (2026-05-26)**:
  - UI staff: en el carrito se ve cantidad (`−` / `×N` / `+`) y badges `×N` en grid ([`ConsumptionModal.tsx`](src/app/staff/ConsumptionModal.tsx)).
  - Dashboard: el desglose por día muestra `Nombre ×4 — 1,44 €` ([`/dashboard/consumo-personal/page.tsx`](src/app/dashboard/consumo-personal/page.tsx)).
  - DB: `get_staff_consumption_day_detail` devuelve `quantity` (agregación por `reference_doc`) en migración `20260526120000_staff_consumption_day_detail_quantity.sql` (pendiente desplegar si no está aplicada).
- **Proxy/auth (2026-05-13)**: `src/proxy.ts` con `getSession()`; staff puede `/dashboard/albaranes` y `/dashboard/scanner`; timeouts SSR en layout/albaranes.
- **Mapeo TPV (2026-05-14)**: `/dashboard/recetas-tpv` — factor TPV + mappings albarán por ingrediente.
- **Recetas (2026-05-14)**: `recipes.menu_category_id` alineado al menú BD; coste escandallo con puente pack (`get_recipe_cost`).
- **Finanzas (2026-04-24+)**: `/dashboard/finanzas` + nóminas resumen y alquiler en RPC.
- **Sala (2026-05-13)**: hora mesa alineada al contrato `context/index.txt` (`aperturaMs`, `hora` por producto).
- **Horas extras**: solo semanas cerradas en listados y RPC con `p_only_completed_weeks`.

