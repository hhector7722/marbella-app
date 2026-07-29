# SHADOW — Análisis residual post Iteraciones A/B

**Fecha:** 2026-07-24  
**Skill:** `auditor-horas-nominas` + `db-supabase-master`  
**Alcance:** Clasificación + corrección Bali.  
**Run de referencia post-B:** `a4db4f3e-…` · EMR **76,47%** · Diff **4**.  
**Run post fix adaptador SQL:** `bfdb100b-…` · EMR **82,35%** · Diff **3** (Fernando exact).  
**Run post fix Bali:** `4b0b3a55-…` · EMR **88,24%** · Diff **2** (Bali exact).

---

## Resumen ejecutivo

Estado acumulado:

| Fase | EMR | CDR | Exact | Diff |
|------|-----|-----|-------|------|
| Baseline | 35,29% | 64,71% | 6 | 11 |
| Tras Iteración A | 52,94% | 47,06% | 9 | 8 |
| Tras Iteración B | 76,47% | 23,53% | 13 | 4 |
| Tras fix adaptador SQL | 82,35% | 17,65% | 14 | 3 |
| **Tras fix Bali** | **88,24%** | **11,76%** | **15** | **2** |

Causas estructurales ya cerradas (A/B/Bali): `ordinary_hours`/`extra_hours`, `end_date`, fence baja desde tramos, snapshots post-baja.

**Fix Shadow (no dominio):** proyección `carryOut` del SQL-adapter. Fernando → EXACT.

Permanecen **2 empleados** (ningún bug abierto):

| # | Empleado | Códigos (W20) | Clasificación |
|---|----------|---------------|---------------|
| 1 | Héctor | D001 + D003 | **Regla de negocio validada** |
| 2 | Pere | D002 | **Decisión funcional** (semilla histórica) |

**Bali: cerrado** (bug SQL corregido). **Fernando: cerrado.**  
**Conclusión SSOT:** **B** — productor SQL técnicamente convergido; única decisión funcional pendiente = semilla Pere.

---

## Discrepancia 1

### Empleado

**Héctor** (`baacc78a-b7da-438e-8ea4-c9f3ce6f90e6`)

### Clasificación

**D) Regla de negocio** *(reclasificación 2026-07-24 — anula la lectura “BUG SQL”)*

**Fuente normativa:** [`context/POLITICA_JORNADA_FIJA_HECTOR.md`](context/POLITICA_JORNADA_FIJA_HECTOR.md)

### Evidencia

#### Política funcional aprobada

| Campo | Valor |
|-------|--------|
| Sujeto | **Solo** `hhector7722@gmail.com` |
| Rol | **No** ligada a `manager` (aunque hoy el SQL esté acoplado a rol/fijo) |
| Base | 8 h/día laborable · **40 h/semana** ordinarias |
| Fichajes | **Siempre adicionales** → horas **extra** |
| Total | `40 + Σ fichajes` |
| Costes / KPIs / liquidaciones / snapshots | Las 40 h son ordinarias **reales**, no decorativas |

#### Hechos técnicos (sin reinterpretar como bug)

| Fuente | Valor |
|--------|-------|
| `profiles.role` / `is_fixed_salary` | `manager` / `true` (acoplamiento actual) |
| `profiles.contracted_hours_weekly` | 40 |
| `hours_contract_terms` | `weekly_hours=0`, regime manager |
| HE | 0 (aún no implementa la política de jornada fija) |
| SQL W20 | `total_hours=40`, `contracted_hours_snapshot=40`, 0 fichajes |
| Diff Shadow | `computableHours:0→40` · `contractedHoursEffective:0→40` |

Rama SQL vigente (comportamiento a **preservar** para este usuario):

```text
manager OR is_fixed_salary → total_hours := 40 + logs; weekly_balance := logs
```

### Conclusión

La diferencia Shadow HE↔SQL en Héctor **no** autoriza a borrar las 40 h del productor SQL. El productor SQL refleja la política funcional deliberada para este usuario; el HE (tramo 0) aún no. **Iteración C descartada.**

El acoplamiento `manager|fixed` (en lugar de email/flag) es **deuda de implementación** a evolucionar más adelante (`attendance_mode = FIXED_WEEK`, etc.), no una licencia para eliminar la jornada base.

### Recomendación

**No corregir.** Mantener comportamiento. Cualquier alineación futura HE/Shadow debe **incorporar** la jornada fija para este usuario, nunca eliminar las 40 h SQL “para subir el EMR”.

---

## Discrepancia 2

### Empleado

**Fernando** (`16f1e341-97ff-443d-aec1-0329e8fad98c`)

### Clasificación

**Cerrado — bug adaptador Shadow corregido** (2026-07-24)

Ver **«Revisión del caso Fernando»** y **«Corrección del adaptador SQL del Shadow»**.

### Estado post-fix

Shadow run `bfdb100b-…` semana `2026-07-20`: **EXACT**.

---

## Discrepancia 3

### Empleado

**Pere** (`56e8aa3b-a2d9-4bee-9caa-b302df71f988`)

### Clasificación

**D) Regla de negocio**

### Evidencia

#### Contrato

| Fuente | Valor |
|--------|-------|
| `joining_date` / término | `2025-09-01` |
| `contracted_hours_weekly` | 28 |
| `prefer_stock_hours` | **true** (Bolsa) |
| `hours_contract_terms` | 28 h, `bag_mode=true`, desde `2025-09-01` |
| `profiles.hours_balance` (global) | −29,5 (cercano a SQL W20 `final_balance` −25,5; no idéntico a HE −31) |

#### Primera semana donde ambos motores divergen

**`2025-09-01`** (primer lunes con hechos HE + snapshot SQL cargable en Shadow; tramo laboral empieza aquí).

No existe semana EXACT previa en la intersección HE∩SQL: el loader HE no reconstruye pre-`effective_from`; SQL sí tiene cadena previa.

#### Reconstrucción en el punto de ruptura

**SQL — semanas previas (agosto, deuda arrastrada):**

| Semana | Carry in (`pending`) | Movimiento (`balance_hours`) | Carry out (`final`) |
|--------|----------------------|------------------------------|---------------------|
| 2025-07-28 | 25,5 | −28 | **−2,5** |
| 2025-08-04 … 08-25 | −2,5 | 0 (sin fichajes; mes 8) | **−2,5** |
| **2025-09-01** | **−2,5** | +10 (38 h − 28) | **+7,5** |

**HE — apertura en `2025-09-01`:**

| Semana | Carry entrada | Horas | Contrato | Movimiento | Carry salida |
|--------|---------------|-------|----------|------------|--------------|
| **2025-09-01** | **0** | 38,53 | 28 | +10,5 | **+10,5** |

Diff en la semilla:

- `carryIn`: HE **0** vs SQL **−2,5** (SQL importa deuda pre-alta / pre-término).
- Horas: HE **38,53** vs SQL **38** (`fn_round_marbella_hours` en suma SQL) → `weeklyBalance` 10,5 vs 10.
- `carryOut`: 10,5 vs 7,5 (gap inicial **3 h**, compuesto semilla + redondeo).

#### Propagación hasta W20 (misma lógica de bolsa; gap persistente)

Ambos en bolsa: `carryOut_n → pending_{n+1}`, `final = pending + weekly`. El algoritmo semanal es el mismo; el desfase de apertura **no se cierra**.

| Semana | HE carryIn → out | SQL pending → final | Notas |
|--------|------------------|---------------------|-------|
| 2026-01-05 | 5 → −17 | 11 → −11 | Gap ~6; horas 6,08 vs 6 |
| 2026-04-20 | −15 → −4 | −9,5 → +1,5 | Cruce de signo distinto por gap |
| **2026-07-20** | **−35 → −31** | **−29,5 → −25,5** | Diff Shadow solo carry / balanceFinal / pending (**5,5 h**) |

W20: `weeklyBalance` HE=SQL=**+4**, contrato 28, horas 32 — el delta semanal **coincide**; solo diverge el banco acumulado.

### Conclusión

La diferencia **no** nace en la semana Shadow. Nace en la **política de apertura**:

1. ¿Debe el banco HE heredar `final_balance` SQL anterior a `joining_date` / `hours_contract_terms.effective_from`?  
2. ¿La deuda −2,5 de julio–agosto 2025 es deuda laboral real o residuo legacy?

Hasta no decidir eso, modificar SQL, HE o hacer backfill sería **especulación**, no corrección demostrada.

### Recomendación

**Validar con negocio** el tratamiento del banco pre-alta de Pere. No abrir Iteración E de “arreglar carry” sin esa decisión. Documentar la semilla `2025-09-01` como origen.

---

## Discrepancia 4

### Empleado

**Bali** (`c5aed5dd-aa3c-4c21-8eaf-4393ca118dc4`)

### Clasificación

**A) BUG SQL**

*(El residual W20 `carryOut −1→0` es bug SQL demostrable. Hay componentes adicionales de modelo Pago en semanas intermedias — ver evidencia — que no deben “arreglarse” como si fueran el mismo bug.)*

### Evidencia

#### Contrato / baja

| Fuente | Valor |
|--------|-------|
| `joining_date` | 2026-03-21 |
| `end_date` | **2026-06-30** |
| `profiles.contracted_hours_weekly` (actual) | **0** (perfil ya cerrado) |
| Tramo 1 | 2026-03-21 → **2026-06-29**, `weekly_hours=8`, `bag_mode=false` |
| Tramo 2 | 2026-06-30 → ∞, `weekly_hours=0` |

#### Primera divergencia: **`2026-03-16`**

Fichajes: 2026-03-21 (6 h) + 2026-03-22 (8 h) = **14 h**. Sin fichajes 16–20 mar.

| Campo | HE | SQL |
|-------|----|-----|
| Contrato efectivo | **2** (prorrateo alta: 2/7×8 → Marbella) | **8** (snapshot jornada completa) |
| Horas | 14 | 14 |
| `weeklyBalance` | 12 | 6 |
| `is_paid` | true | true |
| `carryOut` canónico | **0** (Pago + pagada → sella crédito) | **6** (`final_balance`; `total_cost=60`) |

Dos fenómenos en la misma semana:

1. SQL no aplica el mismo prorrateo de **contrato** en semana de alta que HE.  
2. Mismo **modelo Pago** que Fernando (`carryOut` HE 0 vs `final_balance` SQL).

#### Semanas intermedias (patrón Pago)

Varias semanas EXACT en bolsa override / neto cero. En semanas Pago con crédito (`2026-03-23`, `05-04`, `05-25`, …): única diff sistemática `carryOut:0→N` — **modelo diferente** (igual que Fernando), no bug de horas.

#### Origen del residual W20 (−1 vs 0): semana de baja **`2026-06-29`**

| Campo | HE | SQL (post Iter B) |
|-------|----|-------------------|
| Contrato | **1** | **0** |
| Horas | 0 | 0 |
| `weeklyBalance` | **−1** | 0 |
| `is_paid` | true | true |
| `carryOut` | **−1** | 0 |

**Por qué HE = 1:** el tramo de 8 h incluye el lunes 29 (`effective_to=2026-06-29`); el tramo 0 h empieza el 30. Un día de 8/7 ≈ 1,14 → redondeo Marbella → **1**. Deuda −1; con `isPaid`, `computeCarry` conserva deuda (`min(0, balanceFinal)`).

**Por qué SQL = 0:** Iter B prorratea con `profiles.contracted_hours_weekly` **ya en 0**, no con el tramo versionado de 8 h:

```148:150:supabase/migrations/20260724090000_shadow_iter_b_end_date_fence.sql
      v_snapshot_contracted_hours := public.fn_round_marbella_hours(
        (v_days_employed::numeric / 7.0) * v_full_week_contract
      );
```

`v_full_week_contract := v_current_contracted_hours` (perfil) → 2/7×**0** = 0.

#### Propagación post-baja

| Semana | HE carryIn → out | SQL | Diff |
|--------|------------------|-----|------|
| 2026-06-29 | 0 → **−1** | 0 → 0 | nace la deuda |
| 2026-07-06 … **07-20** | **−1 → −1** | 0 → 0 | residual Shadow D002 |

### Conclusión

El residual reportado (carry histórico −1) **aparece exactamente** en `2026-06-29` porque SQL usa jornada de perfil ya a cero en el fence de baja, mientras HE usa `hours_contract_terms`. Eso es incorrectitud del productor SQL respecto a la SSOT de tramos (misma familia que el diseño HE), no ambigüedad de negocio pendiente.

La primera divergencia de la vida laboral (16-mar) mezcla prorrateo de alta SQL + modelo Pago; el **−1 de W20** no depende del modelo Pago.

### Recomendación

Corregir SQL para que el fence de baja (y el de alta) use **tramos versionados** / misma base que HE — no el `contracted_hours_weekly` ya vaciado. **No** es Iteración C (manager=40). Puede planificarse tras C o como ampliación del fence B; no abrir “E carry histórico” genérico sin este diagnóstico.

---

## Revisión del caso Fernando

**Fecha revisión:** 2026-07-24  
**Criterio:** Fernando debe seguir las **mismas reglas** que el resto. «Modelo diferente» queda **invalidado** salvo evidencia funcional explícita (no hallada).  
**Alcance:** solo diagnóstico. Sin código, migraciones, SQL, HE ni Shadow.

### Decisión final

**C) Fernando tiene un BUG en el adaptador Shadow.**

No A (SQL), no B (HE), no D (datos históricos). Sin regla de negocio especial.

---

### Reconstrucción completa (semana Shadow `2026-07-20`)

#### Contrato / tramos

| Fuente | Valor |
|--------|-------|
| Email | `fggutierrez98es@gmail.com` |
| Rol | `staff` (no manager, no fijo) |
| `contracted_hours_weekly` | **0** |
| `prefer_stock_hours` | **false** (Pago) |
| `hours_contract_terms` | 1 tramo abierto desde `2026-02-15`: `weekly_hours=0`, `bag_mode=false`, `regime=staff`, tarifa 10 €/h |
| `joining_date` / `end_date` | 2026-02-15 / null |

Sin tratamiento especial en perfil ni tramos.

#### Fichajes (Madrid, semana 20–26 jul)

| clock_in (UTC) | total_hours |
|----------------|-------------|
| 2026-07-22 | 8 |
| 2026-07-23 | 8 |
| **Suma** | **16** |

#### Horas ordinarias / extras / liquidación HE

| Campo HE | Valor |
|----------|-------|
| `contractedHoursEffective` | 0 |
| `hoursWorked` | 16 |
| `ordinaryHours` | 0 |
| `overtimeHours` | 16 |
| `carryIn` | 0 |
| `weeklyBalance` | 16 |
| `balanceFinal` | **16** |
| `carryOut` | **0** (modo Pago: crédito liquidado, no arrastra) |
| `isPaid` | false |
| segmento | `bagMode=false`, `weeklyBalancePart=16` |

#### Snapshot SQL

| Campo SQL | Valor |
|-----------|-------|
| `contracted_hours_snapshot` | 0 |
| `total_hours` | 16 |
| `ordinary_hours` | 0 |
| `extra_hours` | 16 |
| `balance_hours` | 16 |
| `pending_balance` | 0 |
| `final_balance` | **16** |
| `total_cost` | 160 (= 16 × 10) |
| `is_paid` | false |
| `prefer_stock_hours_override` | null → perfil false |

#### Canonical Vector (Shadow)

| Campo canónico | HE-adapter | SQL-adapter | ¿Igual? |
|----------------|------------|-------------|---------|
| computableHours | 16 | 16 | Sí |
| contractedHoursEffective | 0 | 0 | Sí |
| ordinaryHours | 0 | 0 | Sí |
| overtimeHours | 16 | 16 | Sí |
| carryIn / pendingHours | 0 | 0 | Sí |
| weeklyBalance | 16 | 16 | Sí |
| **balanceFinal** | **16** | **16** | **Sí** |
| payableHours | 16 | 16 | Sí |
| compensatedHours | 0 | 0 | Sí |
| bagModeApplied | false | false | Sí |
| isPaid | false | false | Sí |
| **carryOut** | **0** | **16** | **NO — único diff** |
| otCost | null (opcional, no compara) | 160 | n/a |

Diff Shadow reportado: solo `carryOut: 0 → 16` (D002).

---

### Checklist de coincidencia (primera divergencia)

| Etapa | ¿Coinciden HE y SQL? |
|-------|----------------------|
| Fichajes | **Sí** (16 h) |
| Tramos / contrato 0 / Pago | **Sí** |
| Horas ordinarias | **Sí** (0) |
| Horas extra | **Sí** (16) |
| Carry In | **Sí** (0) |
| Liquidación semanal (`weeklyBalance`, `balanceFinal`) | **Sí** (16 / 16) |
| Snapshot campos de horas y coste | **Sí** (`extra_hours`, `final_balance`, `total_cost` coherentes) |
| Arrastre **real** a la semana siguiente | **Sí** (ver cadena abajo) |
| Campo canónico `carryOut` tras adaptadores | **No** ← **primera (y única) divergencia** |

**Primer punto de delta:** proyección en `sqlSnapshotToCanonical`:

```text
carryOut: finalBal   // colapsa final_balance → carryOut
balanceFinal: finalBal
```

HE-adapter proyecta dos campos distintos:

```text
balanceFinal: r.balanceFinal  // 16
carryOut: r.carryOut          // 0
```

---

### Evidencia: los productores ya convergen en el arrastre

Regla SQL de `pending` de la semana siguiente (fn_recalc):

```text
si final_balance > 0:
  pending_siguiente = final_balance  solo si Bolsa AND no pagada
  else pending_siguiente = 0
si final_balance ≤ 0:
  pending_siguiente = final_balance  // deuda siempre
```

Para Fernando (Pago, crédito): `pending_siguiente` **debe ser 0**.

Cadena medida (HE `carryOut` vs SQL `final` vs pending real de W+1):

| Semana | HE balanceFinal | HE carryOut | SQL final_balance | SQL pending W+1 | sqlImpliesNextPending |
|--------|-----------------|-------------|-------------------|-----------------|------------------------|
| 2026-06-01 | 32 | 0 | 32 | 0 | 0 |
| 2026-06-08 | 48,5 | 0 | 48,5 | 0 | 0 |
| 2026-06-15 | 39,5 | 0 | 39,5 | 0 | 0 |
| 2026-06-22 | 31,5 | 0 | 31,5 | 0 | 0 |
| 2026-06-29 | 31,5 | 0 | 31,5 | 0 | 0 |
| 2026-07-06 | 32,5 | 0 | 32,5 | 0 | 0 |
| 2026-07-13 | 31 | 0 | 31 | 0 | 0 |
| 2026-07-20 | 16 | 0 | 16 | (semana Shadow) | 0 |

**Conclusión de cadena:** `HE.carryOut === SQL.pending_{semana+1} === proyección correcta desde reglas SQL`.  
`SQL.final_balance === HE.balanceFinal`.  
El adaptador confunde ambos al asignar `carryOut ← final_balance`.

Si se proyectara:

```text
carryOut_sql ≡ (final > 0 && !(bag && !paid)) ? 0 : final
// equivalente a la regla de pending de la semana siguiente
```

entonces Fernando W20: `carryOut_sql = 0` = HE → **EXACT**.

---

### Fernando no es un caso único

Misma semana / patrón (Pago, crédito > 0, único diff `carryOut`):

| Empleado | Semana | HE carryOut | HE balanceFinal | SQL final | Diff canónico |
|----------|--------|-------------|-----------------|-----------|---------------|
| Fernando | 2026-07-20 | 0 | 16 | 16 | solo carryOut |
| Julia | 2026-07-13 | 0 | 16 | 16 | solo carryOut |
| Mamadou | 2026-07-13 | 0 | 16 | 16 | solo carryOut |

No hay regla «Fernando especial». Es el **modo Pago con crédito** + mapping incorrecto del adaptador.

Búsqueda de regla funcional explícita que justifique un tratamiento distinto de Fernando: **ninguna** (perfil staff estándar, sin flags, sin docs de excepción).

---

### Causa raíz

| Pregunta | Respuesta |
|----------|-----------|
| ¿Bug SQL en horas/OT/`final_balance`/`total_cost`/pending? | **No** — coherente con HE y con `HORAS_SNAPSHOTS_Y_ARRASTRE.md` |
| ¿Bug Hours Engine (`computeCarry` Pago → carryOut 0)? | **No** — alineado con UI (footer) y con pending SQL de W+1 |
| ¿Datos históricos corruptos? | **No** — patrón estable desde 2026-06-01 |
| ¿Regla de negocio distinta? | **No** |
| **Causa** | SQL-adapter Shadow mapea `carryOut` y `balanceFinal` al **mismo** número (`final_balance`), pero en HE (y en la semántica de arrastre SQL) son conceptos distintos en modo Pago |

Componente responsable: `src/lib/shadow/adapters/sql-adapter.ts` (`carryOut: finalBal`).

---

### Recomendación (histórico del diagnóstico)

Corregir proyección canónica del SQL-adapter (no SQL/HE). **Hecho** — ver apartado siguiente.

---

## Corrección del adaptador SQL del Shadow

**Fecha:** 2026-07-24  
**Alcance:** solo infraestructura Shadow. Sin SQL, HE, snapshots ni migraciones.

### Causa raíz

El Canonical Vector exige `balanceFinal` y `carryOut` como campos distintos. El SQL no tiene columna `carry_out`; solo `final_balance` + regla de `pending` en `fn_recalc`. El adaptador asignaba ambos al mismo número.

### Evidencia (pre-fix)

| | HE | SQL hechos | Adaptador (mal) |
|--|----|------------|-----------------|
| Fernando W20 | bf=16, co=0 | final=16, pending W+1=0 | bf=16, **co=16** |

Julia / Mamadou: mismo patrón en semanas Pago con crédito (demostrado 2026-07-13); en horizonte W20 ya eran exact.

### Mapeo incorrecto

```text
carryOut     ← final_balance
balanceFinal ← final_balance
```

### Mapeo correcto

SQL no expone `carry_out` directamente. Equivalente funcional = lo que `fn_recalc` escribiría en `pending_balance` de la **semana siguiente**:

```text
balanceFinal ← final_balance

carryOut ←
  si final_balance > 0:
    final_balance  si Bolsa ∧ ¬is_paid
    0              en caso contrario (Pago o pagada)
  si final_balance ≤ 0:
    final_balance  (deuda/cero siempre arrastra)

si Bolsa desconocida y crédito > 0 → null (no inventar)
```

Implementación: `projectSqlCarryOut` en `src/lib/shadow/adapters/sql-adapter.ts`.

### Validación

| Métrica | a4db4f3e (post-B) | bfdb100b (post-fix) |
|---------|------------------|----------------------|
| EMR | 76,47% | **82,35%** |
| CDR | 23,53% | **17,65%** |
| Exact | 13 | **14** |
| Diff | 4 | **3** |
| Field diffs | 11 | **10** |

| Sujeto | Antes | Después |
|--------|-------|---------|
| Fernando | diff (carryOut) | **exact** |
| Julia | exact | exact |
| Mamadou | exact | exact |
| Héctor / Pere / Bali | diff | diff (sin cambio) |
| Nuevas | — | **0** |

Tests: `npm run test:shadow` → **42/42**.

### Impacto en EMR

**+5,88 pp** (13/17 → 14/17) por recuperación de Fernando. Sin alteración del comportamiento funcional de negocio.

---

## Recomendación arquitectónica

### Dominio

**Ninguna iteración automática.** C descartada. El único bug real residual es Bali (SQL fence). Pere requiere decisión de semilla antes de cualquier alineación.

### Estado Shadow

Adaptador SQL `carryOut` **corregido**. Validation Gate cerrado (solo diagnóstico).

### Defectos residuales (post fix Bali)

| Caso | Tipo | Acción futura |
|------|------|---------------|
| Héctor | Regla de negocio **validada** | No tocar |
| Pere | **Decisión funcional** (semilla) | Decidir herencia pre-joining |
| Bali | ~~Bug SQL~~ | **Cerrado** (`4b0b3a55-…`) |
| Fernando | ~~Bug adaptador~~ | **Cerrado** |

### Addendum documental (2026-07-24)

- Política jornada fija Héctor; Iter C retirada.  
- Fernando diagnosticado → fix adaptador aplicado y validado (`bfdb100b-…`).  
- SQL / HE / tip-pool sin cambios en el fix de adaptador.  
- **Validation Gate** (diagnóstico).  
- **Corrección Bali** aplicada y validada (`4b0b3a55-…`). Ver § siguiente.

---

## Corrección del bug Bali

**Fecha:** 2026-07-24  
**Run:** `4b0b3a55-40dc-4622-8dbc-a21e1efa1065` vs `bfdb100b-…`  
**Migración:** `20260724120000_shadow_bali_fence_contract_terms.sql` (**aplicada**)

### Causa raíz

En la semana parcial de baja, Iter B calculaba:

`días_empleados/7 × profiles.contracted_hours_weekly`

Tras cerrar a Bali, el perfil ya tenía `contracted_hours_weekly = 0`, así que el contrato efectivo de `2026-06-29` quedaba en **0**. HE, con `hours_contract_terms` (8 h hasta el 29), obtenía **1**.

### Evidencia pre-fix

| Semana | HE contract | SQL contract | weeklyBalance |
|--------|-------------|--------------|---------------|
| 2026-06-29 | **1** | **0** | −1 vs 0 |
| 2026-07-20 | carry −1 | carry 0 | residual D002 |

### Cambio realizado

Únicamente la rama de fence de baja parcial en `fn_recalc_and_propagate_snapshots`:

- Contrato = suma por tramo de `fn_round_marbella_hours(n_días/7 × weekly_hours)` desde `hours_contract_terms` (días ≤ `end_date`).
- **No** se tocó carry/pending/balance/OT/ordinary/manager=40/rama activa/HE/Shadow.

Backfill: `PERFORM fn_recalc` solo perfiles con `end_date`.

### Validación post-fix

Snapshot Bali `2026-06-29`: `contracted_hours_snapshot=1`, `balance_hours=-1`, `final_balance=-1`.

| Métrica | Antes (`bfdb100b`) | Después (`4b0b3a55`) |
|---------|--------------------|----------------------|
| EMR | 82,35% | **88,24%** |
| CDR | 17,65% | **11,76%** |
| Exact | 14 | **15** |
| Diff | 3 | **2** |
| Field Diffs | 10 | **6** |

| Sujeto | Antes | Después |
|--------|-------|---------|
| Bali | diff | **exact** |
| Fernando | exact | exact |
| Héctor | diff (política) | diff (política) |
| Pere | diff (semilla) | diff (semilla) |
| Nuevas | — | **0** |

Tests shadow: **42/42**.

### Impacto en EMR

**+5,89 pp** (14/17 → 15/17) por recuperación de Bali.

### Estado del productor SQL

**Convergido técnicamente.** Sin bugs abiertos. Único pendiente: decisión funcional semilla Pere.

---

## Validation Gate — Revisión Final

**Fecha:** 2026-07-24  
**Run de referencia (al gate):** `bfdb100b-…` · EMR **82,35%** · Diff **3** · Tests shadow **42/42**  
**Nota posterior:** bug Bali implementado — ver § Corrección del bug Bali.  
**Alcance del gate:** solo investigación. Sin código, SQL, HE, Shadow, migraciones ni datos.

---

### Caso 1 — Héctor

#### Veredicto

**VALIDADO** — Regla de negocio validada.

#### Comprobación de política

Documento: [`context/POLITICA_JORNADA_FIJA_HECTOR.md`](context/POLITICA_JORNADA_FIJA_HECTOR.md)

| Requisito | Evidencia | ¿OK? |
|-----------|-----------|------|
| Solo `hhector7722@gmail.com` | Perfil Héctor = ese email. En plantilla Shadow W20 es el único manager/fijo con snapshot activo de 40 h. Ramon/Sergi (otros manager/fijo) **sin** snapshot W20 → skip Shadow. | OK para el residual actual |
| 40 h ordinarias intencionadas | SQL W20: `total_hours=40`, `contracted_hours_snapshot=40`, 0 fichajes | OK |
| Fichajes = extras | Semana con log `2026-05-25`: `total_hours=48` (=40+8), `extra_hours=8`, `ordinary_hours=0` en columnas manager, `balance_hours=8`, `total_cost=96` (8×12) | OK (fórmula 40+logs; cobro solo sobre fichajes) |
| Snapshots / costes / liquidación | Base en `total_hours` + contrato 40; OT/coste solo sobre logs | OK respecto a política documentada |

#### Primera divergencia (Shadow)

Cualquier semana donde HE lee tramo `weekly_hours=0` y SQL materializa 40 + logs. En W20: `computableHours 0→40`, `contractedHoursEffective 0→40`.

#### Componente responsable

Productor SQL (rama manager/fixed) **vs** HE/tramos en 0. La divergencia Shadow es esperada hasta que HE implemente la política; **no** autoriza a borrar las 40 h SQL.

#### Clasificación

**Regla de negocio**

#### Nota (deuda, no defecto del residual)

El SQL sigue acoplado a `manager\|fixed`, no al email. Documentado en la política como evolución futura (`FIXED_WEEK`). No convierte el caso Héctor en bug a “arreglar” quitando 40 h.

---

### Caso 2 — Pere

#### Veredicto

**Decisión funcional** (semilla histórica). No es un bug de algoritmo semanal.

#### Primera divergencia

**`2025-09-01`** — primer lunes con `joining_date` = `hours_contract_terms.effective_from` = 2025-09-01.

| | HE | SQL |
|--|----|-----|
| carryIn / pending | **0** | **−2,5** |
| horas | 38,53 | 38 (redondeo Marbella en suma) |
| weeklyBalance | 10,5 | 10 |
| carryOut / final | 10,5 | 7,5 |

#### Evidencia de semilla

Cadena SQL previa (antes del joining formal):

| Semana | pending | balance | final |
|--------|---------|---------|-------|
| 2025-07-28 | 25,5 | −28 | **−2,5** |
| 2025-08-04 … 08-25 | −2,5 | 0 | **−2,5** |
| **2025-09-01** | **−2,5** | +10 | 7,5 |

HE no reconstruye pre-`effective_from`: abre con `carryIn=0`.

W20: ambos con `weeklyBalance=+4`; solo diverge el banco acumulado (gap ~5,5 h). El arrastre semanal bolsa es el mismo mecanismo; el desfase nace en la apertura.

#### ¿Bug?

No de liquidación semanal ni de Shadow. La pregunta abierta es **funcional**:

> ¿El banco HE en la primera semana laboral debe heredar el `final_balance` SQL anterior a `joining_date` / `effective_from`, o arrancar en 0?

#### Clasificación

**Decisión funcional** (contenido del seed = **dato histórico** −2,5; el tratamiento del seed = decisión).  
Sin esa decisión, no hay “corrección” demostrable de productor.

#### Componente responsable

Frontera de timeline HE (apertura en tramos) **vs** continuidad SQL pre-alta — no un fallo de `computeCarry` ni de `fn_recalc` en semanas posteriores al joining.

---

### Caso 3 — Bali

#### Veredicto

**Bug independiente** (no consecuencia de Pere).

#### ¿Mismo origen que Pere?

| | Pere | Bali |
|--|------|------|
| Modo | Bolsa | Pago |
| Origen | Semilla pre-joining (−2,5) | Fence `end_date` + tramos |
| Primera diff | 2025-09-01 carryIn | 2026-03-16 contrato alta 2 vs 8 |
| Residual W20 | gap de banco histórico | deuda −1 nacida 2026-06-29 |

**No comparten causa.** B) Bug independiente.

#### Primera divergencia laboral

**`2026-03-16`** (semana de alta `joining_date=2026-03-21`): HE contrato prorrateado **2**; SQL snapshot **8**.

#### Origen del residual W20 (−1 vs 0)

Semana de baja **`2026-06-29`**:

| | HE | SQL |
|--|----|-----|
| Tramos | 8 h hasta **2026-06-29** inclusive; 0 h desde 2026-06-30 | — |
| Contrato efectivo | **1** (1 día × 8/7 → Marbella) | **0** (Iter B: `días/7 × profiles.contracted_hours_weekly` ya **0**) |
| weeklyBalance | −1 | 0 |
| carryOut | −1 | 0 |

Luego HE arrastra −1; SQL queda en 0. W20 solo refleja ese −1.

#### Evidencia

- `end_date=2026-06-30`, perfil `contracted_hours_weekly=0` post-cierre.  
- Tramo 8 h `effective_to=2026-06-29`.  
- 2026-06-22 EXACT (8 vs 8). El fallo aparece en la semana parcial de baja.

#### Clasificación

**Bug SQL**

#### Componente responsable

`fn_recalc_and_propagate_snapshots` — fence Iter B usa jornada de **perfil actual**, no `hours_contract_terms`, para prorratear la semana de baja (y en alta no alinea prorrateo de contrato al HE).

---

### Tabla definitiva Validation Gate

| Caso | 1ª divergencia | Evidencia clave | Componente | Clasificación |
|------|----------------|-----------------|------------|---------------|
| Héctor | W20 (y toda semana sin logs vs HE 0) | Política aprobada; SQL 40+logs; tip-pool coherente | SQL vs HE (política) | **Regla de negocio** |
| Pere | 2025-09-01 | HE carryIn 0 vs SQL −2,5 pre-alta | Frontera seed HE/SQL | **Decisión funcional** |
| Bali | 2026-03-16 (alta); residual 2026-06-29 | Contrato 1 vs 0 en baja | `fn_recalc` fence | **Bug SQL** |

---

### Decisiones finales (formato pedido)

#### Héctor

**Regla de negocio validada**

#### Pere

**Decisión funcional**

#### Bali

**Bug independiente**

---

### Criterio de cierre del proyecto SSOT

*(Al Validation Gate, pre-fix Bali:)* **B)** bug Bali pendiente.

*(Tras corrección Bali `4b0b3a55-…`:)* **B)** SSOT **técnicamente convergido**; única decisión funcional documentada pendiente = semilla histórica de Pere. **Sin bugs abiertos.**

Sin implementación en este Validation Gate (histórico).
