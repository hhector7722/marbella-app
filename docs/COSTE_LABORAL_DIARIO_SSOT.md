# Coste laboral diario — flujo de datos (`/dashboard/labor`)

**Fecha:** 2026-07-24  
**Skill:** `gestor-stock-costes` + consumidores SSOT

---

## Fórmula

```
coste_total_dia = coste_ordinario_dia + coste_extras_dia
```

---

## Coste ordinario (Fijo)

| Campo | Origen |
|-------|--------|
| Importe mensual | `payroll_monthly_totals.total_company_cost` (nómina oficial empresa) |
| Prorrateo | **Días naturales** del periodo PDF: `period_end - period_start + 1` |

```
coste_ordinario_dia = total_company_cost / días_naturales_periodo
```

- **No** se divide entre días trabajados / fichados.
- Misma regla de prorrateo que `get_financial_statement` (nóminas).
- Σ de los días del periodo = `total_company_cost` (centésimas: último día absorbe el resto).
- Es coste **de empresa**: el filtro por trabajador **no** reduce el fijo.
- Si falta la fila de nómina del mes → toast de error y fijo = 0 (anti-silent).

**No usa:** `fn_labor_*`, `profile_labor_cost_terms`, `profiles.monthly_cost`, tarifas horarias.

---

## Coste de horas extras

| Campo | Origen |
|-------|--------|
| Liquidación | Hours Engine (`liquidateWeekForCard` → `estimatedValue`) |
| Reparto diario | Pesos `extrasByDay` (misma cadena que Staff History / Overtime) |

- **No** se recalculan tarifas ni se estiman importes.
- Coincide con Staff History y Dashboard Overtime para la misma semana/empleado.

---

## UI actualizada

| Elemento | Comportamiento |
|----------|----------------|
| Calendario | Celda = total día (fijo + extras) |
| KPI Fijo | Σ ordinario nómina en el periodo |
| KPI Extras | Σ HE en el periodo |
| KPI Coste / M.O./Vtas | `totalCost / venta neta` |
| Detalle día | Fila «Nómina empresa» (fijo) + filas empleado (solo extras) |

---

## Código

- Builder: `src/lib/hours-engine/labor-cost-ssot.ts`
- Actions: `src/app/actions/labor-cost-ssot.ts`
- Pantalla: `src/app/dashboard/labor/page.tsx`

---

## Legacy eliminado en este flujo

- `fn_labor_*`
- `get_labor_cost_*`
- `profile_labor_cost_terms`
- Tarifas históricas / `monthly_cost` de perfil como fuente de ordinario
