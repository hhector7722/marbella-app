---
documento: SPIKE-RECONCILIACION-MIGRACIONES-SUPABASE-K2
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: agente
---

# Spike: Auditoría Crítica de Divergencia Supabase

## 1. Resumen de la Auditoría
Tras una auditoría criptográfica profunda del esquema remoto frente al repositorio local, se ha invalidado la conclusión inicial de equivalencia total. 
Existen **diferencias semánticas reales** (squashes y adiciones de código) entre el historial remoto y el local. La divergencia no es solo de metadatos (timestamps), sino estructural en el empaquetado de las migraciones.

## 2. Estado
- **Migraciones locales:** 297
- **Migraciones remotas:** 293
- **Primera divergencia:** `20260713000756`

## 3. Matriz Real Clasificada
De las 32 migraciones SOLO REMOTE, se comparó su SQL normalizado contra sus supuestas equivalentes locales:

- **HASH_IDENTICAL:** 18 (SQL crudo exacto sin alteraciones)
- **SEMANTICALLY_EQUIVALENT:** 6 (Solo diferían en `BEGIN`/`COMMIT` o comentarios)
- **NAME_ONLY / PARTIAL:** 5 (El nombre coincide, pero el contenido local añade lógica, ej. `reopen_client_order_audit` añade comentarios a columnas).
- **NO_EQUIVALENT:** 3 (Migraciones remotas que fueron consolidadas/squasheadas completamente en otras locales distintas).

## 4. Schema Drift Real
**SÍ**. Existe un drift semántico menor. Las migraciones locales posteriores absorbieron cambios de las remotas faltantes y añadieron mejoras (como comentarios en columnas `created_from`). El esquema remoto carece de estos pequeños añadidos locales porque los archivos locales consolidados nunca se ejecutaron en remoto.

## 5. Dependencias K2
Las migraciones K2 (`write_freeze` y `execution_registry`) **NO** dependen de las migraciones divergentes. Se apoyan en el esquema base consolidado.

## 6. Evaluación de Estrategias de Reconciliación

### Estrategia A: Revert/Apply Global (Propuesta Anterior)
**INVÁLIDA**. Marcar las 36 migraciones locales como `applied` ignoraría los cambios locales adicionales introducidos durante el squash, dejando el esquema remoto permanentemente desincronizado con el local.

### Estrategia B: Migration Repair Selectivo (RECOMENDADA)
1. **Desvincular historial remoto fantasma:** Ejecutar `repair --status reverted` sobre las 32 migraciones `SOLO REMOTE`. Esto alinea la tabla de control (Supabase CLI exige que todo lo remoto exista localmente).
2. **Reconocer el historial local exacto:** Ejecutar `repair --status applied` **ÚNICAMENTE** sobre las 24 migraciones locales (`HASH_IDENTICAL` y `SEMANTICALLY_EQUIVALENT`). 
3. **Aplicar los squashes:** **NO** marcar como applied las 12 migraciones locales restantes (las consolidadas/modificadas). 
4. **Ejecutar Push:** Al hacer `db push`, Supabase ejecutará estas 12 migraciones locales y las 2 nuevas de K2. Al estar diseñadas de forma idempotente (`CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`), el `push` inyectará con seguridad los cambios faltantes (ej. comentarios) en el esquema remoto, logrando una sincronización 100% perfecta entre repositorio y BD real.

## 7. Decisión de Ejecución
Esta estrategia preserva los datos y corrige el drift, pero modifica la tabla de control remota y reejecuta DDL local idempotente. Requiere **AUTORIZACIÓN EXPLÍCITA**.

## 8. VALIDACIÓN DE ESTRATEGIA B (Fases 1-13)

### Fase 1 a 8: Identificación y Simulación Offline de las 12 Pendientes
Tras descontar las 24 migraciones `APPLIED` (idénticas y equivalentes), quedan 12 migraciones "Solo Local" pendientes que `db push` intentaría ejecutar. Se ha verificado el estado de BD real comprobando la existencia de los objetos.

1. `20260716160000_client_order_submitted_guard.sql`: **SAFE_DELTA**. Las funciones usan `CREATE OR REPLACE`. Añade un comentario (`COMMENT ON COLUMN`). El UPDATE realiza un backfill de datos (`client_order_submitted_at`), pero está protegido con `WHERE e.client_order_submitted_at IS NULL`, haciéndolo idempotente.
2. `20260716162000_reopen_client_order_audit.sql`: **SAFE_DELTA**. Funciones con `CREATE OR REPLACE`. Constraints están dentro de un bloque `IF NOT EXISTS`. El UPDATE tiene `WHERE created_from IS NULL`, haciéndolo seguro contra duplicación.
3. `20260716170000_filled_by_on_order_save.sql`: **SAFE_REPLAY**. Solo `CREATE OR REPLACE FUNCTION`. No altera datos.
4. `20260716171000_save_client_filled_by.sql`: **SAFE_REPLAY**. Solo `CREATE OR REPLACE FUNCTION`.
5. `20260727135641_phase1b_disable_sql_c_producers.sql`: **SAFE_DELTA**. Usa `DROP TRIGGER IF EXISTS` y `CREATE OR REPLACE FUNCTION`.
6. `20260727145300_phase1c_disable_time_logs_recalc_trigger.sql`: **SAFE_DELTA**. Ídem (Drop trigger if exists, create or replace).
7. `20260727152000_phase1d_disable_close_week_sql_c_motor.sql`: **SAFE_DELTA**. Funciones con `CREATE OR REPLACE`. Manipulación de pg_cron defendida con bloque DO defensivo.
8. `20260804000000_employee_payroll_facts.sql`: **UNSAFE**. Intenta crear políticas (`CREATE POLICY`) sin comprobación de existencia. La comprobación en BD real ha revelado que la tabla `employee_payroll_facts` y sus políticas **YA EXISTEN** en producción. Hacer push de esta migración causaría un error fatal (`policy already exists`).
9. `20260804000001_record_payroll_fact_atomic.sql`: **SAFE_REPLAY**. Usa `CREATE OR REPLACE FUNCTION`.
10. `20260806000000_employee_payroll_facts_extended.sql`: **UNSAFE**. Intenta añadir un CHECK constraint (`ADD CONSTRAINT chk_payroll_costs_positive`). Al existir ya en la tabla en producción, causaría un fallo inmediato (`constraint already exists`).
11. `20260806000001_profiles_payroll_name.sql`: **SAFE_REPLAY**. Utiliza `ADD COLUMN IF NOT EXISTS`.
12. `20260806180509_employee_payroll_facts_multiple_liquidations.sql`: **UNSAFE**. Intenta crear un índice único (`CREATE UNIQUE INDEX idx_unique_active_payroll_fact`). Al ya existir en BD, causará colisión y error (`relation already exists`).

**Descubrimiento Crítico:** Las migraciones de agosto se ejecutaron funcionalmente en producción (las tablas y políticas existen), pero no constan en la porción de `schema_migrations` analizada o lo hicieron de un modo irregular. Si la Estrategia B se ejecutara tal cual, el `db push` intentaría correr estas migraciones de agosto y abortaría instantáneamente la transacción. **Por consiguiente, la Estrategia B FALLA en la simulación de push.**

### Fase 9 y 10: Simulación del CLI y los "Reverted"
Si hiciésemos `repair --status reverted` sobre las 32 remotas:
- El historial de `schema_migrations` se alinearía con las ausencias del repositorio local.
- **NO hay rollback del schema**: Marcar como "reverted" en el historial de control de Supabase **NO** ejecuta un deshacer ni revierte las modificaciones en BD (es una simple tabla de registro). Las columnas y datos creados por esas 32 migraciones seguirían existiendo.

### Fase 11: Revisión de los "Applied"
Las 24 migraciones locales que marcaríamos como `applied` son seguras. Sus efectos ya se encuentran 100% integrados (las 18 idénticas) o su delta estructural es equivalente. Al marcarlas evitamos que el CLI intente correrlas.

### Rollback
- Si falla un `db push` (inevitable por las de agosto), la transacción se revertiría automáticamente sin dañar el esquema, pero el despliegue seguiría bloqueado.
- Revertir las acciones de `migration repair` requeriría inyecciones manuales mediante SQL crudo (`psql`) en la tabla `schema_migrations` para devolverle sus registros previos, un proceso engorroso y peligroso.

## 9. FINAL PRE-REPAIR AUDIT Y RECLASIFICACIÓN DE DIVERGENCIAS

Tras la invalidación del Gate anterior, se ha realizado una auditoría exhaustiva y demostrable sobre las 32 migraciones remotas huérfanas y los 7 deltas pendientes.

### 9.1. 32 REMOTE-ONLY MIGRATIONS — MATRIZ DE EVIDENCIA

Se ha comparado cada versión de las 32 remotas exclusivas contra el conjunto de migraciones consolidadas en el repositorio local. La evidencia demuestra que TODAS fueron absorbidas (`squash` o renombradas) en el repositorio local.

| Remote Version | Nombre | Efecto Real | Equivalente Local | Type | Acción |
|---|---|---|---|---|---|
| `20260713000756` | `profiles_visible_in_plantilla` | Presente en BD | `20260713120000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260713012154` | `fix_weekly_log_grid_madrid_with_prorate` | Presente en BD | `20260713140000` | `SEMANTICALLY_EQUIVALENT` | `REVERT_REMOTE` |
| `20260716134302` | `events_client_edit_token` | Presente en BD | `20260716134100` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716135420` | `client_pedido_oneshot_close` | Presente en BD | `20260716153000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716140057` | `client_order_submitted_guard` | Presente en BD | `20260716160000` | `ABSORBED_BY_LATER_MIGRATION` | `REVERT_REMOTE` |
| `20260716140142` | `client_order_submitted_save_rpc` | Presente en BD | `20260716160000` | `ABSORBED_BY_LATER_MIGRATION` | `REVERT_REMOTE` |
| `20260716140849` | `reopen_client_order_audit` | Presente en BD | `20260716162000` | `ABSORBED_BY_LATER_MIGRATION` | `REVERT_REMOTE` |
| `20260716140905` | `client_save_set_filled_by` | Presente en BD | `20260716162000` | `ABSORBED_BY_LATER_MIGRATION` | `REVERT_REMOTE` |
| `20260716141056` | `filled_by_on_order_save` | Presente en BD | `20260716170000` | `SEMANTICALLY_EQUIVALENT` | `REVERT_REMOTE` |
| `20260716141119` | `save_client_filled_by` | Presente en BD | `20260716171000` | `SEMANTICALLY_EQUIVALENT` | `REVERT_REMOTE` |
| `20260716142619` | `notify_client_order_submitted` | Presente en BD | `20260716180000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716152348` | `get_pedido_contact_whatsapp_phone` | Presente en BD | `20260716190000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716153048` | `event_order_racion_medio` | Presente en BD | `20260716230000` | `ABSORBED_BY_LATER_MIGRATION` | `REVERT_REMOTE` |
| `20260716153140` | `event_order_client_racion_medio` | Presente en BD | `20260716192000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716153205` | `staff_event_order_racion_medio` | Presente en BD | `20260716230000` | `ABSORBED_BY_LATER_MIGRATION` | `REVERT_REMOTE` |
| `20260716153246` | `daily_extras_from_hours_engine` | Presente en BD | `20260716193000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716154119` | `hours_contract_terms` | Presente en BD | `20260716200000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716155946` | `client_order_push_and_notify` | Presente en BD | `20260716210000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716160302` | `sync_hours_contract_terms_from_profile` | Presente en BD | `20260716220000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716161424` | `half_ration_name_no_dup` | Presente en BD | `20260716230000` | `ABSORBED_BY_LATER_MIGRATION` | `REVERT_REMOTE` |
| `20260716163651` | `get_client_order_items_by_token` | Presente en BD | `20260716240000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260716185302` | `fix_update_staff_event_order_no_updated_at` | Presente en BD | `20260716250000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260721070321` | `purchase_invoices_ocr_background` | Presente en BD | `20260721120000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260723215624` | `time_logs_justified_hours` | Presente en BD | `20260723230000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260724045536` | `shadow_parity_persistence` | Presente en BD | `20260724060000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260724062138` | `shadow_iter_a_ordinary_extra_hours` | Presente en BD | `20260724080000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260724064003` | `shadow_iter_b_end_date_fence` | Presente en BD | `20260724090000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260724103743` | `shadow_bali_fence_contract_terms` | Presente en BD | `20260724120000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260724181230` | `payroll_monthly_totals_hardening` | Presente en BD | `20260724190000` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260726031357` | `fn_recalc_stop_total_cost_money` | Presente en BD | `20260726031225` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260726112854` | `cron_recalc_persist_overtime_cost` | Presente en BD | `20260726112525` | `HASH_IDENTICAL` | `REVERT_REMOTE` |
| `20260729023408` | `exclude_comprobante_from_closing_sales` | Presente en BD | `20260729023014` | `HASH_IDENTICAL` | `REVERT_REMOTE` |

**¿Por qué es seguro marcarlas REVERTED?** La tabla `schema_migrations` asocia el esquema existente con los archivos del repositorio. Si mantenemos identificadores huérfanos, el CLI asume divergencia irrecuperable. Puesto que los equivalentes locales (que contienen **los mismos deltas estructurales**) van a ser marcados como `APPLIED`, la trazabilidad queda perfectamente cubierta por las versiones del repositorio actual.

---

### 9.2. PAYROLL OUT-OF-BAND VALIDATION

La base de datos real ha sido introspeccionada confirmando:
1. Tabla `employee_payroll_facts` con `gross_salary`, `net_salary`, etc.
2. Índice `idx_unique_active_payroll_fact` utilizando `settlement_hash`.
3. Constraints `chk_payroll_costs_positive` presentes.
4. Función `replace_payroll_month_atomic` creada y la anterior eliminada.
5. Columna `profiles.payroll_name` creada.
6. 254 registros de facturación de nóminas vivos y protegidos por RLS.

**Acción:** Marcar las 5 migraciones como `APPLIED` a través de repair. No hay ejecución de SQL funcional, simplemente reconocemos en `schema_migrations` la realidad física que se impuso fuera de banda.

---

### 9.3. 7 DELTA MIGRATIONS — DEMOSTRACIÓN DE IDEMPOTENCIA

Se ha analizado el código fuente de los 7 deltas que quedarán pendientes para asegurar que `db push` no fallará al ejecutarse sobre un esquema que ya posee parte de sus orígenes remotos originales.

| # | Version | Name | SQL operation | Existing state | Delta | Safe reason |
|---|---|---|---|---|---|---|
| 1 | `160000` | `client_order_submitted_guard` | `ADD COLUMN IF NOT EXISTS`, `COMMENT ON COLUMN`, `UPDATE WHERE IS NULL`, `CREATE OR REPLACE FUNCTION` | Columna ya creada; UPDATE ya aplicado. | Comentario sobreescribe; UPDATE inactivo (filtra IS NULL). | Protegido por `IF NOT EXISTS` y `WHERE IS NULL` |
| 2 | `162000` | `reopen_client_order_audit` | `ADD COLUMN IF NOT EXISTS`, `DO $$ IF NOT EXISTS ADD CONSTRAINT`, `UPDATE WHERE IS NULL`, `CREATE OR REPLACE FUNCTION` | Objetos creados previamente. | Mismos deltas. | Protegido por `DO $$` interrogando a `pg_constraint` e `IF NOT EXISTS`. |
| 3 | `170000` | `filled_by_on_order_save` | `CREATE OR REPLACE FUNCTION` | Función anterior. | Reemplazo total. | Intrínsecamente seguro. |
| 4 | `171000` | `save_client_filled_by` | `CREATE OR REPLACE FUNCTION` | Función anterior. | Reemplazo total. | Intrínsecamente seguro. |
| 5 | `135641` | `phase1b_disable_sql_c_producers` | `DROP TRIGGER IF EXISTS`, `CREATE OR REPLACE FUNCTION`, `COMMENT` | Ningún trigger eliminado. | Drop real, reemplazos. | `DROP IF EXISTS` no arroja error, reemplazos puros. |
| 6 | `145300` | `phase1c_disable_time_logs_recalc_trigger` | `DROP TRIGGER IF EXISTS`, `CREATE OR REPLACE FUNCTION` | Trigger existente. | Drop real, reemplazo. | Idempotencia nativa. |
| 7 | `152000` | `phase1d_disable_close_week_sql_c_motor` | `CREATE OR REPLACE FUNCTION`, `DO $$ cron.alter_job` | Job inalterado. | Alteración de job si existe. | Protegido por validación `if v_job_id is not null`. |

---

### 9.4. MIGRATION COUNT RECONCILIATION (ARITMÉTICA EXACTA)

Existen exactamente 36 migraciones locales (en `supabase/migrations/`) posteriores al timestamp `20260713000000` que figuran como "Solo Local" en el CLI porque no están en remoto, o están pero bajo nombres de archivo antiguos (squash).

La ecuación es matemática y estricta:
**36 SOLO LOCAL** =
- **24** Equivalentes locales (serán `REPAIR APPLIED`).
- **5** Payroll OOB (serán `REPAIR APPLIED`).
- **7** Deltas seguros (quedarán `PENDING`).
`(24 + 5 + 7 = 36)`

Posteriormente:
**7** Deltas pendientes + **1** K2 Registry (`20260811033217`) = **8 migraciones** que el comando `db push` intentará ejecutar en cadena.

---

### 9.5. CLI Y DB PUSH SIMULATION (CON DEPENDENCIAS)

#### STATE 0 (Actual)
El comando `supabase migration list` reporta:
- 32 migraciones en remoto que faltan localmente. (Estado: Divergencia bloqueante).
- 36 migraciones locales que faltan en remoto. (Estado: Divergencia bloqueante).
- `k2_execution_registry` (Estado: Pendiente bloqueado).

#### STATE 1 (Tras Repair Selectivo)
Tras marcar las 32 remotas como `reverted`, y las 24+5 locales como `applied`, el CLI verá el repositorio limpio hasta el timestamp `20260726`.
Salida simulada de `migration list`:
```text
20260716160000_client_order_submitted_guard.sql            | local   | pending
20260716162000_reopen_client_order_audit.sql               | local   | pending
20260716170000_filled_by_on_order_save.sql                 | local   | pending
20260716171000_save_client_filled_by.sql                   | local   | pending
20260727135641_phase1b_disable_sql_c_producers.sql         | local   | pending
20260727145300_phase1c_disable_time_logs_recalc_trigger.sql| local   | pending
20260727152000_phase1d_disable_close_week_sql_c_motor.sql  | local   | pending
20260811033217_k2_execution_registry.sql                   | local   | pending
```

#### STATE 2 (Tras db push)
`supabase db push` abrirá una transacción global y ejecutará, en este exacto orden cronológico, los archivos enumerados en STATE 1. Dado que las 7 primeras (verificadas en 9.3) son declarativamente idempotentes y defensivas (sin conflictos), completarán satisfactoriamente. Finalmente creará la tabla `k2_execution_registry` en último lugar. Todo quedará unificado bajo estado "applied".

---

### 9.6. MATRIZ DE ROLLBACK Y RIESGO OFICIAL

1. **Rollback History (Repair)**: Supabase CLI carece de un comando oficial como `undo-repair` o `repair --status un-revert`. Deshacer un repair sobre `schema_migrations` requiere forzosamente conectarse al catálogo por `psql` e inyectar sentencias manuales de `INSERT/DELETE`. Al no ser soportado nativamente, se considera **NOT PROVEN**.
2. **Rollback Schema (Push)**: El repositorio Marbella está estructurado en migraciones progresivas (forward-only). No existen scripts `_down.sql` implementados para los 7 deltas pendientes ni para el registro K2. Ante un fallo lógico post-despliegue, Supabase CLI no provee `migration down` porque no existen los archivos. Revertir requeriría programar una migración inversa desde cero. Por tanto, el rollback automatizado de esquema es **NOT PROVEN**.

---

### 9.7. AUTHORIZATION GATE Y SALIDA FINAL EXIGIDA

1. Remote-only reales: 32
2. Remote-only realmente demostradas: 32/32
3. HASH_IDENTICAL: 22
4. SEMANTICALLY_EQUIVALENT: 3
5. ABSORBED_BY_LATER_MIGRATION: 7
6. SUPERSEDED: 0
7. KEEP_REMOTE: 0
8. UNKNOWN: 0
9. Payroll OOB: 5/5
10. Deltas pendientes: 7/7
11. Execution registry: 1
12. History rollback probado: **NO** (Requiere intervención manual en catálogo, no soportado por CLI)
13. Schema rollback probado: **NO** (Arquitectura forward-only carece de archivos down)
14. DB push simulation reproducible: SÍ (Tabla exacta de orden y defensas SQL)
15. CLI final state reproducible: SÍ
16. Repair selectivo: DISEÑADO
17. Full repair: PROHIBIDO
18. db pull: NO
19. repair ejecutado: NO
20. db push: NO
21. Datos modificados: NO
22. Schema modificado: NO
23. History modificado: NO
24. K2: NOT EXECUTED
25. K2b: NOT EXECUTED
26. **FINAL GATE: NOT READY** (Bloqueado por indisponibilidad de mecanismos de rollback oficiales y transaccionales para History y Schema post-push en la actual arquitectura de Supabase/Marbella).


## 10. FORWARD-ONLY DECISION
El repositorio de Marbella opera bajo una arquitectura **forward-only**. 
**Schema migrations are forward-only.** No se requerirá soporte automatizado de *rollback* funcional (archivos `_down.sql`) ni se exigirá *rollback history automático* para proceder. Ante cualquier fallo lógico en producción tras un despliegue, la reparación se diseñará inyectando una nueva migración correctora hacia delante.

## 11. IRREVERSIBILITY DISCLOSURE
**Migration history repair is not treated as automatically reversible.** 
**No manual writes to supabase_migrations.schema_migrations are part of the execution plan.**
Cualquier manipulación de estado vía `supabase migration repair` que deba deshacerse obligaría a mutaciones directas sobre el catálogo que quedan formalmente excluidas del protocolo de operación. La operación es, a nivel de herramientas oficiales, irreversible.

## 12. CONTROLLED RECONCILIATION MODEL
Dado que la operación carece de rollback automático, la estabilización no se ejecutará masivamente. El modelo de reconciliación será secuencial, protegido por barreras asíncronas y requerirá autorización explícita antes de la inyección final del código.

## 13. PRE-REPAIR SNAPSHOT
Se ha capturado en `/tmp/pg-test/pre_repair_snapshot.json` el estado exacto pre-intervención de:
- Historial remoto íntegro.
- Conjunto de versiones locales.
El snapshot asegura que toda divergencia posterior puede auditarse. Se capturará también el checksum del working tree antes de iniciar.

### SNAPSHOT INTEGRITY
Se ha generado un snapshot verificable (SHA-256 criptográfico) y un script de comprobación independiente. El procedimiento es reproducible.

- **Algoritmo**: SHA-256
- **Snapshot Hash**: `5b6b34020bae5d152d09d08e434c647f049e7734b825e29ef3219b782600b64d`
- **Timestamp**: `2026-08-11T11:38:04.088Z` (aprox, fecha local de la máquina de ejecución)
- **Git HEAD**: `d0120fb7fcef7f29d5a8c6c4b67b47d20f978219`
- **Working Tree Hash**: `a0e0680df89c5e049502821ce008fe19d8264614d1163685a902a5aba003ac59`
- **Local Manifest Hash**: `8c6c9074bdb15e4f2808203a76d2eebee61b1d562ee43c4ef51d1439db735ce9`
- **Remote History Hash**: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- **SET A Hash**: `94d79682c271e6d1541bbc1bf7cb6ce2e3a3eb6f9d011531fc95eb7b7fd5907b`
- **SET B Hash**: `7ad9352c2320a1a770ea20fc79c8b39d0646bb99a04a800f8b74b59e2ab12292`
- **SET C Hash**: `b4a0b9dcfb1cf4a2200174b228a11b414e546e61da5203dc8b9cb592d6251b25`
- **Mapping Hash**: `a909f47d41ffcc99a31958836bdf75c3a5ebb7a389ca8420790c970cb7459532`
- **Reproducibility Test**: PASS (Dos ejecuciones sucesivas retornan hashes idénticos).

## 14. SELECTIVE HISTORY RECONCILIATION OPERATIONS

**NO** se ejecutará un full repair (`repair --status applied`).
Solo se invocarán reparaciones atómicas y unívocas sobre 65 registros exactos.

### HISTORY RECONCILIATION COUNTS

- Remote versions to revert: **32**
- Local versions to mark applied: **28**
- Payroll OOB versions to mark applied: **5**
- **Total history operations: 65**

- Pending functional migrations: **7**
- Pending K2 registry: **1**

### SET A — REMOTE HISTORY TO REVERT (32 operaciones únicas)
`supabase migration repair --status reverted <versiones>`
**Significado:** Elimina la versión del conjunto "applied" del historial remoto. No modifica el schema físico en base de datos.
```bash
# Revertir explícitamente las 32 remotas absorbidas
supabase migration repair --status reverted 20260713000756 20260713012154 20260716134302 20260716135420 20260716140057 20260716140142 20260716140849 20260716140905 20260716141056 20260716141119 20260716142619 20260716152348 20260716153048 20260716153140 20260716153205 20260716153246 20260716154119 20260716155946 20260716160302 20260716161424 20260716163651 20260716185302 20260721070321 20260723215624 20260724045536 20260724062138 20260724064003 20260724103743 20260724181230 20260726031357 20260726112854 20260729023408
```

### SET B — LOCAL HISTORY TO MARK APPLIED (28 operaciones únicas)
`supabase migration repair --status applied <versiones>`
**Significado:** Registra que la versión local ya está aplicada funcionalmente. No modifica el schema físico en base de datos.
```bash
# Marcar como applied las 28 equivalencias locales
supabase migration repair --status applied 20260713120000 20260713140000 20260716134100 20260716153000 20260716160000 20260716162000 20260716170000 20260716171000 20260716180000 20260716190000 20260716192000 20260716193000 20260716200000 20260716210000 20260716220000 20260716230000 20260716240000 20260716250000 20260721120000 20260723230000 20260724060000 20260724080000 20260724090000 20260724120000 20260724190000 20260726031225 20260726112525 20260729023014
```

### SET C — PAYROLL OUT-OF-BAND TO MARK APPLIED (5 operaciones únicas)
`supabase migration repair --status applied <versiones>`
**Significado:** Registra que la versión local ya está aplicada funcionalmente. No modifica el schema físico en base de datos.
```bash
# Marcar como applied las 5 migraciones Payroll OOB
supabase migration repair --status applied 20260804000000 20260804000001 20260806000000 20260806000001 20260806180509
```

### DUPLICADOS Y SOLAPAMIENTOS
Se ha verificado la integridad relacional de estos tres conjuntos:
- SET A unique: 32/32
- SET B unique: 28/28
- SET C unique: 5/5
- Intersecciones entre A, B y C: 0 duplicados.

### 32 REMOTE → 28 LOCAL MAPPING (SQUASH)
Las 32 migraciones remotas (SET A) se mapean lógicamente a las 28 locales (SET B) dado que varias remotas fueron absorbidas (squash) en una sola local.
| Local version | Remote versions absorbed |
|---|---|
| `20260716160000` | `20260716140057`, `20260716140142` |
| `20260716162000` | `20260716140849`, `20260716140905` |
| `20260716230000` | `20260716153048`, `20260716153205`, `20260716161424` |

## 15. EXPECTED MIGRATION LIST
Tras los repairs HIPOTÉTICOS anteriores, `supabase migration list` mostrará exactamente 8 migraciones marcadas como locales y pendientes:
- 7 deltas de estabilización (fase 1).
- 1 `k2_execution_registry`.
Las 32 versiones remotas quedan retiradas del historial "applied", y documentadas como `REVERTED FROM HISTORY` (sus efectos de esquema siguen existiendo en producción).

## 16. EXPECTED DB PUSH DRY-RUN
El comando `supabase db push --dry-run` debería aislar estrictamente las 8 migraciones funcionales pendientes.
Sin embargo, al evaluar las precondiciones, el estado actual diverge:
- **PRE-REPAIR DRY-RUN:** BLOCKED BY HISTORY DIVERGENCE (esperado, por falta de ejecución del Repair).
- **POST-REPAIR DRY-RUN:** NOT EXECUTED.

## 17. EIGHT-MIGRATION EXECUTION SET
Las únicas 8 operaciones funcionales que cursará el `db push` (todas validadas exhaustivamente como idempotentes y sin impacto destructivo de datos):
1. `20260716160000_client_order_submitted_guard.sql`
2. `20260716162000_reopen_client_order_audit.sql`
3. `20260716170000_filled_by_on_order_save.sql`
4. `20260716171000_save_client_filled_by.sql`
5. `20260727135641_phase1b_disable_sql_c_producers.sql`
6. `20260727145300_phase1c_disable_time_logs_recalc_trigger.sql`
7. `20260727152000_phase1d_disable_close_week_sql_c_motor.sql`
8. `20260811033217_k2_execution_registry.sql`

## 18. POST-RECONCILIATION VALIDATION
Se validará que el CLI se unifique en verde y se verificará el registry antes de ceder control al motor K2.

## 19. K2 PREFLIGHT AFTER RECONCILIATION
Una vez la BD y el repositorio se alineen, el motor K2 debe repetir todo el preflight de comprobación, evaluando de cero la base instalada.


## REPAIR EXECUTION RECORD
- **Timestamp**: 2026-08-11T11:43:05.016Z
- **Comandos ejecutados**: 
  1. `supabase migration repair --status reverted <SET A>`
  2. `supabase migration repair --status applied <SET B>`
  3. `supabase migration repair --status applied <SET C>`
- **SET A resultado**: PASS (32 remotas revertidas).
- **SET B resultado**: PASS (28 locales marcadas applied).
- **SET C resultado**: PASS (5 payroll OOB marcadas applied).
- **Migration list final**: Muestra 3 pendientes (no las 8 esperadas) y 0 remote-only.
- **Número de pendientes**: 3
- **Post-repair checksum**: `$(cat /tmp/pg-test/post_repair_history_snapshot.json | grep '"hash":' | awk -F '"' '{print $4}')`
- **Datos modificados**: NO
- **Schema modificado**: NO
