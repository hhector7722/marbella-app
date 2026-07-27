# ADR-HE-SSOT-001 — Cierre del dominio de horas: Hours Engine como único productor

| Campo | Valor |
|---|---|
| Estado | **CONGELADO** |
| Fecha | 2026-07-27 |
| Skills | `architect-horas-nominas`, `auditor-horas-nominas`, `db-supabase-master` |
| Alcance | Dominio Liquidation / Carry / Coste OT |
| Fuera de alcance | Implementación inmediata (ver plan Fases 0b–5) |

---

## Contexto

Hoy coexisten dos cadenas internamente coherentes:

1. **Hours Engine** (`liquidateWeek` → `computeCarry` → Cost Engine)
2. **SQL** (`fn_recalc_and_propagate_snapshots` → `weekly_snapshots`)

Producen valores distintos cuando la **apertura histórica** difiere (caso Pere: gap estable ≈ 5,5 h).  
La decisión previa ya fija: **Hours Engine = único productor de negocio**.

Este ADR congela lectura, semilla, invariantes, prohibiciones, responsabilidades, plan y criterios de aceptación **antes** de implementar el cutover.

---

## Decisión congelada (nuclear)

> Existe **un único productor** de magnitudes de liquidación: el **Hours Engine**.  
> `weekly_snapshots` **no calcula**; solo **persiste la proyección** del vector HE (+ hechos admin).  
> La UI **nunca** ejecuta ni reinterpreta lógica de negocio.

---

# PUNTO 1 — Arquitectura de lectura (única)

### Alternativas

| | Flujo |
|---|---|
| A | Hechos → HE → DTO → UI *(HE en cada lectura)* |
| B | Hechos → HE → `weekly_snapshots` → Read Model → DTO → UI *(HE solo en escritura)* |

### Criterio del negocio (aceptado como base)

```text
Hechos
  → Hours Engine
  → weekly_snapshots (proyección persistida)
  → Read Model
  → DTO
  → UI
```

### Evaluación

| Criterio | A (HE en read) | B (proyección) |
|---|---|---|
| **Ventajas** | Siempre “fresco”; no hay lag proyección | Un solo writer; lecturas baratas; auditable en BD; alineado a “pantallas sin lógica” |
| **Inconvenientes** | N+1 / cadena desde alta en cada load; riesgo de divergir de lo persistido; viola la regla de no negocio en carga | Requiere writer fiable + invalidación; lag hasta regenerar |
| **Consistencia** | HE consigo mismo, pero ≠ snapshot hasta backfill | Tras cutover: proyección ≡ HE por construcción |
| **Rendimiento** | Malo a escala (Pere = meses de `liquidateWeek`) | Bueno: SELECT + map |
| **Auditoría** | Difícil (resultado efímero) | Fácil: fila semanal consultable |
| **Recuperación** | Re-ejecutar HE | Re-ejecutar writer HE → UPSERT desde semana X |
| **Simplicidad** | Mentalmente simple, operativamente cara | Una vía de escritura, una de lectura |

### Arquitectura oficial (congelada)

**B — flujo definitivo:**

```text
Hechos (time_logs, hours_contract_terms, frontera, flags)
        │
        ▼
 Hours Engine (+ Cost Engine para dinero)
        │
        ▼
 weekly_snapshots   ← proyección persistida (NO motor)
        │
        ▼
 Read Model (solo proyección + joins de presentación)
        │
        ▼
 DTO final de pintura
        │
        ▼
 UI (React) — pinta; no interpreta
```

**Transición actual** (HE en read) es **deuda temporal**, no arquitectura final. Debe desaparecer en el cutover.

---

# PUNTO 2 — Rol de `weekly_snapshots`

### Definición oficial (única)

**C) Proyección persistida** del vector de liquidación del Hours Engine  
(+ hechos administrativos / overrides).

No es:

- A) motor  
- B) cache efímera (sí es durable; no se puede “perder”)  
- D) materialized view SQL automática  
- E) otra cosa  

Nombre canónico: **proyección persistida de liquidación semanal**.

### Clasificación de columnas

#### Hechos de identidad / periodo

| Columna | Clase |
|---|---|
| `user_id` | hecho / clave |
| `week_start` | hecho / clave (lunes ISO) |

#### Overrides / hechos de proceso (entrada al HE; no derivados)

| Columna | Clase |
|---|---|
| `is_paid` | override / hecho de proceso |
| `prefer_stock_hours_override` | override (null = contrato) |
| `overtime_price_snapshot` | override de tarifa OT (null = contrato) |

#### Resultados calculados (solo escritos por HE / Cost Engine)

| Columna | Magnitud HE / Cost |
|---|---|
| `pending_balance` | `carryIn` |
| `balance_hours` | `weeklyBalance` (saldo neto de la semana) |
| `final_balance` | `balanceFinal` |
| `total_hours` | `hoursWorked` |
| `ordinary_hours` | `ordinaryHours` |
| `extra_hours` | `overtimeHours` |
| `contracted_hours_snapshot` | `contractedHoursEffective` |
| `total_cost` | `estimatedValue` (Cost Engine) |

> Nota: el **footer UI “Extras”** puede ser una proyección de display (`extrasFooter`) distinta de `extra_hours` bruto; ver invariantes Punto 4. La columna SQL `extra_hours` almacena el **resultado de liquidación** `overtimeHours`, no la reinterpretación de UI.

#### Metadata

| Campo / concepto | Clase |
|---|---|
| `created_at` / `updated_at` (si existen) | metadata |
| origen de escritura / versión de motor (recomendado añadir en implementación futura) | metadata de proyección |

---

# PUNTO 3 — Semilla (opening carry)

### Política oficial (global)

**A) Todo empleado comienza con `carryIn = 0` en el lunes de inicio de timeline del dominio.**

Definición de timeline:

```text
timelineStart = mondayOnOrBefore( min(joining_date, min(terms.effective_from)) )
openingCarryIn(timelineStart) = 0
```

### Justificación

1. **Global**: misma regla para todos; cero excepciones por trabajador.  
2. **Cierra la doble cadena**: el gap Pere nace de deuda SQL **pre-alta**; fuera del dominio laboral post-alta.  
3. **Alineada al HE actual** (`resolveOpeningCarryIn` arranca en 0).  
4. **Auditable**: no hay semilla implícita en snapshots huérfanos previos.  
5. **B** (openingCarry explícito) se **rechaza como política v1**: introduce un segundo hecho histórico que hoy no está modelado de forma uniforme y reabre excepciones disfrazadas de datos.

Si en el futuro el negocio exige heredar banco pre-alta, será un **ADR nuevo** que introduzca un hecho de dominio explícito para *todos* (default 0), no un if por empleado ni un segundo motor SQL.

### Consecuencia para Pere

Tras regenerar proyección con política A, la cadena SQL pre-`2025-09-01` **deja de alimentar** el dominio. El gap −5,5 h desaparece por reconstrucción, no por parche.

---

# PUNTO 4 — Invariantes del dominio

Notación: semana `W`, siguiente `W+1`. Redondeo Marbella `R(·)` (solo .0 / .5) aplicado a saldos firmados donde corresponda.

### Cadena / carry

| ID | Invariante |
|---|---|
| INV-C01 | `carryIn(timelineStart) = 0` |
| INV-C02 | `carryIn(W+1) = carryOut(W)` |
| INV-C03 | `balanceFinal(W) = R(carryIn(W) + weeklyBalance(W))` |
| INV-C04 | `carryOut(W) = computeCarry(carryIn, parts, isPaid).carryOut` |
| INV-C05 | Si `balanceFinal ≤ 0` y no pagada: `carryOut = balanceFinal` |
| INV-C06 | Si `isPaid = true`: `carryOut = min(0, balanceFinal)` |
| INV-C07 | Si régimen **pago puro** y `balanceFinal > 0` y no pagada: `carryOut = 0` |
| INV-C08 | Si régimen **bolsa pura** y `balanceFinal > 0` y no pagada: `carryOut = balanceFinal` |
| INV-C09 | Deuda nunca se “paga”: `carryOut ≤ 0` cuando `balanceFinal ≤ 0` |
| INV-C10 | ≤ 1 tramo abierto por empleado; sin huecos ni solapes en `hours_contract_terms` |

### Liquidación semanal

| ID | Invariante |
|---|---|
| INV-L01 | `hoursWorked = Σ horas computables de la semana (hechos)` |
| INV-L02 | `weeklyBalance = Σ weeklyBalancePart(segmentos)` |
| INV-L03 | `ordinaryHours + overtimeHours` coherente con régimen/contrato efectivo |
| INV-L04 | Días `pre_alta` / `post_baja` no aportan jornada ordinaria de contrato |
| INV-L05 | Determinismo: mismos hechos + mismos flags ⇒ mismo `LiquidationResult` |

### Preferencia bolsa / payable / display

| ID | Invariante |
|---|---|
| INV-P01 | `effectivePreferStock = override ?? (todos los segmentos bagMode)` |
| INV-P02 | `netPayable = f(LiquidationResult, effectivePreferStock)` (única función) |
| INV-P03 | Si `carryOut < 0` ⇒ `displayExtras = 0` |
| INV-P04 | Si `carryOut < 0` ⇒ `estimatedValue = 0` |
| INV-P05 | Si `effectivePreferStock` y `netPayable = 0` ⇒ `estimatedValue = 0` |
| INV-P06 | `displayPendientes = carryIn` |
| INV-P07 | `displayHoras = hoursWorked` |

### Coste

| ID | Invariante |
|---|---|
| INV-$01 | `estimatedValue = priceWeekOvertime(...)` únicamente |
| INV-$02 | `weekly_snapshots.total_cost ≡ estimatedValue` tras persist Cost |
| INV-$03 | SQL **no** calcula dinero |

### Proyección

| ID | Invariante |
|---|---|
| INV-J01 | Tras writer: `pending_balance = carryIn` |
| INV-J02 | Tras writer: `final_balance = balanceFinal` |
| INV-J03 | Tras writer: `balance_hours = weeklyBalance` |
| INV-J04 | Tras writer: `ordinary_hours / extra_hours / total_hours / contracted_hours_snapshot` = campos HE |
| INV-J05 | Shadow post-cutover: vector HE ≡ proyección (identidad), no “dos motores” |

### Tests automáticos obligatorios

| Suite | Invariantes |
|---|---|
| Unit `computeCarry` | INV-C03–C09 |
| Unit `liquidateWeek` / gate | INV-L01–L05, INV-C02 en cadenas cortas |
| Unit opening | INV-C01, INV-C02 |
| Unit week-card / cost | INV-P01–P07, INV-$01, INV-$03 |
| Persist / read-model proyección | INV-J01–J04, INV-$02 |
| Shadow identidad (post Fase 4) | INV-J05 |

---

# PUNTO 5 — Prohibiciones arquitectónicas

1. React **nunca** calcula negocio (carry, extras, importe, bolsa, payable).  
2. React **solo** pinta DTOs finales.  
3. Read Models **nunca** reinterpretan horas ni re-derivan extras/importe desde columnas “a ojo”.  
4. Read Models **solo** proyectan filas de `weekly_snapshots` (+ joins de presentación: relojes, nombres).  
5. Server Actions de **lectura** **nunca** llaman a `liquidateWeek` / `resolveOpeningCarryIn` / Cost Engine.  
6. Server Actions de **escritura** pueden orquestar HE → persist; **no** inventar fórmulas propias.  
7. SQL / `fn_recalc` **nunca** liquida semanas (ni carry, ni ordinary/OT, ni dinero).  
8. `weekly_snapshots` **nunca** vuelve a ser productor.  
9. Ningún dashboard / modal / WeekCard implementa reglas de bolsa/deuda.  
10. Ningún DTO “enriquece” calculando `extras = max(0, hours - contract)` en capa UI.  
11. Cost Engine **no** vive en SQL.  
12. No existen dos cadenas históricas concurrentes.  
13. No hay excepciones por `user_id` / email en reglas de carry.  
14. Shadow **no** compara dos motores tras el cutover; solo HE ↔ proyección.  
15. Imports / cron / triggers **no** pueden escribir resultados de liquidación sin pasar por el writer HE.  
16. Prohibido “arreglar” divergencias parcheando solo la UI.

---

# PUNTO 6 — Responsabilidades por capa

| Capa | Puede | Prohibido |
|---|---|---|
| **Hechos** (`time_logs`, terms, joining/end, flags) | Representar realidad operativa | Contener balances calculados |
| **Hours Engine** | Único cálculo de carry/balances/ordinary/OT/payable/display footer horas | Escribir UI; calcular €; leer “verdad” desde snapshot como input de liquidación (salvo flags) |
| **Cost Engine** | Único `estimatedValue` / pricing OT | Calcular horas/carry; vivir en SQL |
| **Persistencia / Writer** | Orquestar HE(+Cost) → UPSERT proyección | Fórmulas propias de liquidación |
| **`weekly_snapshots`** | Almacenar proyección + overrides | Calcular |
| **Read Models** | Leer proyección → ensamblar DTO | `liquidateWeek`, reinterpretar bolsa/carry |
| **DTO** | Contratos de pintura | Derivaciones de negocio |
| **React** | Render + capturar hechos (fichaje, toggles) vía actions | Cualquier lógica de liquidación |
| **SQL** | RLS, integridad, almacenamiento, RPCs de orquestación delgadas | `fn_recalc` como motor de liquidación |
| **Cron** | Disparar writer HE / persist | Liquidar en SQL |
| **Server Actions** | Auth, validar input, llamar writer o read-model | Duplicar `computeCarry` / pricing |

---

# PUNTO 7 — Plan de migración (revisado)

| Fase | Contenido |
|---|---|
| **0** | Congelar ADR + política semilla **A** (este documento) |
| **0b** | **Contrato de proyección**: mapa columna ↔ campo HE; versión de motor en escritura |
| **1** | Writer único HE(+Cost) → `weekly_snapshots` |
| **1b** | Cablear todos los *write paths* (fichaje, toggle paid, contrato, import, cron) al writer; dejar de llamar motor SQL |
| **2** | Backfill total desde `timelineStart` (carry 0) |
| **2b** | Gate de paridad: muestra + plantilla completa HE vs proyección = identidad |
| **3** | Eliminar/neutralizar productor SQL (`fn_recalc` sin liquidación) |
| **3b** | Cortar read-path HE en caliente: Read Model **solo** proyección (quitar HE en load) |
| **4** | Shadow = identidad HE ↔ proyección |
| **5** | Retirada: código muerto SQL liquidación, docs legacy “SQL SSOT”, prohibiciones en CI/review |

No hay fase de “convivencia permanente”. La ventana dual es solo hasta completar **3b**.

---

# PUNTO 8 — Criterios de aceptación (arquitectura)

La migración se da por **cerrada** solo si se cumplen **todos**:

1. Existe **un único productor** de liquidación: Hours Engine.  
2. Existe **un único algoritmo de carry**: `computeCarry`.  
3. Existe **una única cadena histórica** por empleado, con `openingCarryIn(timelineStart) = 0`.  
4. `weekly_snapshots` es **únicamente** proyección persistida (+ overrides).  
5. Toda la UI consume **exclusivamente** DTOs derivados de la **proyección** (no HE en read).  
6. No existen reglas duplicadas de extras/importe/bolsa en React, SQL ni read-models.  
7. Dinero OT solo vía Cost Engine; SQL no calcula `total_cost`.  
8. Shadow compara **identidad** HE ↔ proyección, no dos motores.  
9. Cron / fichaje / contrato / import escriben **solo** vía writer HE.  
10. `fn_recalc` **no** implementa liquidación (o no existe como motor).  
11. Cero excepciones por empleado en código de carry.  
12. Invariantes INV-C/L/P/$/J tienen tests automatizados en verde.  
13. Documentación operativa deja de llamar “SSOT” a `fn_recalc` / columnas crudas como motor.

---

## Consecuencias

### Positivas

- Fin de la doble verdad (−29,5 vs −35).  
- Lecturas rápidas y auditables.  
- Alineación con Cost Engine y con la regla “pantallas sin negocio”.

### Negativas / costes

- Backfill obligatorio y ventana de cutover.  
- Pere (y cualquiera con deuda SQL pre-alta) **pierde** esa semilla al regenerar con política A — es decisión de dominio, no bug.  
- Hasta Fase 3b, el sistema puede seguir mostrando HE-en-read (deuda); no es estado final.

### No negociable

Cualquier PR que reintroduzca cálculo de carry/balances/OT/importe fuera del Hours Engine / Cost Engine **viola este ADR**.

---

## Resolución

| Pregunta | Resolución |
|---|---|
| SSOT | **Hours Engine** |
| Lectura oficial | **Hechos → HE (write) → `weekly_snapshots` → Read Model → DTO → UI** |
| `weekly_snapshots` | **C) Proyección persistida** |
| Semilla | **A) carry = 0 en timelineStart** |
| Doble cadena | **Eliminada** tras plan Fases 0–5 |

---

## Estado del documento

**CONGELADO** como especificación oficial del cierre SSOT.  
Siguiente paso de implementación: **Fase 0b** (contrato de proyección), solo tras orden explícita de ejecución.
