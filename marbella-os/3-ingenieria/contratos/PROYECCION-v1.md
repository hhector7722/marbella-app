---
documento: CONTRATO-PROYECCION-v1
clase: inmutable
estado: vigente
capa: ingenieria
responsable: propiedad del producto
publicado: 2026-07-27
revisado: 2026-07-29
supersede: docs/PROJECTION_CONTRACT_v1.md
---

# Contrato de proyección semanal · v1

> **Nota de reconciliación (2026-07-29).** El documento original se quedó marcado como «propuesto para aprobación», pero el escritor que implementa este contrato **está en producción y es el único productor de las columnas calculadas** desde el 27 de julio de 2026: se cablearon todos los flujos y se desconectaron los productores SQL residuales, incluido el motor de cierre semanal.
>
> El estado real es **vigente**, no propuesto. La divergencia era un residuo de la forma antigua de documentar, donde el estado de un documento se escribía a mano y nadie lo volvía a tocar. Es exactamente el problema que el [front-matter obligatorio](../../CANON.md) viene a resolver.
>
> **Este contrato es inmutable.** Un cambio de comportamiento exige una versión 2, no una edición de esta página.

| Campo | Valor |
|---|---|
| Estado original del documento | «PROPUESTO PARA APROBACIÓN» — corregido arriba |
| Fecha | 2026-07-27 |
| Fase ADR | **0b — Contrato de proyección** |
| Norma superior | [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md) |
| Skills | `architect-horas-nominas`, `auditor-horas-nominas`, `db-supabase-master` |
| Alcance | Contrato funcional Hours Engine + Cost Engine → Writer → `weekly_snapshots` |
| Fuera de alcance | Código, migraciones, columnas físicas nuevas, writer, backfill |

---

## 0. Propósito

Este documento es la **única referencia válida** para implementar el **Writer único** (Fase 1).

Materializa el ADR-HE-SSOT-001 sin rediseñar arquitectura, sin cambiar invariantes ni decisiones de dominio.

```text
Hechos + overrides
  → Hours Engine (+ Cost Engine)
  → Writer (único orquestador de persistencia)
  → weekly_snapshots (proyección persistida)
```

---

# PUNTO 1 — Mapeo completo

### 1.1 Magnitudes del Hours Engine → columnas existentes

| Origen (dominio) | Columna `weekly_snapshots` | Responsable de escritura | Observaciones |
|---|---|---|---|
| `LiquidationResult.employeeId` | `user_id` | Writer | Identidad; no calculada |
| `LiquidationResult.weekStart` | `week_start` | Writer | Lunes ISO; identidad del periodo |
| `LiquidationResult.weekEnd` | `week_end` | Writer | Derivado del lunes de la semana (HE ya lo expone); coherente con `week_start` |
| `LiquidationResult.carryIn` | `pending_balance` | Writer (valor producido por HE) | Resultado calculado. INV-J01 |
| `LiquidationResult.weeklyBalance` | `balance_hours` | Writer (valor producido por HE) | Saldo neto de la semana. INV-J03. **No** es el footer UI `displayExtras` |
| `LiquidationResult.balanceFinal` | `final_balance` | Writer (valor producido por HE) | INV-J02 |
| `LiquidationResult.hoursWorked` | `total_hours` | Writer (valor producido por HE) | INV-J04 |
| `LiquidationResult.ordinaryHours` | `ordinary_hours` | Writer (valor producido por HE) | INV-J04 |
| `LiquidationResult.overtimeHours` | `extra_hours` | Writer (valor producido por HE) | Bruto de liquidación. INV-J04. Distinto de `extrasFooter` de display |
| `LiquidationResult.contractedHoursEffective` | `contracted_hours_snapshot` | Writer (valor producido por HE) | INV-J04 |
| `LiquidationResult.isPaid` | *(no sobrescribe `is_paid`)* | — | `is_paid` es **input** administrativo; el HE lo **consume**, no lo inventa. El Writer **no** escribe `is_paid` desde el resultado salvo que el proceso administrativo lo actualice por su propio canal |
| `LiquidationResult.carryOut` | *(sin columna propia)* | Nadie en esta fila | Se materializa como `pending_balance` de **W+1** al persistir la semana siguiente. INV-C02 |
| `LiquidationResult.segments` | *(no persistidos)* | Nadie | Efímeros; regenerables |
| `LiquidationResult.dailyBreakdown` | *(no persistido en `weekly_snapshots`)* | Nadie | Presentación diaria vía `time_logs` + read-model; fuera de este contrato de fila semanal |

### 1.2 Cost Engine → columnas existentes

| Origen (dominio) | Columna `weekly_snapshots` | Responsable de escritura | Observaciones |
|---|---|---|---|
| `PriceWeekOvertimeResult.estimatedValue` | `total_cost` | Writer (valor producido por Cost Engine) | INV-$01, INV-$02. SQL no calcula dinero |

### 1.3 Inputs administrativos (no salen del HE)

| Origen | Columna `weekly_snapshots` | Responsable de escritura | Observaciones |
|---|---|---|---|
| Proceso administrativo / UI de negocio | `is_paid` | Proceso administrativo | Hecho de proceso; input al HE. INV-J07 |
| Proceso administrativo / UI de negocio | `prefer_stock_hours_override` | Proceso administrativo | Override bolsa/pago; null = contrato. INV-J07 |
| Proceso administrativo / UI de negocio | `overtime_price_snapshot` | Proceso administrativo | Override €/h; null = contrato. INV-J07 |

### 1.4 Identidad / sistema

| Origen | Columna `weekly_snapshots` | Responsable de escritura | Observaciones |
|---|---|---|---|
| Sistema (PK) | `id` | Sistema | UUID de fila; no es magnitud de liquidación |
| Sistema / Writer | `created_at` | Sistema (o Writer en primer insert) | Metadata temporal de creación de fila |

### 1.5 Metadata de generación (contrato conceptual — aún sin columnas físicas obligatorias)

El ADR exige trazabilidad. Este contrato define los **conceptos**; la materialización física es decisión de implementación Fase 1 (sin fijar nombres aquí).

| Concepto lógico | Columna física | Responsable | Observaciones |
|---|---|---|---|
| Versión Hours Engine | *a materializar* | Writer | Metadata; nunca dominio |
| Versión Cost Engine | *a materializar* | Writer | Metadata; nunca dominio |
| Versión de proyección / contrato | *a materializar* | Writer | Identifica PROJECTION CONTRACT v1 (o sucesor) |
| Proceso generador | *a materializar* | Writer | writer / cron / import / backfill / recalc |
| Instantánea de generación | *a materializar* (puede reutilizar/ampliar `created_at` o campo de regeneración) | Writer | Cuándo se escribió/regeneró |

Hasta materializar metadata, la Fase 1 **no** puede considerarse trazable al 100 % según criterios 14–16 del ADR; el writer debe incluir el plan de metadata en el mismo corte o en el inmediato siguiente acordado, **sin** alterar el dominio.

### 1.6 Magnitudes HE explícitamente fuera de la proyección semanal

| Magnitud | ¿Se persiste en `weekly_snapshots`? | Motivo |
|---|---|---|
| `carryOut` | No (como columna de W) | Va a `pending_balance` de W+1 |
| `netPayable` | No | Derivado; Cost Engine lo consume en el write |
| `estimatedValue` | Sí → `total_cost` | Única magnitud monetaria |
| `displayExtras` / `extrasFooter` | No | Regla de display (INV-P03); se deriva en Read Model / DTO desde resultados + flags, **sin** re-liquidar |
| `displayPendientes` | No | Alias de `pending_balance` en DTO |
| `effectivePreferStock` | No | Se resuelve en liquidación/display a partir de override + segmentos |

---

# PUNTO 2 — Clasificación (una categoría por columna)

Columnas **físicas actuales** de `weekly_snapshots`:

| Columna | Categoría | Justificación |
|---|---|---|
| `id` | **A) Hecho de identidad** | Clave técnica de fila |
| `user_id` | **A) Hecho de identidad** | Empleado |
| `week_start` | **A) Hecho de identidad** | Periodo (lunes) |
| `week_end` | **A) Hecho de identidad** | Periodo (fin de semana ISO); determinado por `week_start`, no por liquidación de negocio |
| `is_paid` | **B) Hecho administrativo (input)** | Flag de proceso; entrada al HE |
| `prefer_stock_hours_override` | **B) Hecho administrativo (input)** | Override; entrada al HE |
| `overtime_price_snapshot` | **B) Hecho administrativo (input)** | Override de tarifa; entrada al Cost Engine / HE pricing |
| `pending_balance` | **C) Resultado calculado** | `carryIn` |
| `balance_hours` | **C) Resultado calculado** | `weeklyBalance` |
| `final_balance` | **C) Resultado calculado** | `balanceFinal` |
| `total_hours` | **C) Resultado calculado** | `hoursWorked` |
| `ordinary_hours` | **C) Resultado calculado** | `ordinaryHours` |
| `extra_hours` | **C) Resultado calculado** | `overtimeHours` |
| `contracted_hours_snapshot` | **C) Resultado calculado** | `contractedHoursEffective` |
| `total_cost` | **C) Resultado calculado** | `estimatedValue` |
| `created_at` | **D) Metadata** | Instantánea de creación de fila |

**Dudas resueltas:**

- `week_end`: identidad de periodo (A), no resultado de liquidación.  
- `contracted_hours_snapshot`: aunque refleja contrato efectivo, el valor **escrito** es el del HE tras resolver tramos/frontera → **C**.  
- `overtime_price_snapshot`: es input de pricing, no el importe → **B**, no C.  
- `created_at`: no entra en liquidación → **D**.

---

# PUNTO 3 — Autoridad de escritura

| Columna | Quién puede escribir | Prohibido |
|---|---|---|
| `id` | **Sistema** (default DB) | Cualquier lógica de negocio |
| `user_id` | **Writer** (al crear fila de proyección) | React; SQL motor de liquidación; HE directo a BD |
| `week_start` | **Writer** | Idem |
| `week_end` | **Writer** | Idem |
| `is_paid` | **Proceso administrativo** | HE; Cost Engine; Writer de liquidación (salvo orquestación que solo reenvía el hecho ya decidido administrativamente) |
| `prefer_stock_hours_override` | **Proceso administrativo** | HE; Cost Engine; Writer de liquidación como inventor del valor |
| `overtime_price_snapshot` | **Proceso administrativo** | HE; Cost Engine; Writer inventando tarifa |
| `pending_balance` | **Writer** (valor de HE) | SQL `fn_recalc`; React; Read Model; Cost Engine |
| `balance_hours` | **Writer** (valor de HE) | Idem |
| `final_balance` | **Writer** (valor de HE) | Idem |
| `total_hours` | **Writer** (valor de HE) | Idem |
| `ordinary_hours` | **Writer** (valor de HE) | Idem |
| `extra_hours` | **Writer** (valor de HE) | Idem |
| `contracted_hours_snapshot` | **Writer** (valor de HE) | Idem |
| `total_cost` | **Writer** (valor de Cost Engine) | SQL; React; HE (HE no escribe €) |
| `created_at` | **Sistema** / Writer en insert | Lógica de liquidación |
| Metadata conceptual (versiones, proceso, generated_at) | **Writer** | Dominio HE/Cost como input; React |

**Regla:** ningún otro escritor. En particular, **`fn_recalc_and_propagate_snapshots` queda prohibido** como escritor de columnas **C** tras el cutover (Fase 3).

---

# PUNTO 4 — Autoridad de lectura

| Columna | Consumidores autorizados | Prohibido |
|---|---|---|
| Todas las de dominio (A/B/C) | **Read Models** → DTO → pantallas (History, Overtime, Dashboard, Labor, Insights, Exports, Reports) | **React directo** a Supabase para interpretar negocio |
| Resultados C + identidad A | Auditoría; Shadow (identidad HE↔proyección) | Recalcular en el cliente |
| Overrides B | Read Models (para pintar estado); Writer (como **input** al HE en el write-path) | Inventar defaults en React |
| Metadata D | Auditoría; operaciones; diagnóstico | UI de negocio ordinaria (salvo vistas de auditoría explícitas) |

**Nunca React directamente** como autoridad de lectura de negocio: solo consume DTOs del Read Model.

---

# PUNTO 5 — Contrato de escritura del Writer

### Entradas

1. Identidad: `user_id`, `week_start` (lunes) o rango de lunes a proyectar.  
2. Hechos de asistencia: `time_logs` del horizonte necesario.  
3. Contrato: `hours_contract_terms`.  
4. Frontera: `joining_date`, `end_date`.  
5. Overrides de las semanas afectadas: `is_paid`, `prefer_stock_hours_override`, `overtime_price_snapshot` (ya persistidos o suministrados por el proceso administrativo).  
6. Semilla: `openingCarryIn(timelineStart) = 0` (ADR).  
7. Contexto de proceso: tipo de writer (cron, fichaje, import, backfill, recalc) para metadata.

### Salidas

1. Filas de `weekly_snapshots` con columnas **C** actualizadas según mapeo §1.  
2. Metadata de generación actualizada (cuando exista materialización).  
3. **No** modifica hechos `time_logs` ni tramos.  
4. **No** inventa overrides (B).

### Precondiciones

- `week_start` es lunes ISO.  
- Empleado existe; timeline resoluble (INV-C01).  
- Tramos cumplen INV-C10 (sin huecos/solapes; ≤1 abierto).  
- Overrides de las semanas a escribir están disponibles (INV-J07).  
- Cadena de carry desde `timelineStart` hasta el horizonte solicitado es calculable.  
- Hours Engine y Cost Engine producen resultados finitos y determinados.

### Postcondiciones

- Para cada semana escrita: INV-J01…J04 y INV-$02.  
- Cadena: INV-C02 entre semanas consecutivas persistidas.  
- Determinismo: INV-D01 respecto a hechos + overrides + versiones de motor usadas.  
- Overrides B intactos salvo que el mismo proceso administrativo los haya cambiado en una operación explícita distinta.  
- Metadata refleja proceso y versiones (cuando esté materializada).

### Invariantes a verificar **antes** del commit

- INV-C01, INV-C02 (sobre la cadena en memoria), INV-C03–C09 aplicables al `LiquidationResult`.  
- INV-L01–L05.  
- INV-P04 / INV-$01 coherencia: si `carryOut < 0` ⇒ `estimatedValue = 0`.  
- INV-J01–J04 en el payload a persistir.  
- INV-J07: no se pierden overrides al UPSERT de resultados.  
- Fallo de cualquier invariante ⇒ **abortar escritura** (§9).

---

# PUNTO 6 — Idempotencia

### Definición

El Writer es **idempotente** respecto a los **resultados calculados (C)** y a la **identidad (A)** cuando:

```text
mismos hechos
+ mismos overrides (B)
+ misma versión Hours Engine
+ misma versión Cost Engine
+ mismo contrato de proyección
⇒ mismos valores en columnas C (y A) tras N ejecuciones
```

### Condiciones

1. Misma frontera temporal y mismos logs/tramos.  
2. Mismos overrides leídos como input.  
3. Mismas versiones de motor (INV-D01).  
4. UPSERT por clave natural (`user_id`, `week_start`), no inserts duplicados de periodo.

### Qué **no** puede cambiar entre dos ejecuciones idempotentes

- Columnas **C** (resultados).  
- Columnas **A** de periodo (`user_id`, `week_start`, `week_end`).  
- Columnas **B** (el Writer de liquidación no las altera).

### Qué **sí** puede cambiar

- Metadata **D** (instante de regeneración, proceso, contadores de write).  
- `id` / `created_at` solo en el **primer** insert de la fila; en re-runs posteriores la identidad de fila se conserva.

---

# PUNTO 7 — Versionado (modelo conceptual)

Sin decidir columnas físicas.

| Concepto | Qué identifica | Capa |
|---|---|---|
| Versión Hours Engine | Build/semver/fingerprint del motor que produjo horas/carry | Metadata |
| Versión Cost Engine | Build/semver/fingerprint del motor que produjo `total_cost` | Metadata |
| Versión de proyección | Este contrato: **PROJECTION CONTRACT v1** (o sucesor versionado) | Metadata |
| Proceso generador | Origen del write: `writer` / `cron` / `import` / `backfill` / `recalc` / … | Metadata |

**Nunca** como dominio: no entran en `liquidateWeek`, `computeCarry` ni `priceWeekOvertime` (INV-J08).

---

# PUNTO 8 — Validación pre-persistencia

El Writer debe validar, como mínimo:

1. Timeline resoluble; `timelineStart` definido; apertura 0 (INV-C01).  
2. `week_start` lunes; `week_end` coherente.  
3. Tramos: sin solapes, sin huecos, ≤1 abierto (INV-C10).  
4. Frontera employment coherente con tramos.  
5. Overrides presentes o explícitamente null según semántica.  
6. `LiquidationResult` completo y numéricamente finito.  
7. Invariantes de carry del resultado (INV-C03–C09 aplicables).  
8. Cadena `carryOut(W) → carryIn(W+1)` en el batch.  
9. Resultado Cost Engine finito; INV-P04 / INV-$01–$02.  
10. Payload de columnas C alineado al mapeo §1 (INV-J01–J04).  
11. No se pisan overrides B en el UPSERT de resultados.  
12. (Cuando exista) metadata de versiones y proceso completa.

---

# PUNTO 9 — Errores que impiden escribir

Cualquiera de estas situaciones **aborta** el commit de proyección (sin escritura parcial silenciosa de resultados C):

1. Timeline inconsistente o sin ancla.  
2. Segmentos/tramos solapados o con huecos.  
3. `LiquidationResult` inválido / incompleto / no finito.  
4. Violación de invariantes INV-C / INV-L / INV-P / INV-$ / INV-J / INV-D aplicables.  
5. Cost Engine no produce `estimatedValue` válido cuando debería.  
6. `estimatedValue > 0` con `carryOut < 0`.  
7. Overrides requeridos ausentes de forma que haría regeneración no trazable (INV-J07).  
8. Horizonte de escritura que rompería la cadena de carry (hueco de semanas no calculadas cuando el batch las requiere).  
9. Intento de escribir columnas C desde un camino que no sea el Writer único.

Política: **fallar ruidoso** (error visible / log crítico); no dejar proyección a medias sin señal.

---

# PUNTO 10 — PROJECTION CONTRACT v1 (síntesis)

### Propósito

Definir el contrato oficial de proyección persistida semanal: qué se escribe, quién escribe, qué se garantiza y qué queda fuera, para implementar el Writer único de la Fase 1 sin reinterpretar el ADR.

### Entradas

Hechos (`time_logs`, `hours_contract_terms`, frontera), overrides administrativos, semilla `carryIn=0` en `timelineStart`, identidad de semanas a proyectar, contexto de proceso.

### Salidas

Filas `weekly_snapshots` con resultados C (+ metadata cuando esté materializada). Overrides B intactos. Sin efectos colaterales en hechos de asistencia/contrato.

### Responsabilidades

| Actor | Responsabilidad |
|---|---|
| Hours Engine | Calcular vector de liquidación |
| Cost Engine | Calcular `estimatedValue` |
| Writer | Validar, orquestar, mapear, UPSERT, metadata; único escritor de C |
| Proceso administrativo | Escribir/actualizar B |
| Read Model | Leer proyección → DTO |
| React | Pintar DTOs |

### Garantías

- Un solo productor de C: HE(+Cost) vía Writer.  
- Idempotencia de C bajo INV-D01.  
- Regenerabilidad de C con preservación de B (INV-J06/J07).  
- Trazabilidad vía metadata (cuando materializada).  
- Abort on invariant failure.

### Limitaciones

- No persiste `carryOut`, `segments`, `dailyBreakdown`, `netPayable`, `displayExtras`.  
- No es SSOT de overrides (B son hechos).  
- No liquida en SQL.  
- Metadata física aún no fijada en este contrato (concepto sí).  
- Display footer de extras se resuelve en Read Model/DTO **sin** re-ejecutar HE en lectura (post Fase 3b).

### Invariantes asociados

INV-C01–C10, INV-L01–L05, INV-P01–P07 (display post-proyección), INV-$01–$04, INV-D01, INV-J01–J08.

### Relación con el ADR

Este contrato es **subordinado** a ADR-HE-SSOT-001.  
Si hubiera conflicto, **prevalece el ADR**.  
Este documento **no** modifica el ADR; solo lo operacionaliza para Fase 1.

---

## Estado

**PROJECTION CONTRACT v1** listo para **aprobación** como contrato oficial de implementación del Writer (Fase 1).

No incluye código, SQL, migraciones ni tests.  
No inicia el Writer.  
No modifica ADR-HE-SSOT-001.
