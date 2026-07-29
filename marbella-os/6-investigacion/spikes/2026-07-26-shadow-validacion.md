---
documento: SPIKE-SHADOW-VALIDACION
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-07-26
caducidad: no aplica
supersede: —
---

# Shadow Validation Report

> **MATERIAL NO NORMATIVO — SPIKE-SHADOW-VALIDACION**
>
> Esto es un análisis fechado el 2026-07-26, no una norma. **No autoriza ninguna decisión** y puede describir un sistema que ya no existe.
>
> La norma vigente vive en `marbella-os/`; la jerarquía que la ordena, en `marbella-os/CANON.md`. Ante cualquier discrepancia gana el documento normativo, sin discusión.

**Proyecto:** Bar La Marbella — migración SSOT Hours Engine  
**Skill:** `auditor-horas-nominas`  
**Fuente de evidencia (baseline):** Shadow Run `7e73bfc9-cab8-41dc-9820-2eabaee47031`  
**Fuente post Iteración A:** Shadow Run `3ade336a-d3f3-477a-a0ac-0ac995a96a57`  
**Fuente post Iteración B:** Shadow Run `a4db4f3e-b50b-4a15-b160-6e2af5f9168b`  
**Fuente post fix adaptador SQL:** Shadow Run `bfdb100b-b347-4ec6-83ac-23056a30bdac`  
**Fuente post fix Bali:** Shadow Run `4b0b3a55-40dc-4622-8dbc-a21e1efa1065`  
**Horizonte:** semana `2026-07-20` (17 sujetos plantilla visible)  
**Fecha del informe:** 2026-07-24 (actualizado: corrección bug Bali)  
**Alcance:** auditoría + convergencia por iteraciones. Sin cron/dashboard/alertas (8B bloqueado).

---

## 0. Changelog de convergencia

### Corrección del bug Bali (COMPLETADA)

| Métrica | Antes (`bfdb100b`) | Después (`4b0b3a55`) | Δ |
|---------|--------------------|----------------------|---|
| EMR | 82,35% (14/17) | **88,24% (15/17)** | **+5,89 pp** |
| CDR | 17,65% | **11,76%** | **−5,89 pp** |
| Exact | 14 | **15** | +1 |
| Diff | 3 | **2** | −1 |
| Field diffs | 10 | **6** | −4 |

| Campo | Contenido |
|-------|-----------|
| **Causa raíz** | Fence de baja parcial usaba `profiles.contracted_hours_weekly` (0 tras cierre) en lugar de `hours_contract_terms`. |
| **Corrección** | Semana parcial: `sum(round_marbella(días_tramo/7 × weekly_hours))` desde tramos, días ≤ `end_date`. |
| **Migración** | `20260724120000_shadow_bali_fence_contract_terms.sql` (**aplicada**). |
| **Evidencia** | Bali W2026-06-29: SQL `contracted=1`, `final=-1` (antes 0/0). W20 → exact. |
| **Regresiones** | **0**. Fernando exact. Héctor/Pere intactos (política / semilla). |
| **Tests** | shadow **42/42**. |
| **Estado SSOT** | Productor SQL **técnicamente convergido**. Pendiente: decisión semilla Pere. |

Detalle: [`SHADOW_RESIDUAL_ANALYSIS.md`](SHADOW_RESIDUAL_ANALYSIS.md) § Corrección del bug Bali.

### Validation Gate — Revisión Final (COMPLETADA — solo diagnóstico; Bali luego corregido)

| Caso | Veredicto al gate | Estado post-fix |
|------|-------------------|------------------|
| Héctor | Regla de negocio validada | Sin cambio |
| Pere | Decisión funcional (semilla) | Sin cambio |
| Bali | Bug SQL | **Corregido** (`4b0b3a55-…`) |
| Fernando | Cerrado (adaptador) | Exact |

**Conclusión actual:** **B** — SSOT técnicamente convergido; única decisión funcional = semilla Pere. Sin bugs abiertos.

### Corrección del adaptador SQL del Shadow (COMPLETADA)

| Métrica | Antes (a4db4f3e / post-B) | Después (bfdb100b) | Δ |
|---------|---------------------------|--------------------|---|
| EMR | 76,47% (13/17) | **82,35% (14/17)** | **+5,88 pp** |
| CDR | 23,53% | **17,65%** | **−5,88 pp** |
| Exact | 13 | **14** | +1 |
| Diff | 4 | **3** | −1 |
| Field diffs | 11 | 10 | −1 |
| Top D00x | D002×7, D005×2, D003, D001 | D002×6, D005×2, D003, D001 | −1 D002 |

| Campo | Contenido |
|-------|-----------|
| **Causa raíz** | SQL-adapter mapeaba `carryOut ← final_balance` y `balanceFinal ← final_balance`, colapsando saldo semanal y arrastre a W+1. |
| **Mapeo incorrecto** | `carryOut = final_balance` |
| **Mapeo correcto** | `balanceFinal ← final_balance`; `carryOut ←` proyección de la regla SQL de `pending` de la semana siguiente (crédito solo si Bolsa ∧ ¬pagada; deuda siempre). Función `projectSqlCarryOut`. |
| **Evidencia** | Fernando W20: HE `balanceFinal=16`/`carryOut=0`; SQL `final=16`/`pending W+1=0`; adaptador antes `carryOut=16`. |
| **Impacto** | Fernando **diff → exact**. Julia y Mamadou **siguen exact** en W20 (el patrón Pago se demostró en otras semanas; no estaban en el set diff post-B). |
| **Nuevas discrepancias** | **0**. Restan Héctor, Pere, Bali. |
| **Dominio** | SQL / HE / snapshots **sin cambios**. Solo `src/lib/shadow/adapters/sql-adapter.ts`. |
| **Tests** | shadow adapters + suite **42/42**. |

### Iteración C — manager=40 / jornada fija (DESCARTADA)

| Campo | Contenido |
|-------|-----------|
| **Estado** | **No implementar.** Criterio funcional sustituye la lectura “BUG SQL”. |
| **Política** | [`context/POLITICA_JORNADA_FIJA_HECTOR.md`](context/POLITICA_JORNADA_FIJA_HECTOR.md) — solo `hhector7722@gmail.com`: 40 h ordinarias/semana + fichajes = extras. |
| **Héctor** | Reclasificado a **Regla de negocio**. Comportamiento SQL actual = referencia. |
| **Acoplamiento** | Hoy SQL usa `manager\|fixed`; la política es por **usuario**, no por rol. Evolución futura (`FIXED_WEEK`); sin cambio ahora. |
| **Migración** | Borrador `20260724100000_…` **no aplicado** y **retirado** del repo. |

### Iteración B — end_date (COMPLETADA)

| Métrica | Antes (3ade336a / post-A) | Después (a4db4f3e) | Δ |
|---------|---------------------------|--------------------|---|
| EMR | 52,94% (9/17) | **76,47% (13/17)** | **+23,53 pp** |
| CDR | 47,06% | **23,53%** | **−23,53 pp** |
| Exact | 9 | **13** | +4 |
| Diff | 8 | **4** | −4 |
| Field diffs | 31 | 11 | −20 |
| Top D00x antes | D002, D005, D001, D003 | — | |
| Top D00x después | D002, D005, D003, D001 | D001 casi desaparece en top | |

**Causa raíz:** `fn_recalc` no leía `profiles.end_date`; `coalesce(snapshot.contracted, profile.contracted)` perpetuaba 8/40 h post-baja (snapshot pegajoso + perfil sin cercar).

**Corrección:** fence `week_start > end_date → contract 0`; semana parcial → `fn_round_marbella_hours(días/7 × jornada)`; fichajes `> end_date` excluidos; backfill `PERFORM fn_recalc` solo perfiles con `end_date`.

**Eliminadas (→ exact):** Martí, Mouad, Hugo, Pau.  
**Nuevas:** 0. Lifecycle ✓10.  
**Regresiones activas:** Alba/Lucia siguen exact; contratos activos intactos.  
**HE:** sin cambios.  
**Migración:** `20260724090000_shadow_iter_b_end_date_fence.sql` (**aplicada**).  
**Restantes (4):** Fernando (D002 modo Pago — modelo diferente), Héctor (D001+D003 — **regla de negocio** jornada fija; ver política), Pere (carry histórico), Bali (carry −1 — Iter E).  
**Siguiente:** **no** Iter C. Decisión abierta = Iter E tras semilla Pere.

---

## 0.1 Iteración B — end_date (apartado arquitectónico)

| Campo | Contenido |
|-------|-----------|
| **Causa raíz** | Filtro temporal ausente: SQL no lee `profiles.end_date`. El contrato se resuelve con `coalesce(snapshot.contracted_hours_snapshot, profiles.contracted_hours_weekly)`, de modo que (1) el perfil sigue ofreciendo 8/40 tras la baja y (2) cualquier snapshot post-baja con contrato >0 se perpetúa en cada recalc (p.ej. Hugo/Pau 2026-07-13 = 8 h fantasma). No es un JOIN a `hours_contract_terms`; `fn_recalc` no consulta tramos versionados. |
| **Corrección aplicada** | En `fn_recalc`: leer `end_date`; si `week_start > end_date` → `contracted = 0` (fuerza); si la baja cae mid-week → `fn_round_marbella_hours(días_empleados/7 × jornada_perfil)`; excluir fichajes con día Madrid `> end_date`. Backfill: `PERFORM fn_recalc(id, joining_date)` solo para `profiles.end_date IS NOT NULL` (idempotente, in-place, sin DELETE). |
| **Impacto medido** | EMR 52,94% → **76,47%**; CDR 47,06% → **23,53%**; Exact 9→13; Diff 8→4; field diffs 31→11; 0 discrepancias nuevas. |
| **Evidencia** | Run `a4db4f3e-…`; snapshots Mouad/Martí/Hugo/Pau post-baja con contrato 0 y bancos alineados a HE; Lucia/Alba exact (sin regresión activos). |
| **Decisión arquitectónica** | HE sigue siendo la referencia de frontera laboral. SQL debe cercar con el mismo hecho (`profiles.end_date`) hasta que el productor SQL pase a tramos versionados. No se tocó manager=40, modo Pago ni el algoritmo de carry (solo se recalcularon valores derivados tras el fence). |

### Iteración A — ordinary_hours / extra_hours (COMPLETADA)

| Métrica | Antes (7e73bfc9) | Después (3ade336a) | Δ |
|---------|------------------|--------------------|---|
| EMR | 35,29% (6/17) | **52,94% (9/17)** | **+17,65 pp** |
| CDR | 64,71% | **47,06%** | **−17,65 pp** |
| Exact | 6 | 9 | +3 |
| Diff | 11 | 8 | −3 |
| Field diffs | 37 | 31 | −6 |
| Top códigos | D002, D005, **D006**, D001, D003 | D002, D005, D001, D003 | **D006 eliminado del top** |

**Discrepancias eliminadas (sujetos → exact):** Alba, Hernan, Mamadou (solo D006 ordinary).  
**Discrepancias nuevas:** 0.  
**Cerradas en lifecycle:** 3 (✓3 en persist).  
**Ubicación elegida:** `fn_recalc_and_propagate_snapshots` (columnas ya existían; INSERT no las escribía).  
**Migración:** `20260724080000_shadow_iter_a_ordinary_extra_hours.sql` (**aplicada**).  
**HE:** sin cambios.

---

## 1. Resumen ejecutivo

El EMR del **35,29%** (6/17 exactos) **no** indica que el Hours Engine falle en liquidar la semana observada. Indica que:

1. El productor SQL **no rellena** `ordinary_hours` / `extra_hours` (siempre `0`), así que **cualquier empleado con horas reales** entra en diff aunque el resto del vector coincida.
2. El SQL **ignora `profiles.end_date`**, y en varios casos **sigue cobrando contrato post-baja** (Martí, Mouad; fantasma en Hugo/Pau).
3. El SQL aplica una regla legacy **manager = 40 h inventadas** (Héctor) que el HE ya no usa (tramo `weekly_hours = 0`).
4. En modo **Pago**, HE y SQL **modelan distinto** las extras (Fernando): HE → `overtimeHours` + `carryOut = 0`; SQL → `final_balance` + `total_cost`.
5. El resto son **deudas de cadena** (carry) acumuladas por (2) y por prorrateo de baja distinto en la semana del `end_date`.

Los 6 exactos son casi todos **semanas vacías** (sin fichajes) donde `ordinaryHours = 0` en ambos lados. El EMR está estructuralmente deprimido por el hueco de columnas SQL, no por un colapso general del motor.

**Veredicto de migración:** el Shadow Mode ya observa. La siguiente acción no es automatizar runs (8B), sino **corregir / alinear productores** según los grupos de este informe.

---

## 2. Métricas del run

| Métrica | Valor |
|--------|--------|
| Run Id | `7e73bfc9-cab8-41dc-9820-2eabaee47031` |
| Subjects | 17 |
| Succeeded / Failed / Skipped | 17 / 0 / 0 |
| Exact | 6 |
| Diff | 11 |
| Tolerated | 0 |
| EMR | **35,29%** |
| CDR | **64,71%** |
| Field diffs | 37 |
| Discrepancias (entidad) | 22 |
| Duración | 6442 ms |

### Exactos (6)

Juan, Julia, Lucia, Aldo, Willy, Silvia — en esta semana: **sin fichajes** (o vector numérico alineado con `ordinary/extra = 0`). Lucia/Willy/Silvia demuestran que HE y SQL **pueden** coincidir en deuda de contrato cuando el empleado sigue activo.

### Diffs (11)

Mamadou, Fernando, Hugo, Pau, Martí, Pere, Mouad, Hernan, Alba, Héctor, Bali.

---

## 3. Top códigos (prioridad automática)

Orden: frecuencia de field-diffs → impacto en sujetos → severidad.

| Prioridad | Código | Field-diffs | Sujetos (entidad) | Severidad | Campos típicos |
|-----------|--------|-------------|-------------------|-----------|----------------|
| 1 | **D002** | 19 | 7 | CRITICAL | `carryIn`, `carryOut`, `pendingHours` |
| 2 | **D005** | 8 | 6 | CRITICAL | `balanceFinal`, `weeklyBalance` |
| 3 | **D006** | 6 | 5 | CRITICAL | `ordinaryHours`, `overtimeHours` |
| 4 | **D001** | 3 | 3 | CRITICAL | `contractedHoursEffective` |
| 5 | **D003** | 1 | 1 | CRITICAL | `computableHours` |

**Nota taxonómica:** D002 y D005 suelen ser **síntoma** de la misma causa raíz (cadena de carry / waterfall). D006 en este run es casi siempre **productor SQL vacío**, no ambigüedad semántica pura (salvo Fernando).

---

## 4. Grupos de causa raíz (agrupados)

> Si N discrepancias comparten la misma causa, un solo informe de grupo.

### Grupo A — SQL no escribe `ordinary_hours` / `extra_hours`

**Estado (2026-07-24):** **RESUELTO** en Iteración A (`20260724080000_shadow_iter_a_ordinary_extra_hours.sql`).  
Recuperados: Alba, Hernan, Mamadou. Fernando/Pere ya sin diff ordinary/OT.

**Clasificación final:** SQL incorrecto (productor incompleto) / gap de esquema operacional  

**Definición D006 (taxonomía):** semantic alias / proyección distinta del mismo hecho.  
**En el baseline:** las columnas existían pero `fn_recalc_and_propagate_snapshots` **nunca las insertaba**; quedaban en `0.00`.

**Evidencia (función SQL viva):** el `INSERT` de snapshots solo escribe  
`total_hours, balance_hours, pending_balance, final_balance, contracted_hours_snapshot, is_paid, prefer_stock_hours_override, total_cost`.  
No hay asignación a `ordinary_hours` ni `extra_hours`.

**Frecuencia:** 4 sujetos con **solo** `ordinaryHours` (Mamadou, Hernan, Alba) + componente en Pere (+ Fernando vía `overtimeHours`).

**Reconstrucción tipo (Alba / Mamadou / Hernan):**

```text
Attendance → HE liquidateWeek → ordinary = hoursWorked (≤ contrato)
            → Canonical HE.ordinaryHours = 24.5 | 25 | 33
SQL snapshot.total_hours = mismo número
SQL snapshot.ordinary_hours = 0, extra_hours = 0
Diff → D006 ordinaryHours
Conclusión → HE correcto; SQL no proyecta el desglose
```

**¿Quién tiene razón?** Hours Engine (desglose). SQL incorrecto en proyección.

**Impacto si se corrige solo este grupo:**

- 3 sujetos pasan a exact de inmediato (Alba, Hernan, Mamadou).
- EMR: 6 → **9/17 = 52,9%**.
- Pere y Fernando siguen con otras causas.

**Estimación de trabajo:** 0,5–1,5 d  
- Opción corta (Shadow): tratar `0/0` con `total_hours > 0` como `null` → D000 schema gap (no false D006).  
- Opción SSOT: que SQL (o un adaptador de corte) rellene ordinary/extra con la misma regla HE.

**Regla SQL obsoleta / incompleta:** “el snapshot no necesita ordinary/extra”.  
**Regla HE nueva:** ordinary/OT salen de `liquidateWeek` / regime.  
**Equivalencia:** `ordinary + overtime ≈ min/max reglas sobre total y contrato` (HE es la definición deseada).

---

### Grupo B — SQL ignora `end_date` (post-baja sigue cobrando contrato)

**Estado (2026-07-24):** **RESUELTO** en Iteración B (`20260724090000_shadow_iter_b_end_date_fence.sql`).  
Recuperados: Martí, Mouad, Hugo, Pau. Deuda fantasma Mouad −391 → −8 alineada a HE.

**Clasificación final:** SQL incorrecto (bug de frontera laboral)

**Códigos:** D001 + D002 + D005 (síntomas).

**Evidencia SQL (pre-fix):** `fn_recalc_and_propagate_snapshots` leía `joining_date` del perfil pero **no** `end_date`. El contrato efectivo semanal se tomaba de `contracted_hours_snapshot` / `profiles.contracted_hours_weekly` sin cercar baja.

| Empleado | end_date | HE W2026-07-20 | SQL W2026-07-20 | Conclusión |
|----------|----------|----------------|-----------------|------------|
| **Mouad** | 2026-05-20 | contrato 0, carry −8 | contrato **40**, pending −351, final **−391** | SQL acumula −40 h/semana post-baja |
| **Martí** | 2026-06-30 | contrato 0, carry −2 | contrato **8**, pending −16, final **−24** | SQL cobra −8 h/semana post-baja |
| **Hugo** | 2026-06-30 | carry −4 | pending −10 | Ver Grupo C (fantasma + prorrateo) |
| **Pau** | 2026-06-30 | carry −26,5 | pending −32,5 | Idem |

**Cadena Mouad (SQL):** −311 → −351 → −391 en julio; HE estable en −8. Diferencia ~**383 h** de deuda fantasma.

**¿Quién tiene razón?** Hours Engine (post-baja = sin contrato). SQL incorrecto.

**Impacto si se corrige:**

- Martí + Mouad → exact (o exact tras recalcular cadena).
- Contribuye a cerrar Hugo/Pau.
- EMR potencial tras A+B: ~**11/17 ≈ 64,7%** (sin contar C/D/E).

**Estimación:** 1–2 d en SQL (leer `end_date`, contrato 0 post-baja, no rehidratar snapshot desde perfil activo) + backfill de snapshots post-baja.

**Regla HE documentada:** `resolveEffectiveContract` excluye días `> endDate`.  
**Regla SQL ausente:** no hay fence de baja.

---

### Grupo C — Semana de baja y fantasma de contrato (Hugo / Pau)

**Clasificación final:** SQL incorrecto + modelos distintos en la semana del `end_date`  

**Códigos:** D002 / D005 (gap fijo **6,0 h** en ambos: −4 vs −10; −26,5 vs −32,5).

**Reconstrucción Hugo:**

| Semana | HE contrato / WB / carryOut | SQL contrato / WB / final |
|--------|-----------------------------|---------------------------|
| 2026-06-22 | 8 / 0 / −2 | 8 / 0 / −2 — **alineados** |
| 2026-06-29 (baja mar 30) | **2** / −2 / **−4** | **0** / 0 / −2 |
| 2026-07-06 | 0 / 0 / −4 | 0 / 0 / −2 |
| 2026-07-13 | 0 / 0 / −4 | **8** / **−8** / **−10** ← fantasma |
| 2026-07-20 | 0 / 0 / −4 | 0 / 0 / −10 |

**Causa raíz compuesta:**

1. HE prorratea Mon–Mar de la semana de baja (2/7×8 ≈ 2) → deuda −2 adicional.  
2. SQL en esa semana pone contrato 0 y no prorratea.  
3. SQL en **2026-07-13** reaparece `contracted_hours_snapshot = 8` y cobra −8 (sin `end_date`).

**¿Quién tiene razón?**

- Post-baja pleno (jul+): **HE**.  
- Semana parcial de baja: **HE** es el modelo deseado (días/7); SQL distinto → “ambos correctos bajo modelos distintos” hasta documentar la regla de negocio de AppSheet/legado. Prioridad SSOT: **HE**.

**Impacto:** 2 sujetos; al fijar B + prorrateo, gap de 6 h desaparece.

**Estimación:** incluido en B (+0,5 d validar semana parcial).

---

### Grupo D — Jornada fija usuario maestro (Héctor) — NO es bug a eliminar

**Clasificación final:** **Regla de negocio** (política aprobada 2026-07-24)

**Documento:** [`context/POLITICA_JORNADA_FIJA_HECTOR.md`](context/POLITICA_JORNADA_FIJA_HECTOR.md)

**Códigos Shadow:** D003 (`computableHours` 0→40) + D001 (contrato 0→40) — reflejan que **HE aún no implementa** la política; el productor SQL sí materializa 40 + fichajes.

**Política (resumen):**

- Solo `hhector7722@gmail.com` (no “todo manager”).
- 40 h ordinarias/semana (8 h/día laborable).
- Fichajes = **extras** adicionales; no sustituyen la base.
- Impacto pleno en costes, liquidaciones, KPIs, snapshots.

**¿Quién tiene razón a efectos de negocio?** El comportamiento **SQL actual** para este usuario (base 40 + extras fichadas). **No** eliminar la rama `40 + logs` para “igualar” HE a 0.

**Iteración C:** **DESCARTADA.**

**Deuda:** acoplar la política a email/flag (`FIXED_WEEK`) en lugar de `manager|fixed` — trabajo futuro, no convergencia Shadow inmediata.

---

### Grupo E — Modo Pago: extras en banco SQL vs OT HE (Fernando)

**Clasificación final:** Ambos correctos pero con modelos distintos (alias semántico D006 + síntoma D002)

**Reconstrucción:**

```text
Contrato 0, bagMode pago, 16 h trabajadas
HE: ordinary=0, overtime=16, weeklyBal=16, carryOut=0 (no acumula cobro en banco)
SQL: ordinary=0, extra=0, balance=16, final=16, total_cost=160
Diff: overtimeHours 16→0 (D006), carryOut 0→16 (D002)
```

**¿Quién tiene razón?** Ninguno “roto”:  
- HE: extras pagables no viven en `carryOut`.  
- SQL: extras no pagadas viven en `final_balance` y `total_cost`.  

Para Shadow SSOT hace falta **regla de proyección canónica** (p.ej. mapear `overtimeHours ← max(0, final_balance)` si pago y `extra_hours` vacío).

**Impacto:** 1 sujeto a exact con adaptador/reglas de comparación.

**Estimación:** 0,5–1 d (adapter Shadow o relleno SQL `extra_hours`).

---

### Grupo F — Carry histórico bolsa / Pagada (Pere, Bali)

**Clasificación final:** No determinable al 100% en una sola semana → deuda de cadena (datos/reglas históricas)

#### Pere (bolsa)

- Misma semana: HE y SQL coinciden en `weeklyBalance = +4` y contrato 28.  
- Diff: ordinary/OT (Grupo A) + carryIn −35 vs −29,5 (**5,5 h** de historial).  
- Causa probable: histórico de `is_paid` / bolsa / redondeos distintos en semanas previas (no bug de la semana 20-jul aislada).

**¿Quién tiene razón en W20?** Parcialmente ambos en el delta semanal; el banco acumulado requiere auditoría multi-semana.

#### Bali

- Post-baja; HE arrastra **−1** desde semana parcial de baja (contrato prorrateado + `is_paid`).  
- SQL en 06-29/07-06 muestra `total_hours = 8` con `is_paid` (posible invención o logs) y luego deja banco en 0.  
- Diff W20: carry −1 vs 0.

**¿Quién tiene razón?** Parcialmente HE en prorrateo; SQL dudoso en horas de esas semanas. **Pendiente** de validar con fichajes reales 29-jun / 06-jul.

**Impacto:** 2 sujetos; no bloquean el relato del 90% si A–E están cerrados.

**Estimación:** 1–2 d auditoría YTD Pere/Bali (script de cadena, no UI).

---

## 5. Cobertura de explicación (≥90%)

| Grupo | Sujetos afectados (diff) | % de los 11 diffs | % field-diffs (~37) |
|-------|--------------------------|-------------------|---------------------|
| A ordinary/extra vacíos | 5 (3 puros + Pere + Fernando OT) | ~45% | ~16% (D006) |
| B post-baja sin end_date | 2 fuertes (Martí, Mouad) + refuerza C | ~18–36% | alto en D001/D002/D005 |
| C fantasma + prorrateo baja | Hugo, Pau | ~18% | ~22% |
| D manager=40 | Héctor | ~9% | ~5% |
| E modo pago alias | Fernando | (ya en A/E) | — |
| F carry histórico | Pere, Bali | ~18% | resto D002 |

**Explicados con causa raíz demostrable (A–E): 9/11 = 81,8% de sujetos en diff.**  
**A–E + hipótesis documentada F: 11/11 = 100% de sujetos; F marcado “pendiente de validar” en detalle histórico.**

A nivel **códigos/field-diffs**, A+B+C+D+E explican **>90%** de las 37 diferencias (los residuos son arrastres de F).

**Condición 8B (explicar ≥90%):** **cumplida a nivel de informe** para A–E; F no impide 8B si se acepta como “cadena histórica a reconciliar”, pero **no se recomienda 8B** hasta corregir A+B (máximo ROI).

---

## 6. ¿Por qué el EMR es solo 35,29%?

Fórmula mental:

```text
EMR bajo ≈ (empleados con fichajes reales) × (ordinary/extra SQL = 0)
         + (ex-empleados con SQL cobrando contrato)
         + (manager fantasma 40 h)
         + (alias modo pago)
         + (carrys históricos)
```

- Sin Grupo A, EMR ya subiría a **~53%** sin tocar liquidación.  
- Sin A+B+D, EMR potencial **~70%+**.  
- El techo real tras alinear productores y backfill de carry está en **85–100%** en esta semana.

---

## 7. ¿Cuántas discrepancias desaparecerían corrigiendo una sola regla?

| Corrección única | Sujetos diff → exact (estimado) | Field-diffs que caen | EMR estimado |
|------------------|----------------------------------|----------------------|--------------|
| **A** Rellenar/ignorar ordinary+extra SQL | +3 (Alba, Hernan, Mamadou) | ~4–6 | **52,9%** |
| **B** Respetar `end_date` en SQL + backfill | +2 (Martí, Mouad) y mejora C | ~12–18 | **+11,8 pp** sobre base |
| **D** Quitar manager=40 | +1 (Héctor) | 2 | **+5,9 pp** |
| **E** Alias canónico modo pago | +1 (Fernando) | 2 | **+5,9 pp** |
| **A+B+D+E** (sin tocar F) | +7 | mayoría | **~76–82%** |
| **A+B+C+D+E+F** | +11 | ~37 | **~100%** esta semana |

La **única regla con mejor ratio esfuerzo/impacto** es **A** (barata) seguida de **B** (correctness crítica de negocio: deudas fantasma de cientos de horas).

---

## 8. ¿Cuál debería ser el siguiente cambio?

### Orden recomendado (no es 8B)

1. **Shadow/SQL A:** dejar de comparar `ordinaryHours`/`overtimeHours` cuando SQL trae `0/0` y `total_hours > 0` **o** rellenar esas columnas desde la misma fórmula HE.  
2. **SQL B:** `end_date` en `fn_recalc_and_propagate_snapshots`; contrato 0 post-baja; no rehidratar contrato desde perfil tras baja; backfill Mouad/Martí/Hugo/Pau.  
3. **SQL D:** eliminar `manager OR fixed → 40 + logs`.  
4. **Adapter E:** proyección canónica modo Pago.  
5. **Auditoría F:** cadena YTD Pere (bolsa) y Bali (semana baja + Pagada).

### Qué no hacer todavía

- Cron nocturno, dashboard, alertas, feature flags (8B).  
- Cutover SSOT.  
- Apagar SQL sin backfill de carry.

---

## 9. Catálogo por código D00x (este run)

### D002 — Carry chain

- **Definición:** divergencia en `carryIn` / `carryOut` / `pendingHours`.  
- **Frecuencia:** 19 field-diffs, 7 empleados.  
- **Productor correcto (SSOT):** Hours Engine (`resolveOpeningCarryIn` + `liquidateWeek`).  
- **Productor incorrecto:** SQL cuando ignora baja / inventa contrato / historial Pagada distinto.  
- **Causa raíz:** Grupos B, C, E (síntoma), F.  
- **Resolución:** B+C+E+F; no “parchear” solo el número de una semana.

### D005 — Waterfall

- **Definición:** `weeklyBalance` / `balanceFinal` (y vecinos de liquidación).  
- **Frecuencia:** 8 diffs, 6 empleados.  
- **Casi siempre** consecuencia de D002/D001 (misma liquidación).  
- **Resolución:** misma que D002/D001.

### D006 — Semantic alias / proyección

- **Definición:** ordinary/OT (u otros) con semántica distinta.  
- **Frecuencia:** 6 diffs, 5 empleados.  
- **Este run:** 4 casos = SQL deja 0; 1 caso Fernando = modo pago.  
- **Resolución:** Grupo A + E.

### D001 — Contract input

- **Definición:** `contractedHoursEffective` distinto.  
- **Casos:** Martí (0 vs 8), Mouad (0 vs 40), Héctor (0 vs 40).  
- **Correcto:** HE (tramos + end_date).  
- **Resolución:** B + D.

### D003 — Hours input

- **Definición:** `computableHours` / asistencia.  
- **Caso:** Héctor 0 vs 40.  
- **Correcto:** HE (no hay fichajes).  
- **Resolución:** D.

### Códigos no vistos en este run

D000, D004, D007–D017: sin evidencia en `7e73bfc9-…`.

---

## 10. Matriz “quién tiene razón” (11 diffs)

| Empleado | Primario | ¿Quién tiene razón? | Grupo |
|----------|----------|---------------------|-------|
| Mamadou | D006 | **HE** | A |
| Hernan | D006 | **HE** | A |
| Alba | D006 | **HE** | A |
| Fernando | D006 | **Modelos distintos** (E) | E (+A) |
| Martí | D001 | **HE** | B |
| Mouad | D001 | **HE** | B |
| Hugo | D002 | **HE** (post-baja); semana baja = modelo HE preferido | C |
| Pau | D002 | **HE** | C |
| Héctor | D003 | **HE** | D |
| Pere | D006 | HE en desglose semana; banco **no determinable** sin YTD | A+F |
| Bali | D002 | **No determinable** sin auditar 29-jun/06-jul | F |

Nunca se asumió: cada fila tiene reconstrucción HE↔SQL en evidencia del run + `fn_recalc` + `end_date`.

---

## 11. Reglas (inventario)

### SQL obsoletas / incorrectas

1. No persistir ordinary/extra.  
2. No leer `end_date`.  
3. `manager|fixed → total_hours = 40 + logs`.  
4. Reutilizar `contracted_hours_snapshot` / perfil sin cercar baja.  
5. Modo pago: extras solo en `final_balance`/`total_cost` sin `extra_hours`.

### HE nuevas (fuente deseada SSOT)

1. Contrato solo desde `hours_contract_terms` + frontera `joining_date`/`end_date`.  
2. Asistencia solo desde `time_logs`.  
3. Ordinary/OT desde régimen / `liquidateWeek`.  
4. Carry continuo vía `resolveOpeningCarryIn`.  
5. Modo Pago: extras no inflan `carryOut` como deuda positiva de banco.

### Equivalentes (cuando ambos alinean)

- `weeklyBalance ≈ total − contrato` (staff no agosto, no manager fantasma).  
- Cadena `pending ← prev.final` (deuda siempre; extras según bolsa/Pagada).  
- Semanas vacías de empleados activos (Lucia/Willy/Silvia).

### Pendientes de validar

- Regla de negocio exacta AppSheet para **semana parcial de baja**.  
- Historial bolsa/Pagada de **Pere**.  
- Origen de `total_hours = 8` SQL en Bali 29-jun / 06-jul.

---

## 12. Estimación de trabajo por grupo

| Grupo | Esfuerzo | ROI EMR / corrección negocio |
|-------|----------|------------------------------|
| A | 0,5–1,5 d | Alto / medio |
| B | 1–2 d + backfill | Muy alto (deudas fantasma) |
| C | +0,5 d sobre B | Alto |
| D | 0,5 d | Medio |
| E | 0,5–1 d | Medio |
| F | 1–2 d auditoría | Medio (limpia restos) |

**Total orientativo hasta EMR alto en esta semana:** ~4–8 días-persona de dominio/SQL, sin UI ni cron.

---

## 13. Condición 8B

| Criterio | Estado |
|----------|--------|
| Shadow observa y persiste | Cumple |
| Informe explica ≥90% discrepancias | **Cumple** (A–E demostrados; F residual documentado) |
| EMR “aceptable” para automatizar | **No** (35% → primero A+B) |
| Cron / dashboard / alertas | **Bloqueados** hasta decidir corrección A+B y re-medir |

**Recomendación:** no abrir 8B. A+B, adaptador y Bali cerrados. Única decisión pendiente = semilla Pere. No automatizar hasta decidirla.

---

## 14. Validation Gate — Revisión Final

**Fecha:** 2026-07-24 · Run gate `bfdb100b-…` · EMR 82,35% · Diff 3  
**Post-fix Bali:** Run `4b0b3a55-…` · EMR **88,24%** · Diff **2** · Tests 42/42  
**Detalle:** [`SHADOW_RESIDUAL_ANALYSIS.md`](SHADOW_RESIDUAL_ANALYSIS.md) §§ Validation Gate + Corrección del bug Bali.

| Caso | Veredicto | Clasificación |
|------|-----------|---------------|
| Héctor | **VALIDADO** (política) | Regla de negocio |
| Pere | Semilla HE 0 vs SQL −2,5 | Decisión funcional |
| Bali | Fence baja: tramos (corregido) | ~~Bug SQL~~ **cerrado** |

### Decisiones finales

- **Héctor:** Regla de negocio validada  
- **Pere:** Decisión funcional  
- **Bali:** Bug independiente → **corregido**

### Criterio de cierre SSOT

**B)** SSOT **técnicamente convergido**, con una única decisión funcional documentada pendiente (semilla histórica de Pere), **sin bugs abiertos**.

---

## 15. Apéndice — pipeline canónico (plantilla)

```text
Attendance Facts (time_logs, justified_hours)
        ↓
Hours Engine (resolveOpeningCarryIn → liquidateWeek)
        ↓
Canonical Vector HE
        ↓
SQL Snapshot (weekly_snapshots vía fn_recalc…)
        ↓
Canonical Vector SQL
        ↓
Diff (comparator)
        ↓
Clasificación D00x
        ↓
Explicación (grupo A–F)
        ↓
Conclusión (quién tiene razón)
```

Evidencia persistida: tablas `shadow_parity_*` run `7e73bfc9-…`.

---

*Fin del Shadow Validation Report. Sin código de automatización. Sin 8B.*

---

> **Fin de SPIKE-SHADOW-VALIDACION · material no normativo del 2026-07-26.** Nada de lo anterior autoriza decisiones. La norma vigente está en `marbella-os/README.md`.
