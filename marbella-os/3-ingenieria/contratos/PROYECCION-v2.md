---
documento: CONTRATO-PROYECCION-v2
clase: inmutable
estado: vigente
capa: ingenieria
normativo: true
precedencia: 40
responsable: propiedad del producto
publicado: 2026-09-13
revisado: 2026-09-13
depende_de: ADR-0001, ADR-0011
supersede: CONTRATO-PROYECCION-v1
---

# Contrato de proyección · v2

Sucesor de [PROYECCION-v1](./PROYECCION-v1.md). Mismo Writer, misma fila semanal, más el mínimo diario y `carry_out` para que las lecturas no ejecuten el Hours Engine.

Norma superior: [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md), [ADR-0011](../../4-decisiones/ADR-0011-proyeccion-diaria-hija-y-carry-out.md).

```text
Hechos + overrides
  → Hours Engine (+ Cost Engine)
  → Writer (único orquestador de persistencia)
  → weekly_snapshots (C semanal) + weekly_snapshot_days (C diario)
  → Read Model → DTO → UI
```

---

## 1. Mapeo semanal (`weekly_snapshots`)

Igual que v1 §1.1–1.4, con estas enmiendas C:

| Origen (dominio) | Columna | Responsable | Observaciones |
|---|---|---|---|
| `LiquidationResult.carryOut` | `carry_out` | Writer | Columna de **W**. INV-C02: igual a `pending_balance` de W+1 cuando W+1 existe. Necesaria en la semana en curso. |
| Bolsa efectiva de la liquidación | `prefer_stock_effective` | Writer | Override B o todos los segmentos en bolsa. Hecho de resolución, no display. |
| `PriceWeekOvertimeResult.hasMissingRate` | `has_missing_rate` | Writer | Distinto de `total_cost = 0`. |
| `PriceWeekOvertimeResult.hourlyRate` | `overtime_rate_effective` | Writer | NULL si falta tarifa o no aplica. |
| `PriceWeekOvertimeResult.estimatedValue` | `total_cost` | Writer | 0 si el importe es cero o si falta tarifa (`has_missing_rate` distingue). |

`is_paid`, `prefer_stock_hours_override` y `overtime_price_snapshot` siguen siendo **B**. El Writer de liquidación no las inventa.

### Fuera de la fila semanal

| Magnitud | ¿Se persiste aquí? | Dónde vive |
|---|---|---|
| `dailyBreakdown.overtimeHours` / € extra del día | No (no JSON en esta fila) | `weekly_snapshot_days` |
| `segments` | No | Regenerables |
| `displayExtras` / `extrasFooter` | No | Read Model, INV-P03, sin re-liquidar |
| `netPayable` | No | Derivado de `final_balance` + `carry_out` + bolsa efectiva |
| Horas diarias / relojes | No | `time_logs` |

---

## 2. Mapeo diario (`weekly_snapshot_days`)

Tabla hija. PK `(user_id, day)`. FK `(user_id, week_start)` → `weekly_snapshots`. Siete filas por semana escrita, aunque el OT sea 0.

| Origen | Columna | Responsable |
|---|---|---|
| Identidad | `user_id`, `week_start`, `day` | Writer |
| `dailyBreakdown[day].overtimeHours` | `overtime_hours` | Writer (valor HE) |
| Reparto de `estimatedValue` por pesos de OT diario | `overtime_cost` | Writer (valor Cost Engine + `allocateWeekCostToDays`) |

Invariantes de lote, misma semana:

- Σ `overtime_hours` ≡ `weekly_snapshots.extra_hours`
- Σ `overtime_cost` ≡ `weekly_snapshots.total_cost` (céntimos; último día absorbe)
- `day` ∈ [`week_start`, `week_start` + 6]

El Writer reescribe los siete días de cada semana que toca. No hay parche parcial.

---

## 3. Autoridad de escritura

Único escritor de columnas C semanales y de todas las columnas de `weekly_snapshot_days`: el **Writer**.

Prohibido: SQL de liquidación, React, Read Model, Cost Engine escribiendo horas, Hours Engine escribiendo euros.

---

## 4. Autoridad de lectura

Read Models → DTO → pantallas (historial, tarjeta, overtime, labor, exports).

Nunca `liquidateWeek` / `liquidateWeekForCard` / `resolveOpeningCarryIn` en un GET. Si `carry_out` es NULL o faltan los siete días, el read-model **falla visible**. No pinta cero como si no hubiera extras.

El pie Extras se deriva en el Read Model:

- si `carry_out < 0` → 0 (INV-P03)
- si bolsa efectiva → `extra_hours`
- si pago → horas cobrables de **esta** semana (`netPayable − max(0, carryIn)`)

`extra_hours` (OT bruto) y extras de pie **pueden diferir**. No forzar igualdad en base de datos.

---

## 5. Escritura del Writer

Entradas: las de v1 (hechos, overrides B, semilla `carryIn(timelineStart) = 0`, horizonte de lunes).

Salidas:

1. Filas `weekly_snapshots` con C de v1 **más** `carry_out`, `prefer_stock_effective`, `has_missing_rate`, `overtime_rate_effective`.
2. Siete filas `weekly_snapshot_days` por semana escrita.
3. No modifica `time_logs` ni tramos. No inventa B.

Invalidación: desde el lunes del hecho afectado hasta el lunes de hoy Madrid. Igual que v1. El orquestador de parada anticipada no es este contrato.

Pre/postcondiciones e invariantes de v1 (INV-C, INV-J, INV-$, INV-P04) siguen. Añadidos: Σ diaria; `carry_out(W) = carryIn(W+1)` en el batch.

---

## 6. Idempotencia

Mismos hechos + mismos B + mismas versiones de motor + este contrato ⇒ mismas columnas C semanales y mismos días.

Metadata D (instante de regeneración) puede cambiar.

---

## 7. Qué no es este contrato

- No es SSOT de fichajes ni de contrato.
- No autoriza un segundo productor «de historial».
- No autoriza caché de UI como sustituto de persistencia.
- Metadata física de versiones de motor sigue conceptual, como en v1 §1.5.
