# MAPEO DE REALIDAD — Bar La Marbella
## Análisis Crítico Codebase Next.js ↔ Esquema Supabase

**Fecha:** 2026-03-09  
**Auditor:** Análisis basado exclusivamente en evidencia de código y esquema indexado.

---

## 1. MAPA DE CONEXIÓN (Qué hay y con qué tabla se habla)

### 1.1 Módulos Funcionales y Tablas Asociadas

| Módulo / Ruta | Tablas Supabase | RPCs | Observaciones |
|---------------|-----------------|------|---------------|
| `/dashboard` (Admin) | `tickets_marbella`, `cash_closings`, `cash_boxes`, `profiles`, `treasury_log`, `cash_box_inventory` | `get_hourly_sales`, `get_daily_sales_stats`, `get_daily_labor_cost`, `get_weekly_worker_stats`, `get_ticket_lines`, `create_worker_profile` | OK |
| `/dashboard/movements` | `v_treasury_movements_balance`, `treasury_log`, `cash_box_inventory`, `cash_boxes` | `get_operational_box_status`, `get_treasury_period_summary` | OK |
| `/dashboard/history` | — | `get_cash_closings_summary`, `get_hourly_sales` | OK |
| `/dashboard/ventas` | `tickets_marbella` | `get_product_sales_ranking`, `get_ticket_lines` | OK |
| `/dashboard/overtime` | `weekly_snapshots` | `get_weekly_worker_stats`, `fn_recalc_and_propagate_snapshots` | OK |
| `/dashboard/ledger` | `manager_ledger`, `profiles` | `get_manager_ledger_balance` | ⚠️ Ver Inconsistencias |
| `/dashboard/labor` | `cash_closings`, `time_logs`, `profiles` | — | OK |
| `/staff/dashboard` | `profiles`, `time_logs`, `shifts`, `cash_boxes`, `tickets_marbella`, `cash_box_inventory`, `treasury_log` | `get_worker_weekly_log_grid` | OK |
| `/staff/history` | `profiles`, `time_logs` | `get_monthly_timesheet`, `get_weekly_worker_stats`, `get_worker_weekly_log_grid` | OK |
| `/registros` | `time_logs`, `shifts`, `profiles` | `get_worker_weekly_log_grid`, `get_weekly_worker_stats`, `fn_recalc_and_propagate_snapshots` | OK |
| `/profile` | `profiles`, `employee_documents` | — | OK |
| `/ingredients` | `ingredients`, `suppliers` | — | OK |
| `/recipes` | `recipes`, `recipe_ingredients`, `ingredients` | — | OK |
| `/orders/new` | `ingredients`, `suppliers`, `order_drafts`, `purchase_orders`, `purchase_order_items` | — | OK |
| `/admin/mapeo` | `bdp_articulos`, `map_tpv_receta`, `recipes` | — | OK |
| `/suppliers` | `suppliers` | — | OK |
| **Server Actions** | | | |
| `recalculate.ts` | — | `rpc_recalculate_all_balances` | OK |
| `overtime.ts` | `weekly_snapshots`, `time_logs` | `get_weekly_worker_stats`, `fn_recalc_and_propagate_snapshots` | OK |
| `profile.ts` | `profiles`, `employee_documents` | — | ⚠️ Storage: `employee-documents` (bucket) vs `employee_documents` (tabla) |
| `get-dashboard-data.ts` | `tickets_marbella`, `cash_closings`, `cash_boxes`, `profiles`, `treasury_log` | `get_hourly_sales`, `get_daily_sales_stats`, `get_daily_labor_cost`, `get_weekly_worker_stats` | OK |
| **API Routes** | | | |
| `/api/ventas` | `tickets_marbella`, `ticket_lines_marbella` | — | OK |
| `/api/chat` | `profiles`, `cash_closings`, `weekly_snapshots`, `recipes`, `recipe_ingredients`, `ai_chat_messages` | — | OK (usa `closing_date`, `extra_hours`, etc.) |
| ~~`/api/ai-tools-executor`~~ | — | — | **ELIMINADO** (código legacy borrado 2026-03-19) |
| `/api/webhooks/nominas` | `profiles`, `nominas`, `employee_documents` | — | OK |
| `/api/webhooks/albaranes` | Storage `albaranes`, `suppliers`, `purchase_invoices`, `purchase_invoice_lines` | — | OK |
| **Albaranes (lib/actions)** | `supplier_item_mappings`, `purchase_invoice_lines` | — | OK |

### 1.2 Tablas sin Lógica Asociada (Huérfanas)

- **`supplier_item_mappings`**: Solo usada en `albaranes.ts` (confirmar mapeo) y `AdminProductModal` (fetch albaranes). El webhook escribe en `purchase_invoices`/`purchase_invoice_lines`; el mapeo se hace después.
- **`purchase_invoices`**, **`purchase_invoice_lines`**: Usadas por webhook y `AdminProductModal`. Sin vista dedicada de gestión de facturas.
- **`nominas`**: Solo referenciada en webhook de nóminas. Sin CRUD explícito en UI.

### 1.3 Tablas Legacy / No Migradas

- **`time_entries`**: Referenciada en `ai-tools-executor` pero **no existe**. El esquema usa `time_logs` con `clock_in`, `clock_out`, `total_hours`.

---

## 2. INCONSISTENCIAS DETECTADAS

### 🔴 CRÍTICAS

#### 2.1 `/api/ai-tools-executor` — Esquema Incorrecto

| Problema | Código Actual | Esquema Real |
|----------|---------------|--------------|
| Tabla inexistente | `time_entries` | `time_logs` |
| Columnas inexistentes | `check_in`, `check_out` | `clock_in`, `clock_out` |
| Columna inexistente en `weekly_snapshots` | `earned_hours` | `total_hours`, `extra_hours`, `balance_hours`, `final_balance` (no existe `earned_hours`) |
| Columna inexistente en `cash_closings` | `date` | `closing_date` |

**Impacto:** Las herramientas `get_attendance_logs`, `get_staff_work_info` y `get_dashboard` fallarán o devolverán datos incorrectos si se invocan desde este endpoint.  
**Nota:** El endpoint no está referenciado en el codebase; podría ser código muerto o usado por integración externa (p. ej. voz).

#### 2.2 `ManagerLedgerView` — Columna `full_name` en `profiles`

```tsx
.select(`id, movement_type, amount, concept, date, created_by, profiles(full_name)`)
```

La tabla `profiles` tiene `first_name` y `last_name`, **no** `full_name`. La consulta fallará o devolverá `null` para el nombre.

**Corrección sugerida:** `profiles(first_name, last_name)` y concatenar en el cliente, o crear una vista/columna generada `full_name` en la BD.

#### 2.3 RLS de `manager_ledger` — JWT sin claim `role`

Las políticas usan `(auth.jwt() ->> 'role')::text = 'manager'`. El JWT de Supabase Auth no incluye por defecto el rol de `profiles`. Si el rol no se inyecta en `app_metadata` o en un custom claim, **ningún usuario pasará las políticas** y el ledger quedará inaccesible.

**Verificación necesaria:** Comprobar si existe trigger/función que añada `role` al JWT al hacer login.

### ⚠️ MEDIAS

#### 2.4 Storage vs Tabla: `employee-documents` vs `employee_documents`

En `profile.ts` línea 106:
```ts
.from('employee-documents')  // Bucket de Storage
```
La tabla es `employee_documents`. El bucket puede llamarse distinto; es coherente si el bucket se llama `employee-documents`. Solo hay que confirmar que el bucket existe con ese nombre.

#### 2.5 Tipos UUID vs BIGINT en Tesorería

La migración `20260317_fix_treasury_uuid.sql` unifica `cash_boxes.id` como UUID. El código de movements usa `boxData.id` (UUID) correctamente. Las RPCs `get_operational_box_status` y `get_treasury_period_summary` ya devuelven/aceptan UUID. **Estado:** Resuelto.

#### 2.6 `supplier_id` en `albaranes.ts` — Conversión a BIGINT

```ts
supplier_id: parseInt(supplierId),
```

El esquema define `suppliers.id` como BIGINT. `parseInt` es adecuado. Hay que asegurar que `supplierId` no sea `null` o vacío para evitar `NaN`.

### 🟡 MENORES

#### 2.7 Duplicación de rutas con barras invertidas

Hay referencias duplicadas con `src\app\...` y `src/app/...` en resultados de búsqueda. Probablemente solo diferencias de path en Windows; no afecta a la ejecución.

---

## 3. DIAGNÓSTICO DE VIABILIDAD

### 3.1 ¿Es el sistema lo suficientemente robusto para escalar?

**Evaluación:** **Sí, con correcciones puntuales.**

#### Fortalezas

1. **Delegación SQL:** La lógica pesada está en PostgreSQL (`get_worker_weekly_log_grid`, `get_weekly_worker_stats`, `fn_recalc_and_propagate_snapshots`, `get_treasury_period_summary`, `get_cash_closings_summary`). Se evita la “falsa agregación” en cliente.
2. **Paginación real:** `/dashboard/movements` usa `.range()` sobre la vista, no descarga masiva.
3. **Transaccionalidad:** `recalculateAllBalances` y `fn_recalc_and_propagate_snapshots` centralizan el recálculo en la BD.
4. **Evitación de `.not('column', 'in', [])`:** Corregido en movements (PROJECT_STATUS).
5. **Timezone:** Uso de `parseLocalSafe` y construcción de fechas con `new Date(y, m-1, d)` para evitar desfases.

#### Puntos frágiles

1. **`updateWeeklyWorkerConfig` — Bucle de mutaciones:** Procesa logs uno a uno con `for` + `supabase.from('time_logs').update/insert`. Con muchas ediciones en una semana, puede ser costoso. Valorar batch o RPC que reciba un array.
2. **`get_staff_work_info` (chat):** Usa `ilike('first_name', '%${employeeName}%')` con `maybeSingle()`. Varios resultados pueden devolver solo uno; búsqueda por nombre puede ser ambigua.
3. **RLS permisivo en tablas nuevas:** `supplier_item_mappings`, `purchase_invoices`, `purchase_invoice_lines` tienen `USING (true) WITH CHECK (true)` para `authenticated`. Cualquier usuario autenticado puede leer/escribir. Aceptable para MVP, pero habría que restringir por rol en producción.

### 3.2 Lógica fantasma / código legacy

1. **`/api/ai-tools-executor`:** Endpoint con esquema desfasado. No referenciado en el repo. Opciones: corregir esquema o eliminar si no se usa.
2. **`schema_dump.sql`:** Dump grande en raíz; puede no reflejar el estado actual de migraciones. Mejor usar migraciones como fuente de verdad.

### 3.3 Cuellos de botella potenciales

| Ubicación | Riesgo | Recomendación |
|-----------|--------|---------------|
| `getDashboardData` | Varias llamadas paralelas (6+); una falla no bloquea el resto | Aceptable |
| `updateWeeklyWorkerConfig` | N updates/inserts en bucle | Valorar RPC batch |
| `WorkerWeeklyHistoryModal` | Una RPC por apertura | Aceptable |
| `MovementsPage` fetchPage | Paginación con IntersectionObserver | Aceptable |

---

## 4. RESUMEN EJECUTIVO

| Categoría | Estado |
|-----------|--------|
| Mapa de conexión | Completo; 2 tablas huérfanas de UI |
| Inconsistencias críticas | 3 (ai-tools-executor, ManagerLedgerView full_name, RLS manager_ledger) |
| Inconsistencias medias | 2 (storage bucket, supplier_id) |
| Escalabilidad | Viable con correcciones |
| Deuda técnica | Endpoint ai-tools-executor obsoleto; bucle en updateWeeklyWorkerConfig |

### Acciones prioritarias

1. ~~Corregir o eliminar `/api/ai-tools-executor`~~ **HECHO** — Eliminado.
2. ~~Cambiar `ManagerLedgerView` a `profiles(first_name, last_name)` o añadir `full_name` en BD~~ **HECHO** — Columna `full_name` generada + fallback first_name/last_name.
3. ~~Verificar que el JWT incluya el claim `role`~~ **HECHO** — Trigger `sync_profile_role_to_auth` inyecta role en `raw_app_meta_data`.
4. Revisar si `employee-documents` es el nombre real del bucket de Storage.
