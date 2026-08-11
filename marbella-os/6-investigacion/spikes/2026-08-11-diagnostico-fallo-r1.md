---
documento: SPIKE-DIAGNOSTICO-FALLO-R1
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

# Diagnóstico causal del gate R1

> **MATERIAL NO NORMATIVO — SPIKE-DIAGNOSTICO-FALLO-R1**
>
> Diagnóstico read-only del fallo de Fase 1/R1. No modifica los informes anteriores, no repite la escritura, no ejecuta Fase 2 y no ejecuta K2.

**Freeze:** `INACTIVE`  
**Datos modificados:** `NO`  
**Snapshot R1:** 216 mappings, 133 productos, 13 proveedores  
**K2:** no ejecutada.

## A. Estado R1

R1 fue preparada mediante:

- `sql/diagnostics/k2/2026-08-11-fase-1-r1-ambiguous-mappings-snapshot.json`;
- `sql/diagnostics/k2/2026-08-11-fase-1-r1-ambiguous-mappings-dry-run.json`;
- `marbella-os/6-investigacion/spikes/2026-08-11-ejecucion-fase-1-desbloqueo-k2.md`.

Los 216 mappings fueron clasificados como `REQUIRES_REVIEW`, con `HOLD_NO_WRITE`, sin factor, unidad ni presentación propuesta. El dry-run específico es correcto como clasificación de no conversión.

El fallo se produjo al intentar tratar R1 como una escritura de una cola persistente sin que el modelo actual tenga tabla, columnas ni contrato de writer para esa cola.

## B. Gate R1 completo

El plan define literalmente:

```text
GATE R1 — Cola de revisión

PASS si: existen 216 IDs reproducibles, causa, proveedor, producto,
raw, estado y prohibición de conversión automática.

FAIL si: una fila usa ud, factor=1 o último mapping como resolución.
```

Para diagnosticarlo sin añadir una regla silenciosa, se separa la regla literal de su precondición operativa de escritura:

| ID | Condición | Resultado | Evidencia |
|---|---|---|---|
| R1-G1 | 216 IDs reproducibles | PASS | snapshot con 216 PK `supplier_item_mappings.id` |
| R1-G2 | causa disponible | PASS semántico | dry-run `reason`: faltan `line_content_qty/unit`; la causa es común y reproducible |
| R1-G3 | proveedor, producto y raw | PASS | `supplier_id`, `ingredient_id`, nombres y `before` en 216 filas |
| R1-G4 | estado disponible | PASS en dry-run | `after.resolution_state=REQUIRES_REVIEW` en 216 filas |
| R1-G5 | prohibición de conversión automática | PASS | `proposed_factor=NULL`, unidades/presentación nulas y `HOLD_NO_WRITE` en 216 filas |
| R1-G6 | destino persistente autorizado para la cola | **FAIL operativo** | solo existe `supplier_item_mappings`; no existe cola ni `supplier_product_presentations` |

`R1-G6` no aparece escrito como línea independiente en el gate literal. Es una precondición necesaria para ejecutar la resolución DATA+BACKEND descrita por el propio plan. Su ausencia explica por qué el artefacto read-only puede satisfacer el gate literal, pero la ejecución de la resolución no puede pasar a escritura.

## C. Condiciones PASS

Las condiciones literales de clasificación R1 pasan:

- los 216 casos son reproducibles por PK;
- cada fila conserva proveedor, producto y raw;
- el motivo de revisión está presente;
- todas tienen estado de espera;
- ninguna recibe `ud`, factor 1, último mapping ni presentación inventada;
- no hubo DML ni cambios de writers;
- el freeze terminó `INACTIVE`.

Los 216 casos no son la causa de un FAIL de clasificación. Son precisamente el conjunto que R1 debe proteger de una conversión automática.

## D. Condición FAIL

### R1-G6 — falta de contrato persistente

**Tabla actual:** `public.supplier_item_mappings`  
**PK:** 216 `id` del snapshot R1  
**Columnas actuales:** `conversion_factor`, `line_billing_unit`, `line_content_qty`, `line_content_unit`, `last_known_price`  
**Valor común:** contenido y unidad ausentes; `conversion_factor=1` legacy  
**Regla:** el valor 1 no puede convertirse en resolución semántica  
**Evidencia:** el dry-run deja todos los campos propuestos nulos y `HOLD_NO_WRITE`  
**Dependencia:** destino de cola y writer canónico de R1, previsto para K3/K8b.

No existe una columna actual para `resolution_state`, `cause`, `evidence`, `confidence` o `review_owner`. Tampoco existe la tabla canónica de supplier presentation en la BD real. Añadirla ahora sería una migración y una decisión de implementación, ambas fuera de esta tarea.

**Clasificación del FAIL: B, falta una resolución técnica de persistencia.**  
También tiene componente C: el intento de exigir escritura en Fase 1 adelanta una materialización que el DAG sitúa en K3/K8b.

## E. Causas de los 216

Los casos son 216 filas, no 216 causas independientes:

| Causa que impide resolver | Casos | Porcentaje | Resolución prevista |
|---|---:|---:|---|
| Falta `line_content_qty/unit` | 216 | 100,00 % | obtener presentación de proveedor o mantener revisión |
| `line_billing_unit` ausente y `conversion_factor=1` | 216 | 100,00 % | eliminar interpretación del fallback; estado explícito |
| Señal textual de pack/tamaño sin dato estructurado | 111 | 51,39 % | usar texto solo como candidato; confirmar manualmente |
| Mapping dentro de par producto-proveedor duplicado | 145 | 67,13 % | selección determinista en K3 o estado de revisión |
| Sin señal textual interpretable | 105 | 48,61 % | pedir dato externo o conservar legacy |

Las categorías se solapan. La causa principal no es un algoritmo incapaz de calcular: es que faltan datos estructurados y un destino autorizado para conservar el estado sin inventar una conversión.

## F. Los 14 no migrables

No hay `NO MIGRABLE REAL` demostrado. Los 14 son no migrables **automáticamente con los datos actuales**, pero todos tienen una vía eventual si aparece evidencia o una decisión de receta.

| Grupo | Líneas | Falta | Datos existentes útiles | Qué impide automatizar |
|---|---:|---|---|---|
| Bebidas: Juver naranja, Juver piña, Nestea, Powerade, Red bull, Trina naranja, Voll damm | 7 | contenido por botella/lata | producto, proveedor y unidades `u/ud` → `ml/l` | no existe `piece_content_qty/unit` ni presentación confirmada |
| Alimentos: Ajo, Apio, Arandanos, Cebolla seca, Frambuesas, Fresas | 7 | intención de receta y/o peso por pieza | producto, proveedor y receta afectada | `ud/l` frente a `kg` puede significar receta incorrecta o presentación por pieza |

Los 7 primeros pueden resolverse aportando el dato del proveedor o del albarán. Los 7 segundos requieren decisión humana porque el sistema no sabe si debe corregir la unidad de receta o modelar contenido por pieza.

## G. Los 7 casos humanos

Las decisiones pendientes son concretas:

| Producto | Receta real afectada | Decisión humana necesaria |
|---|---|---|
| Ajo | `Mejillones`, unidad `l` | confirmar si la línea es realmente un volumen de ajo o si la receta debe usar masa/pieza; aportar evidencia |
| Ajo | `Roastbeef con parmesano`, unidad `ud` | decidir si `ud` representa una pieza y qué peso/contenido tiene, o corregir la unidad de receta |
| Apio | `Roastbeef con parmesano`, unidad `ud` | decidir si la receta usa piezas o peso; solo después puede existir un puente por presentación |
| Arandanos | `Sangria de Cava`, unidad `ud` | decidir conteo de bayas o cantidad de peso; el nombre no proporciona gramaje |
| Cebolla seca | `Roastbeef con parmesano`, unidad `ud` | decidir si es una pieza o una cantidad por peso y documentar la elección |
| Frambuesas | `Sangria de Cava`, unidad `ud` | decidir conteo o peso por receta y aportar presentación si procede |
| Fresas | `Sangria de Cava`, unidad `ud` | decidir conteo o peso por receta y aportar presentación si procede |

No se puede obtener ninguna de esas decisiones de `conversion_factor=1`. Si no se decide, la línea permanece legacy con `REQUIRES_REVIEW`.

## H. Las 6 invariantes globales

| Invariante global | Evidencia | ¿Preexistente a R1? | ¿R1 responsable? | Fase propietaria |
|---|---|---|---|---|
| Precio tiene unidad de referencia | 226 precios dependen implícitamente de `purchase_unit` | sí | no | R5/K8a/K9 |
| Caja sin contenido no se convierte | 216 mappings sin contenido | sí | **sí, como guardia de no conversión** | R1; materialización K3/K8b |
| Conversión desconocida no devuelve 0 | `fn_recipe_line_cost` retorna 0 con conversión nula | sí | no | R8/K4/K7 |
| Coste desconocido no devuelve 0 | 33 precios cero y 14 líneas incompatibles | sí | no | R8/K4 |
| Supplier presentation propia | 216 mappings incompletos, 133 productos | sí | parcialmente: clasificación | R1/R2/R3/K8b |
| Histórico conserva precio/unidad | 1.162 históricos sin unidad de referencia | sí | no | R5/K9 |

**Invariantes globales FAIL: 6.**  
**Invariantes realmente responsabilidad de R1: 1**, y R1 la satisface como guardia read-only: ningún caso sin contenido recibe conversión. Las otras cinco no deben convertirse artificialmente en una condición de R1; pertenecen a R2/R3/R5/R8 y fases K posteriores.

## I. Writers relevantes

Los 13 writers de columnas K2 no son responsabilidad de R1; pertenecen al control de K2b/K5/K8b/K11/K12. R1 no debe migrarlos anticipadamente.

Sí existen **3 rutas de escritura de mappings** relevantes para una futura persistencia o revisión R1:

| Writer | Tabla/campo | Ruta | Qué escribe | Riesgo para R1 | Acción |
|---|---|---|---|---|---|
| Confirmación de factor/mapping | `supplier_item_mappings` completo | `src/app/dashboard/albaranes/actions.ts:1410-1423` | upsert de factor, billing/content y precio | puede convertir un caso en activo mientras está en revisión | R1 no lo modifica; debe controlarse antes de persistir la cola |
| Aplicación de stock con diccionario | `supplier_item_mappings.conversion_factor` | `src/app/dashboard/albaranes/actions.ts:1738-1750` | crea `conversion_factor=1` si falta | reproduce exactamente el fallback bloqueado | R1 NO RESPONSABLE; debe resolverse en R8/R9 |
| Mapeo desde recetas TPV | `supplier_item_mappings` insert/delete/upsert | `src/app/dashboard/recetas-tpv/actions.ts:78-126` | elimina o crea mapping con default 1 | puede destruir o completar raw durante revisión | R1 NO RESPONSABLE; controlar en fase de writers |

`src/lib/actions/albaranes.ts` también escribe mappings y precios, pero es una ruta relacionada de recepción/precio, no una de las 13 columnas K2; su tratamiento pertenece a R8/R9/K9. Por tanto, **writers relevantes para R1: 3 rutas de mappings; writers K2 heredados dentro de R1: 0**.

## J. Alineación del gate

### Gate literal

El gate literal es **GATE VALID** para una clasificación read-only: sus cinco condiciones se cumplen y no exige resolver datos ausentes ni las seis invariantes globales.

### Gate de ejecución usado

El gate operativo aplicado en la ejecución añadió:

```text
CONTRATO PERSISTENTE R1 = PASS requerido
```

Ese requisito no está explicitado en el gate literal y su destino pertenece a las dependencias K3/K8b. Por tanto:

```text
GATE MISALIGNED = SÍ, para la escritura de Fase 1
GATE LITERAL = VÁLIDO, para el dry-run read-only
```

No se cambia el gate unilateralmente. Se registra que hay dos puertas distintas que no deben confundirse:

1. `R1-CLASSIFICATION PASS`: artefacto read-only completo.
2. `R1-PERSISTENCE READY`: contrato/técnica de cola aprobados en la fase que corresponda.

## K. Causa principal

**Conclusión principal: C — R1 se bloqueó al exigir una condición de materialización que pertenece a una dependencia posterior.**

La causa técnica subyacente es B: no existe contrato persistente para la cola. Los datos faltantes son una causa secundaria de los 216, no el motivo por el que el dry-run de R1 falla: el comportamiento correcto ante esos datos es precisamente `REQUIRES_REVIEW`.

## L. Causas secundarias

1. B: la BD actual no tiene destino persistente autorizado para estado, causa, evidencia y confianza.
2. A: los 216 mappings no tienen contenido estructurado, por lo que no se puede hacer una resolución de presentación.
3. E/D: tres rutas de mappings pueden escribir o generar `conversion_factor=1` mientras la revisión está abierta.
4. C: el plan mezcla la preparación de la cola R1 con su materialización futura en K3/K8b.
5. Las invariantes globales fallan, pero no son el alcance de R1.

## M. Desbloqueo mínimo

El siguiente paso mínimo no es repetir la escritura ni ejecutar Fase 2:

1. Confirmar si R1 debe terminar como artefacto read-only o como cola persistente.
2. Si debe ser persistente, definir y aprobar el contrato dentro del modelo canónico ya decidido: destino, estado, evidencia, confianza, RLS, writer y rollback.
3. Mantener los 216 mappings raw sin cambios hasta esa definición.
4. Controlar las 3 rutas de mappings antes de cualquier operación que pretenda marcar un caso como resuelto.

No se necesita cambiar el algoritmo de conversión para hacer pasar R1. Tampoco se necesita tocar las 13 rutas de unidades, precios o recetas en esta fase.

## N. Nuevo criterio de gate

Sin modificar todavía el plan normativo ni el código, el diagnóstico propone separar la lectura del siguiente modo para la próxima decisión explícita:

### `R1-CLASSIFICATION PASS`

Pasa si:

- existen los 216 PK reproducibles;
- cada fila tiene causa, proveedor, producto, raw y estado `REQUIRES_REVIEW`;
- ninguna fila recibe unidad, factor o presentación;
- los 3 writers de mappings no forman parte del artefacto ni han escrito durante la lectura;
- snapshot y dry-run son íntegros.

El artefacto actual cumple este criterio.

### `R1-PERSISTENCE READY`

No pasa todavía. Requiere contrato aprobado y prueba de escritura controlada, que no se puede inventar en este diagnóstico.

`R1-CLASSIFICATION PASS` no autoriza R1-PERSISTENCE ni K2. `DRY-RUN PASS` tampoco autoriza `WRITE K2 AUTHORIZED`.

## O. Próximo paso

Esperar decisión explícita sobre el destino de la cola R1. Mientras tanto:

- no repetir la escritura;
- no modificar `supplier_item_mappings`;
- no corregir `conversion_factor`;
- no migrar writers;
- no ejecutar Fase 2;
- no ejecutar K2;
- mantener freeze `INACTIVE`.

## Estado final

```text
GATE R1 = FAIL OPERATIVO
R1-CLASSIFICATION = PASS READ-ONLY
R1-PERSISTENCE = NOT READY
CAUSA PRINCIPAL = C
DATOS MODIFICADOS = NO
FREEZE = INACTIVE
FASE 2 = NO AUTORIZADA
K2 = NO EJECUTADA
```
