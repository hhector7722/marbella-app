---
documento: SPIKE-K2B-PRODUCTION-EXECUTION-REPORT
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: agente
---

# K2b Production Execution Report

## 1. Problema original
Ejecuciones anteriores de K2 fallaban lanzando un error `K2_BEFORE_CONFLICT` sobre el registro:
- **id:** `0fce07d0-7f1e-4cb6-b0ab-8d60b06d68f8`
- **columna:** `unit_type`

## 2. Root cause confirmado
El responsable es el trigger `trigger_ingredients_pack_pricing_sync`.

**Cadena causal:**
1. Mutación explícita sobre `purchase_unit`.
2. El trigger `trigger_ingredients_pack_pricing_sync` se ejecuta interceptando la mutación.
3. El trigger reasigna en la misma fila las columnas dependientes: `unit_type`, `unit` y `base_unit`.
4. El antiguo runner, validando celda a celda en línea, detectaba falsamente un `K2_BEFORE_CONFLICT` porque intentaba evaluar el `before_value` de `unit_type` después de que el trigger ya lo hubiera sobrescrito.

## 3. Why the old runner failed
El antiguo runner implementaba la lógica de mutación y aserción en una única instrucción SQL entrelazada por operación:
```sql
UPDATE ... WHERE PK = X AND column IS NOT DISTINCT FROM before_value
```
Cuando un trigger de negocio en la base de datos modificaba otra columna de la **misma fila** durante el transcurso de un `UPDATE` temprano, las operaciones subsecuentes planificadas en la misma allowlist sobre esa fila intentaban evaluar el estado original. Al encontrarse con un estado intermedio producido intencionadamente por el propio trigger, el runner interpretaba que había ocurrido drift y abortaba la transacción para garantizar seguridad.

## 4. Solución
La implementación de la **Estrategia B** refactoriza la emisión del SQL (en `buildK2bSql`) separando lógicamente las fases para evitar falsos positivos internos:
- **FASE A:** `BEFORE` validation completa para todas las operaciones en conjunto (antes de emitir ningún UPDATE).
- **FASE B:** `UPDATE` por fila basada exclusivamente en la Primary Key (sin el condicional `before_value` en el `WHERE`).
- **Validación ROW_COUNT:** Cada actualización confirma que exactamente `1` fila fue alterada (`v_count <> 1 THEN RAISE`).
- **FASE C:** `POSTCONDITION` global después de ejecutar todas las mutaciones para confirmar que el target value de la allowlist se alcanzó efectivamente.
- Transacción atómica encapsulada (`BEGIN; ... COMMIT;`).
- Allowlist inmutable que preserva la intención de negocio intacta.

## 5. Validación previa (Read-Only)
Antes de autorizar la ejecución productiva, se confirmaron empíricamente todas las precondiciones sin efectos secundarios:
- **71/71 MATCH** contra producción (estado inicial perfecto).
- **0 DRIFT**, **0 MISSING**.
- **Checksum auditado:** `999f93c0b071fbc05f08bdd05f5797ef85be79020184f0eaf0e8d62a1374b0b4`
- Runner tests verificados: **21/21 PASS**.
- Allowlist tests verificados: **10/10 PASS**.
- Validación del corpus normativo: **PASS**.
- Integración en entorno simulado aislado: **PASS**.

## 6. Ejecución real
- **Fecha/Hora:** `2026-08-11T20:06:50.685Z` (Acquired) / `2026-08-11T20:06:54.762Z` (Committed)
- **run_id:** `70e9147f-0d38-4da3-b2d1-4e5fc9354f19`
- **Estado:** `COMMITTED`
- **Operaciones:** 71/71 ejecutadas con éxito.
- **Rechazos:** 0.

## 7. Verificación posterior (Post-flight)
- **71 MATCH** de validación de postcondición manual (expected value real en DB).
- **0 MISMATCH**, **0 MISSING**.
- **Caso conflictivo verificado:** El registro `0fce07d0-7f1e-4cb6-b0ab-8d60b06d68f8` finalizó con `purchase_unit = ud`, `unit_type = ud`, `unit = ud` y `base_unit = ud` correctos.
- **K2 Freeze liberado:** Activo = `false` para `k2_units`.
- **0** transacciones o runs conflictivos posteriores.

## 8. Seguridad garantizada
- Allowlist **no fue modificada**, preservando su autoría e intención original.
- Checksum exacto validado durante preflight y writing phases.
- Los triggers de negocio **no se desactivaron**, manteniéndose fieles a las reglas del dominio (`session_replication_role` intacto).
- No se filtraron operaciones anómalas u *outside changes* detectables (Paridad total preservada).
- No se registraron bloqueos intermedios ni rollbacks parciales; se confirmó un COMMIT único.

## 9. Conclusión
- **K2b PRODUCTION VERIFIED.**
- **Estrategia B VALIDATED.**
