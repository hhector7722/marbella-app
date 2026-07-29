# Migración consumidores SSOT — Fase 2 (pantallas)

**Fecha:** 2026-07-24  
**Alcance:** Solo consumidores UI. Sin cambios en Hours Engine núcleo, Shadow, snapshots ni payroll.

---

## FASE 1 — Overtime / Dashboard / Master (lista ≡ modal)

### Diagnóstico (antes)

| Vista | Consulta / productor | Importe mostrado |
|-------|----------------------|------------------|
| Lista `/dashboard/overtime` | RPC `get_weekly_worker_stats` → `final_balance` × tarifa perfil/snapshot | p.ej. 37€ |
| Modal detalle | Hours Engine (`liquidateWeekForCard` → `estimatedValue`) | p.ej. 40€ |
| Bloque Extras `/dashboard` | Misma lista vía `getOvertimeData` / builder | igual que lista |
| Bloque Extras `/master/dashboard` | `getOvertimeData` | igual que lista |

**Por qué diferían:** dos productores distintos (SQL stats vs HE liquidación) y, a veces, tarifas distintas (`profiles.overtime_cost_per_hour` / snapshot vs `overtimeRateForWeek(terms)`).

### Después

| Vista | Fuente nueva |
|-------|----------------|
| Lista overtime | `buildOvertimeWeeksFromSsot` → misma cadena que el modal (`estimatedValue`) |
| Modal | Sin cambio (ya HE) |
| Dashboard / Master Extras | `getOvertimeData` → builder SSOT |

**Legacy eliminado en estos flujos:** `get_weekly_worker_stats` (ya no llamado desde app).

---

## FASE 2 — `/dashboard/labor`

| Antes | Después |
|-------|---------|
| `get_labor_cost_*`, `fn_labor_*`, `profile_labor_cost_terms`, OT tagged | `buildLaborCostPeriodFromSsot` / `buildLaborCostDayDetailFromSsot` |
| Actions | `labor-cost-ssot.ts` |

**Nota:** KPI «Fijo» = prorrateo de `payroll_monthly_totals` por **días naturales** del periodo de nómina. «Extras» = prorrateo diario de `estimatedValue` HE. Ver [`COSTE_LABORAL_DIARIO_SSOT.md`](COSTE_LABORAL_DIARIO_SSOT.md).

---

## FASE 3 — Insights M.O. horaria + Horario/Schedule

| Pantalla | Antes | Después |
|----------|-------|---------|
| Insights coste laboral horario | `get_hourly_sales_vs_labor` → `fn_worker_hourly_rate` / `fn_labor_*` | Ventas `tickets_marbella` + `buildLaborCostPeriodFromSsot` (prorrateo por € venta) |
| Insights PyG extras | Ya `weekly_snapshots.total_cost` vía `get_financial_statement` | Sin cambio (SSOT persistido) |
| `/horario`, `/schedule` | RPC `fn_labor_effective_ordinary_rate` | `ordinaryHourlyRateFromSsot` (tramos + `profiles.monthly_cost`) |

---

## Tabla de estado

| Pantalla | Estado |
|----------|--------|
| Staff History | ✅ SSOT |
| Dashboard Overtime | ✅ SSOT |
| Dashboard | ✅ SSOT |
| Master Dashboard | ✅ SSOT |
| Dashboard Labor | ✅ SSOT |
| Insights | ✅ SSOT |
| Horario | ✅ SSOT |
| Schedule | ✅ SSOT |

---

## Legacy residual (BD / tipado; ya sin consumidores app de coste laboral)

Candidatos a DROP cuando se confirme que ningún job externo los usa:

- `get_weekly_worker_stats`
- `get_labor_cost_day_detail` / `get_labor_cost_month_summary`
- `get_daily_labor_cost`
- `get_hourly_sales_vs_labor`
- `fn_labor_effective_ordinary_rate`, `fn_labor_fixed_day_for_user`, `fn_labor_overtime_allocated_day`, `fn_labor_term_values`
- Tabla `profile_labor_cost_terms` (espejo histórico; no para UI laboral)

**Migración estimada consumidores laborales UI:** ~100% de las pantallas listadas.

**¿Una sola fuente de verdad visible?** Sí para horas extras / liquidación semanal (HE) y para coste extras diario/periodo (mismo `estimatedValue`). Tarifas ordinarias de planificación usan el mismo modelo de tramos + `monthly_cost`. PyG Insights extras sigue el snapshot SQL (`weekly_snapshots.total_cost`), alineado al productor oficial persistido — no a un segundo cálculo en cliente.
