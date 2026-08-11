---
documento: SPIKE-EJECUCION-FASE-1-DESBLOQUEO-K2
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-11
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA, PROTOCOLO-AGENTES
---

# Ejecución Fase 1 — Desbloqueo K2

> **MATERIAL NO NORMATIVO — SPIKE-EJECUCION-FASE-1-DESBLOQUEO-K2**
>
> Registro de la ejecución controlada de la primera resolución del plan de desbloqueo. Solo se generaron snapshot y dry-run locales read-only. No se ejecutó K2, no se modificaron datos y no se implementó R1.

**Plan:** `marbella-os/6-investigacion/spikes/2026-08-11-plan-desbloqueo-k2.md`  
**Fase ejecutada:** Fase 1 del DAG operativo, identificada con `R1`  
**Freeze inicial/final:** `INACTIVE` / `INACTIVE`  
**BD:** Supabase real `feqjbwxkelpgzsdiphei`

## A. Resolución y alcance

El primer nodo del DAG del plan es:

```text
R1 — Crear cola explícita de mappings ambiguos
```

El plan asigna a R1:

- tipo: `DATA + BACKEND`;
- fuente actual: `supplier_item_mappings`;
- salida prevista: cada caso conserva raw, causa, evidencia y estado;
- dependencias posteriores: K3/K8b;
- gate: `GATE R1 — Cola de revisión`.

No se ejecutó ninguna resolución posterior: R2, R3, R4, R5, R6, R7, R8, R9, R10, K2, K3 ni ninguna fase K posterior.

## B. Tipo de cambio

R1 requeriría una combinación de:

- **datos:** persistir estado y evidencia de los 216 casos;
- **backend/SQL:** definir el contrato de la cola y su acceso;
- **documentación:** conservar el estado `REQUIRES_REVIEW` y la regla de no conversión.

En la BD actual solo existe:

```text
supplier_item_mappings(id, supplier_id, supplier_item_name,
ingredient_id, conversion_factor, last_known_price, created_at,
line_billing_unit, line_content_qty, line_content_unit)
```

No existe `supplier_product_presentations`, `supplier_products` ni una cola persistente con campos de estado, causa, confianza o evidencia. El plan no define en R1 una tabla nueva ni un contrato SQL ejecutable para crearla. Crear una tabla, añadir columnas o modificar mappings ahora sería inventar esquema y ejecutar una resolución no autorizada.

**Conclusión:** Fase 1 requiere DATA+BACKEND, pero no es ejecutable de forma segura con el esquema actual. Se prepara el dry-run y se bloquea la escritura.

## C. Snapshot de seguridad

Se generó un snapshot nuevo sin sobrescribir el snapshot K2 original, el baseline ni snapshots anteriores:

```text
sql/diagnostics/k2/2026-08-11-fase-1-r1-ambiguous-mappings-snapshot.json
```

Características:

- artefacto: `K2_PHASE_1_R1_AMBIGUOUS_MAPPINGS_SNAPSHOT`;
- modo: `READ_ONLY`;
- filas: 216 mappings;
- productos distintos: 133;
- proveedores distintos: 13;
- clave de rollback: `supplier_item_mappings.id`;
- checksum de filas: `cc4b4337de8bf5c56a0c8dcbf9e355423cd549dd6d8f442def77ee15474c93e6`;
- tamaño: 110.439 bytes.

El snapshot contiene las columnas actuales del mapping y los nombres de producto/proveedor usados como evidencia. No contiene una propuesta de transformación ni modifica la BD.

## D. Dry-run Fase 1

Se generó:

```text
sql/diagnostics/k2/2026-08-11-fase-1-r1-ambiguous-mappings-dry-run.json
```

Características:

- artefacto: `K2_PHASE_1_R1_AMBIGUOUS_MAPPINGS_DRY_RUN`;
- filas `ANTES → DESPUÉS`: 216;
- productos: 133;
- proveedores: 13;
- propuestas de escritura: 0;
- tamaño: 294.566 bytes.

Cada fila contiene:

- `id` como PK;
- `before` con los valores actuales completos del mapping;
- `after.resolution_state = REQUIRES_REVIEW`;
- `after.proposed_* = null` para presentación, contenido, unidad de referencia y factor;
- `action = HOLD_NO_WRITE`;
- motivo: falta contenido estructurado;
- regla: no usar `ud`, caja, pack ni factor implícito;
- evidencia original y confianza `NONE`.

Ejemplo conceptual aplicado a las 216 filas:

```text
ANTES:
  line_billing_unit = NULL
  line_content_qty = NULL
  line_content_unit = NULL
  conversion_factor = 1

DESPUÉS PROPUESTO:
  resolution_state = REQUIRES_REVIEW
  proposed_presentation = NULL
  proposed_content = NULL
  proposed_factor = NULL
  action = HOLD_NO_WRITE
```

El valor `1` se conserva como observación legacy, no como propuesta semántica.

## E. Validación del dry-run

Validaciones ejecutadas sobre el artefacto:

| Comprobación | Resultado | Evidencia |
|---|---|---|
| 216 filas de snapshot | PASS | `counts.mappings=216`; `rows.length=216` |
| PK presente en todas las filas | PASS | snapshot ordenado por `id` |
| Ninguna propuesta de factor | PASS | 216 `proposed_factor=NULL` |
| Ninguna propuesta de unidad | PASS | 216 `proposed_content_unit=NULL` y `proposed_reference_unit=NULL` |
| Ninguna conversión arbitraria | PASS | estado único `REQUIRES_REVIEW` |
| Ninguna pérdida de raw | PASS | `before` conserva campos actuales |
| Ninguna fila fuera de alcance | PASS | solo `supplier_item_mappings` ambiguos |
| Relaciones no modificadas | PASS | no hubo SQL DML |
| Segunda fuente de verdad introducida | PASS | no se creó cola persistente |
| Contrato persistente para escribir la cola | **FAIL** | no existe tabla/campo autorizado para el estado R1 |

El dry-run es determinista como **clasificación de no conversión**, pero no es ejecutable como escritura porque la salida persistente de R1 no está definida en el esquema actual. No se fuerza ningún caso.

## F. Escritura

No se ejecutó la escritura de Fase 1.

- `UPDATE`: 0;
- `INSERT`: 0;
- `DELETE`: 0;
- `UPSERT`: 0;
- migraciones: 0;
- backfill: 0;
- cambios de writers: 0;
- cambios de arquitectura: 0;
- K2: no ejecutada.

La condición “si el dry-run es determinista, escribir” no se satisface completamente: la clasificación es determinista, pero el destino de persistencia no está autorizado ni definido. Es un bloqueo de contrato, no permiso para inventar una tabla o escribir sobre `supplier_item_mappings`.

## G. Writers

Fase 1 no modifica ninguno de los 13 writers.

El freeze oficial sigue siendo el mecanismo de bloqueo para una futura ventana K2b. En este análisis no se adquirió el freeze porque todas las operaciones fueron `SELECT` y generación local de artefactos.

## H. Tests y validaciones

Tests específicos ejecutados:

- parseo JSON del snapshot: PASS;
- parseo JSON del dry-run: PASS;
- conteos snapshot/dry-run: PASS, 216/216;
- validación de propuestas: PASS, 0 filas con factor, unidad o presentación propuesta;
- consulta read-only de esquema: PASS, solo existe `supplier_item_mappings` entre las tablas consultadas;
- comprobación final de freeze: PASS, `INACTIVE`;
- `npm run validate:corpus`: PASS, corpus válido con los dos avisos preexistentes de reglas huérfanas.

No se ejecutaron tests de implementación de R1 porque no existe implementación. No se puede declarar PASS funcional de una cola que no tiene contrato persistente.

## I. Rollback

No hay rollback de datos porque no hubo escritura.

El snapshot permite rollback exacto por `supplier_item_mappings.id` si una futura implementación de R1 llegara a modificar filas, pero esta ejecución no produjo ningún delta que revertir.

El snapshot K2 original y el baseline permanecen intactos.

## J. Gate Fase 1

```text
DRY-RUN CLASIFICACIÓN = PASS
ESCRITURA DE R1 = NO EJECUTADA
CONTRATO PERSISTENTE R1 = FAIL
FASE 1 = BLOCKED
FASE 2 = NO EJECUTADA
K2 = NO EJECUTADA
FREEZE FINAL = INACTIVE
```

El gate no pasa porque falta el contrato autorizado para persistir `REQUIRES_REVIEW`, causa, evidencia y confianza. No se continúa con Fase 2 ni con ninguna fase posterior.

## K. Siguiente dependencia

La siguiente acción no es Fase 2 automática. Antes debe existir una decisión/implementación autorizada del contrato de R1, dentro del modelo ya aprobado:

- destino persistente de la cola;
- columnas de estado, causa, evidencia y confianza;
- RLS/permisos si se crea una tabla canónica;
- writer único y ruta de lectura;
- test de 216 filas y rollback por PK.

Hasta que eso exista, los 216 casos permanecen en `supplier_item_mappings` como raw legacy y fuera de toda conversión.
