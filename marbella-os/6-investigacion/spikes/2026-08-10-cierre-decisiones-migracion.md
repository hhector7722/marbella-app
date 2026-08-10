---
documento: SPIKE-CIERRE-DECISIONES-MIGRACION
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-10
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA, DEUDA, ESTADO, MAPA-DE-CAPACIDADES, PRINCIPIOS, SEGURIDAD
---

# Cierre definitivo de decisiones — Migración del dominio producto/unidades

> **MATERIAL NO NORMATIVO — SPIKE-CIERRE-DECISIONES-MIGRACION**
>
> Revisión de diseño fechada el 2026-08-10. No modifica código, SQL, datos, tablas ni migraciones. No edita los spikes anteriores.
>
> Este documento cierra las decisiones de diseño pendientes para que otro agente pueda iniciar la ejecución sin reabrir estas cuestiones. Los gates descritos aquí se ejecutan durante K; este documento no afirma que ya se hayan ejecutado.

**Documentos revisados:**

- `2026-08-10-auditoria-dominio-producto-unidades.md`.
- `2026-08-10-revision-critica-unidades-por-contexto.md`.
- `2026-08-10-revision-final-consistencia-plan-migracion.md`.
- `2026-08-10-resolucion-bloqueos-migracion.md`.
- `2026-08-10-plan-migracion-dominio-producto-unidades.md`.

**Normativa aplicada:** `CANON`, `GLOSARIO`, `MODELO-DE-DATOS`, `PRECIOS-Y-COMPRAS`, `ARQUITECTURA`, `PRINCIPIOS`, `SEGURIDAD`, `DEUDA`, `ESTADO` y `MAPA-DE-CAPACIDADES`.

---

## 1. Estado anterior

El estado anterior era:

```text
B1 RESOLVED
B3 RESOLVED
B4 RESOLVED
B5 RESOLVED
B6 RESOLVED
B7 RESOLVED
B2 CONDITIONALLY_RESOLVED
B9 CONDITIONALLY_RESOLVED
B10 CONDITIONALLY_RESOLVED
B8 BLOCKED — DECISION REQUIRED

NOT READY FOR EXECUTION
```

Este documento cierra B2, B8, B9 y B10 con decisiones concretas. No cambia el plan inmutable; define el contrato que el plan debe seguir durante su ejecución.

---

## 2. B8 — Coste desconocido frente a coste real cero

### Problema y ruta que ocultaba el error

La ruta real identificada es:

```text
fn_recipe_line_cost / get_recipe_cost SQL
  → conversión NULL
  → RETURN 0
  → backendCost.total_cost
  → recipes/[id]/page.tsx prioriza backendCost
```

En paralelo, TypeScript ya distingue el problema en `getRecipeIngredientLineCostAnalysis`: devuelve estado `incompatible_units` o `missing_price`, aunque algunas funciones antiguas exponen solo el número `0`. Esa coexistencia contradice `PRECIOS-Y-COMPRAS §6`, `MODELO-DE-DATOS §4` y `PRINCIPIOS §2-3`.

### DECISIÓN: estados definitivos

```text
DECISIÓN:
El contrato canónico de coste utiliza OK, MISSING_PRICE,
MISSING_CONVERSION, INCOMPATIBLE_UNITS, PRESENTATION_UNKNOWN,
AMBIGUOUS_CONVERSION y REQUIRES_REVIEW.

NO:
usar VALID, null ambiguo, 0 semántico o excepciones distintas por capa.
```

`OK` es el estado equivalente al `ok` existente en TypeScript. Los estados en el contrato SQL/JSON se publican en mayúsculas; los adapters de presentación pueden etiquetarlos, pero no cambiarlos de significado.

| Estado | Significado | Coste |
|---|---|---|
| `OK` | Cantidad, unidad, conversión y precio válidos | `cost_eur` numérico; puede ser 0 solo por cantidad realmente cero |
| `MISSING_PRICE` | No existe precio normalizado válido | `cost_eur: null` |
| `MISSING_CONVERSION` | Falta una conversión requerida | `cost_eur: null` |
| `INCOMPATIBLE_UNITS` | Dimensiones incompatibles sin puente autorizado | `cost_eur: null` |
| `PRESENTATION_UNKNOWN` | Falta contenido de pack/presentación | `cost_eur: null` |
| `AMBIGUOUS_CONVERSION` | Hay más de una relación o una aproximación no aprobada | `cost_eur: null` |
| `REQUIRES_REVIEW` | La entrada observada o su mapping no puede promoverse | `cost_eur: null` |

`cost_eur: null` no significa coste real cero; significa coste desconocido o inválido. Un resultado de coste real cero lleva `status: OK` y una cantidad comprobablemente cero.

### Contrato por capa

| Capa | Resultado obligatorio |
|---|---|
| SQL `fn_recipe_line_cost_v2` | JSON por línea `{status, qty_buy, line_cost_eur, note}`; nunca devuelve 0 por fallo |
| SQL `get_recipe_cost_v2` | `{status, total_cost_eur, lines}`; si alguna línea no es `OK`, conserva estados y no presenta total como coste válido |
| Backend/Server Action | Reenvía el contrato sin convertir `null` o estado a número 0 |
| Cost Engine | Resultado estructurado, no `number` desnudo |
| Recipe cost | Cada línea conserva cantidad/unidad y estado; total marcado `REQUIRES_REVIEW` si faltan líneas |
| Dashboards/insights | Excluyen costes no `OK` de porcentajes o muestran el estado; nunca los cuentan como 0 |
| Frontend | Pinta `—` y el estado; no recalcula ni transforma desconocidos |

### Eliminación del wrapper peligroso

La función TypeScript que hoy devuelve solo `number` no puede seguir siendo una API de dominio. En la migración:

1. el wrapper devuelve el objeto de análisis estructurado;
2. todo caller debe consumir `status` antes de leer `cost_eur`;
3. no existe fallback `eur: 0` para incompatibilidad;
4. el RPC antiguo no conserva una compatibilidad semánticamente falsa;
5. K7 prueba paridad de estados y valores TS/SQL.

### Migración, validación y rollback

- K4 reemplaza el contrato antes de activar lectores canónicos.
- K11 elimina lectores de la respuesta antigua antes del cut-over de interfaz.
- Test incompatible `kg → L` debe devolver `MISSING_CONVERSION` o `INCOMPATIBLE_UNITS`, nunca 0.
- Rollback técnico: flag a la interfaz anterior solo si esa interfaz recibe estados; no se permite volver al RPC que silencia.
- Rollback de datos: no hay que borrar costes; los resultados son derivados.

**B8: `RESOLVED`.** Esta decisión cierra el bloqueo del coste actual. El coste histórico se define en §4 y usa la misma semántica de estados.

---

## 3. Decisión de defaults

### Análisis semántico

`products` representa identidad: qué producto es, su nombre, estado y categoría. Las unidades por defecto, presentación por defecto, proveedor preferido y cantidades sugeridas son configuración operacional mutable. No son identidad y pueden requerir auditoría temporal.

### DECISIÓN: entidad separada

```text
DECISIÓN:
product_defaults

NO:
products.default_*
```

### Razones

1. Separa identidad del producto de configuración de compras, stock, receta y pedido.
2. Agrupa en un único dueño los defaults de unidad, presentación, proveedor y cantidades sugeridas sin inflar la entidad maestra.
3. Permite versionar o auditar cambios de configuración sin reescribir la identidad del producto.
4. Hace explícito que un default es una elección operativa, no una propiedad física universal del producto.
5. Permite añadir configuración contextual sin convertir `products` en una tabla de preferencias.

### Modelo definitivo

`product_defaults` tiene cardinalidad **1:1 vigente por `product_id`**. La configuración vigente contiene como mínimo:

- `product_id` FK y unique;
- `buy_unit_id` FK a `units`;
- `stock_unit_id` FK a `units`;
- `recipe_unit_id` FK a `units`;
- `order_presentation_id` FK a `product_presentations`;
- `preferred_supplier_product_id` FK nullable;
- cantidades sugeridas junto a su unidad FK;
- `has_stock_tracking`/estado aplicable según el modelo de producto;
- actor y timestamps de auditoría.

Para productos inventariables, buy/stock/recipe deben estar completos y ser dimensionalmente compatibles o tener un puente de presentación explícito. La ausencia de un default requerido produce `REQUIRES_REVIEW`; nunca se rellena con `kg`, `ud` o factor 1.

### Writers y readers

- **Writer autorizado:** servicio de catálogo de producto, invocado por las acciones de gestión de ingredientes con permiso adecuado.
- **Readers:** precio, compras, recepción, stock, inventario, recetas y coste.
- **No escriben:** OCR, IA, albarán automático, webhook de venta, frontend directo ni cron.
- **Cardinalidad:** cero filas solo para producto no preparado; una fila para producto operativo; nunca varias filas vigentes.

### Migración y rollback

1. Crear tabla y constraints.
2. Backfill desde las columnas legacy con reporte por producto.
3. Marcar ambiguos sin crear default inventado.
4. Habilitar lectura canónica tras validación.
5. Convertir columnas legacy en proyección read-only temporal.
6. K12 elimina columnas tras el gate de legacy.

Rollback: apagar lectura canónica y conservar la tabla nueva; no borrar configuraciones ni reactivar escritores independientes legacy.

### REJECTED

`products.default_*` queda **REJECTED** como estructura de configuración. No se mantiene como alternativa futura ni como segunda fuente. Si se requiere una propiedad estrictamente intrínseca, se resuelve mediante una vista de producto que proyecta `product_defaults`; la autoridad sigue siendo `product_defaults`.

---

## 4. Decisión de costes históricos

### DECISIÓN: combinación obligatoria

```text
DECISIÓN:
versionado temporal de maestros + snapshot mínimo inmutable por transacción.

NO:
versionado temporal como única garantía.
NO:
snapshot aislado sin versionado de maestros.
```

La razón es que Marbella necesita dos propiedades distintas:

- evolución centralizada de los maestros;
- reproducción exacta del hecho que ocurrió, aunque posteriormente se corrijan maestros.

### Qué se versiona

Se versionan temporalmente los maestros que pueden cambiar el coste:

- `product_prices` y su vigencia;
- `product_defaults`;
- `product_presentations` y contenido;
- `supplier_product_presentations`;
- `unit_conversions`;
- recetas y líneas de receta, incluyendo cantidad, unidad, yield y merma.

Cada versión tiene identificador estable, `valid_from`, `valid_to` y referencia de cambio. Una corrección futura cierra la versión anterior y crea otra; no actualiza el pasado.

### Qué se snapshottea

En cada hecho transaccional que produce coste o stock valorado se conserva el snapshot mínimo:

- `product_id` y nombre snapshot;
- receta y versión de receta;
- línea de receta, cantidad y unidad;
- presentación y versión usada, si existe;
- proveedor y `supplier_product`/SKU;
- precio original de presentación y unidad facturada;
- precio normalizado y `reference_buy_unit`;
- conversión o versión de conversión aplicada;
- cantidad normalizada y unidad de salida;
- fecha del hecho y referencia transaccional;
- estado de reconstrucción.

Para una compra se congela al verificar la línea. Para una recepción se congela al confirmar la recepción. Para una venta o consumo se congela al emitir el movimiento `SALE`/`WASTE` derivado de receta. Para una consulta de coste de una receta no transaccionada se usa el conjunto temporal de versiones y se declara si es reconstruible.

### Estados históricos

| Estado | Significado |
|---|---|
| `HISTORICAL_RECONSTRUCTABLE` | Existen snapshots/versiones completas y el coste se reproduce exactamente |
| `HISTORICAL_PARTIAL` | Falta algún dato no recuperable, pero existe parte trazable |
| `HISTORICAL_UNRECOVERABLE` | No existe información suficiente; no se inventa coste |

Un coste histórico nunca consulta silenciosamente el precio actual. Si falta snapshot y una versión necesaria, el resultado es `HISTORICAL_PARTIAL` o `HISTORICAL_UNRECOVERABLE`, no una cifra aproximada.

### Ejemplo

La compra `20 €/caja`, `24 ud`, proveedor y fecha conserva siempre `20 €/caja`. Si el precio posterior pasa a `25 €/caja`, se crea una nueva versión/precio; la compra histórica y su coste snapshot no cambian.

### Validación y rollback

- Consultar una fecha pasada devuelve la versión vigente en esa fecha y compara con el snapshot si existe.
- Test histórico: cambiar el precio actual no altera el coste congelado.
- Se valida integridad referencial de cada versión y snapshot.
- Rollback de una corrección futura: crear una nueva versión compensatoria; nunca editar snapshots.

### REJECTED

- **Versionado temporal solo** queda `REJECTED` como garantía única: depende de que todos los componentes estén correctamente versionados y no congela por sí mismo el hecho transaccional.
- **Snapshots solos** quedan `REJECTED` como arquitectura completa: duplican hechos sin una evolución coherente de maestros.

**B8 histórico: `RESOLVED`.** La combinación es la única decisión final; no quedan dos planes posibles.

---

## 5. B2 — Autoridad final del precio

### DECISIÓN

```text
SSOT FINAL:
product_prices

NO:
ingredients.current_price como fuente maestra.
```

### Semántica

- `product_prices` contiene el precio normalizado vigente por unidad de compra.
- `product_price_history` contiene las versiones normalizadas.
- `purchase_invoice_lines` conserva el precio original de presentación y su unidad.
- `supplier_product_presentations.list_price_eur` es informativo.
- `ingredients.current_price` es proyección legacy temporal y después se elimina.

### Writer y readers

**Writer único:** `ProductPriceService`/RPC canónico, después de matching verificado, presentación conocida, conversión exacta y comprobación de `locked_by_user_id`.

**Readers finales:** coste, recetas, consumo, mermas, insights, dashboards y APIs de lectura consultan `product_prices` o una vista que lo proyecta. Ninguno lee `ingredients.current_price` directamente.

**Transición K9:** dual write solo dentro de una transacción del writer canónico: primero guarda el maestro y su history, después actualiza `ingredients.current_price` como proyección. No existe ningún writer secundario.

**Fin de transición:**

- shadow de precio aprobada durante 14 días, últimos 5 sin bloqueos;
- 0 escritores directos de `current_price`;
- 0 readers de coste de `current_price`;
- paridad recomputable desde líneas/presentaciones;
- rollback window cerrada.

K12 elimina `ingredients.current_price` después de ese gate y de un backup restaurable. No se borra `purchase_invoice_lines` ni el histórico original.

### Ruta final

```text
OCR observed
→ matching supplier_product
→ presentación verificada y precio original
→ ProductPriceService normaliza
→ product_prices + product_price_history
→ Cost Engine
```

El albarán nunca escribe directamente al legacy ni al precio maestro.

**B2: `RESOLVED`.**

---

## 6. B9 — Matriz definitiva de writers

| Concepto | SSOT | Writer autorizado | Readers | Legacy writer | Fase eliminación |
|---|---|---|---|---|---|
| Producto | `products` | ProductCatalogService desde acciones autorizadas | Todos los dominios | IngredientWizard/Edit sobre `ingredients` | K8b/K12 |
| Defaults | `product_defaults` | ProductCatalogService | Compras, stock, receta, coste | Columnas legacy en `ingredients` | K8b/K12 |
| Unidades | `units` | Seed/migración y UnitAdminService | Todos los motores | Textos y listas locales | K8a/K6 |
| Dimensiones | `unit_dimensions` | Seed/migración con constraints | UnitConversionService | Constantes TS/SQL | K8a/K6 |
| Presentaciones | `product_presentations` | PresentationService con aprobación | Pedido, recepción, precio | `pack_*`, `order_unit` | K8b/K12 |
| Supplier presentation | `supplier_product_presentations` | SupplierPresentationService + confirmación | Precio, matching, recepción | `supplier_item_mappings`, OCR | K8b/K12 |
| Conversiones | `unit_conversions` | Admin/migración versionada | TS y SQL engines | funciones y conversiones locales | K6/K12 |
| Precio maestro | `product_prices` | ProductPriceService | Coste, insights, dashboards | manual/trigger/pack sobre `current_price` | K9/K12 |
| Compra solicitada | `purchase_orders` | PurchaseOrderService/Server Action | Compras, recepción esperada | PDF/UI legacy | K11/K12 si se sustituye |
| Compra observada | `purchase_invoice_lines.observed_*` | OCR/IA pipeline | Matching y revisión | `line_unit`, campos OCR legacy | K9/K11; raw se conserva |
| Recepción | `receptions/reception_lines` | ReceptionService | Stock, precio, compras | `handle_new_invoice_line` implícito | K9/K11 |
| Stock | `stock_movements` | StockMovementService/RPC único | `v_current_stock`, inventario, dashboards | trigger mutable, copiloto UPDATE | K5/K10/K12 |
| Inventario | `inventory_counts` + ADJUSTMENT | InventoryService | Stock y auditoría | `inventory/actions.ts` directo | K10/K11 |
| Venta | `ticket_lines_marbella` como hecho; SALE como efecto | BDP adapter que llama StockMovementService | Stock, análisis | webhook que calcula/escribe directamente | K11 |
| Receta | `recipes/recipe_lines` | RecipeService y acciones autorizadas | Coste, venta, consumo | `recipe_ingredients` y UI/importador directo | K11/K12 |
| Coste | Resultado derivado del Cost Engine | `RecipeCostService`/RPC v2 con contrato común | UI, insights, dashboards | RPC antiguo, TS numérico, cálculos de pantalla | K4/K11/K12 |

### Fuentes sin permiso de maestro

- OCR/IA: solo `observed_*`, candidatos y estados de revisión.
- Frontend: no escribe directamente tablas de dominio; invoca acciones autorizadas.
- Cron/jobs: no escriben precios, unidades, presentaciones, stock o costes salvo un job declarado como writer canónico y sujeto a la misma autorización.
- n8n/integraciones: no se identifica ningún writer legítimo de este dominio; cualquier futuro writer requiere entrar en esta matriz antes de ejecución.

### Writer temporal

El único writer temporal permitido es la proyección `ingredients.current_price` durante K9. Comienza al activar dual write canónico, termina antes de activar readers canónicos como única lectura y se elimina en K12. No puede recibir una escritura independiente.

**B9: `RESOLVED` a nivel de diseño.** El gate de ejecución exige comprobar en código, migraciones, vistas, funciones, jobs, APIs, RPCs, triggers y consultas dinámicas que el inventario coincide con esta matriz.

---

## 7. B10 — Eliminación definitiva del legacy

### Definición

```text
LEGACY ELIMINATED =
0 writers
AND 0 readers de negocio
AND backfill reconciliado
AND shadow aprobada
AND tests de aceptación aprobados
AND histórico validado
AND stock reconciliado
AND ventana de rollback cerrada
```

El raw histórico preservado no cuenta como reader de negocio ni como fuente maestra.

| Legacy | Reemplazo | Writers | Readers | Condición de deprecación | Condición de eliminación |
|---|---|---|---|---|---|
| `ingredients.current_price` | `product_prices` | 0 directos; proyección K9 | 0 de negocio | ProductPriceService activo y shadow | K12: gates B2, history y restore |
| `conversion_factor` | contenido explícito de presentación | 0 | 0 semánticos; raw histórico sí | Presentations migradas | K12: mappings clasificados y tests de precio |
| Normalizadores antiguos | UnitNormalizer | 0 independientes | 0 | wrappers delegan o retirados | K6/K12: análisis AST/grep completo |
| Conversiones SQL antiguas | `convert_unit_canonical` | 0 independientes | 0 | paridad K7 aprobada | K12: cero callers legacy |
| `handle_new_invoice_line` stock/precio | Reception/Price services | 0 side effects antiguos | raw/diagnóstico solo | Recepción confirmada e idempotente | K11/K12: cero PURCHASE duplicados |
| `update_ingredient_stock_trigger` mutable | `v_current_stock` | 0 sobre columna mutable | 0 | movimientos normalizados | K12: vista y reconcile aprobados |
| RPC `actualizar_stock` | RPC movement | 0 grants/callers | 0 | grants revocados K5 | K12: auditoría de permisos/logs |
| RPC `get_recipe_cost` antiguo | RPC v2 con estados | 0 callers | 0 | v2 y UI migradas | K11/K12: cero 0 por error |
| Columnas `unit/base_unit/unit_type/purchase_unit` | `units`/`product_defaults` | 0 | 0 | FKs y adapters completos | K12: lector/escritor inventory = 0 |
| `recipe_unit/order_unit` legacy | defaults y recipe lines FK | 0 | 0 | Backfill completo | K12: recipe/pedido readers = 0 |
| `pack_*` y `supplier_pricing_mode` | presentations + PriceService | 0 | 0 de cálculo | Precio recomputado | K12: casos pack aprobados |
| `supplier_item_mappings` | supplier products/presentations | 0 activos como maestro | raw histórico | Mappings migrados | K12 o read-only permanente si irreconstruible |
| `ingredient_price_history` | product history | 0 writers nuevos | Auditoría histórica | Product history activo | No se elimina; se congela read-only |
| `purchase_invoice_lines.line_unit` | observed text + verified FK | OCR puede conservar raw | 0 readers como unidad | Pipeline split observed/verified | Raw permanece; no es legacy eliminado físicamente |
| `recipes.articulo_id` | `map_tpv_receta` | 0 | 0 | FK mapping validado | K12 y snapshot histórico |
| Views legacy de precio/stock | views canónicas | 0 | 0 | Shadow aprobada | K12 tras cero dependencias |

**B10: `RESOLVED`.** La definición y las condiciones son objetivas; su cumplimiento es un gate de ejecución, no una afirmación de que ya se haya ejecutado.

---

## 8. DAG K definitivo

### Orden

```text
K1
→ K2a
→ K2b
→ K3
→ K5
→ K8a
→ K6
→ K7
→ K8b
→ K9
→ K4
→ K10
→ K11
→ K12
```

### Contrato de cada fase

| Fase | Dependencias | Input | Cambios | Output | Validación | Rollback | Gate |
|---|---|---|---|---|---|---|---|
| K1 | Ninguna | Corpus y writers actuales | Citas SSOT/lock | Contrato documental | Grep y tests lock | Revert técnico | G0 |
| K2a | K1 | Snapshot completo | Clasificación sin mutación | Reporte A/B/C/D | Counts y revisión | No aplica | G1 |
| K2b | K2a | Filas deterministas aprobadas | Normalización textual | Legacy coherente | Before/after + reversibilidad | Snapshot por fila | G1 |
| K3 | K2b | Mappings y duplicados | ORDER determinista | Mapping estable | Repetición concurrente | Desactivar selección | G2 |
| K5 | K3 | Callers copilot/stock | Único movement writer | No UPDATE directo | Permisos + movement test | Freeze + flag | G3 |
| K8a | K5 | Modelo units/presentations | Tablas, RLS, seeds, FKs | Schema canónico | Schema/RLS/constraints | Flags OFF; conservar tablas | G4 |
| K6 | K8a | Units/conversions | Service TS + SQL | Conversión única | Unit tests | Readers OFF | G5 |
| K7 | K6 | Corpus real y fixtures | Shadow de paridad | Status/valor paridad | 100 % estados; tolerancia | Solo lectura | G6 |
| K8b | K7 | Legacy clasificado | Backfill maestros/presentations | Productos y colas | Counts/FKs/review | No DROP; flags OFF | G7 |
| K9 | K8b | Líneas verificadas | PriceService/product prices | Precio maestro único | Leche/Coca/price shadow | Writer OFF; conservar history | G8 |
| K4 | K9/K7 | Price + conversion | Cost v2 con estados | Cost Engine | Sin 0 semántico/paridad | UI v1 solo si conserva estado | G9 |
| K10 | K8b/K5 | Movements raw + defaults | Normalización/view | Stock reconstruible | Reconcile/77 queue | View OFF con freeze | G10 |
| K11 | K4/K9/K10 | Flujos y flags | Recepción, receta, inventario, venta, consumo | Operación canónica | Flags + compensación | Idempotencia/piloto | G11 |
| K12 | K11/GH/GI | Readers/writers cero | Retirada legacy | Legacy eliminado | Gate B10 completo | Restore probado | G12 |

---

## 9. Gates de ejecución

1. **G0 — Decisiones:** `product_defaults`, snapshot+versionado histórico, `product_prices` y estados de coste documentados.
2. **G1 — Datos:** snapshot y clasificación completa; ningún dato ambiguo transformado.
3. **G2 — Mapping:** selección determinista y duplicados en revisión.
4. **G3 — Stock writer:** RPC directa revocada tras adaptación; ningún caller sin movimiento.
5. **G4 — Schema:** todas las tablas nuevas tienen FKs, constraints y RLS en la misma migración.
6. **G5 — Conversión:** una tabla fuente y una semántica; presentaciones fuera de la conversión universal.
7. **G6 — Paridad:** TS/SQL 100 % de estados y tolerancia numérica aprobada.
8. **G7 — Backfill:** productos, defaults, presentaciones y supplier relations reconciliados; cola de revisión visible.
9. **G8 — Precio:** recomputación desde fuente de presentación, no copia de `current_price`; shadow aprobada.
10. **G9 — Coste:** SQL, backend, TS, dashboards e insights propagan estados; cero por incompatibilidad = 0.
11. **G10 — Stock:** cada movimiento tiene original+normalizado o revisión; vista reconstruible.
12. **G11 — Flujos:** recepción, venta, consumo e inventario idempotentes; sin doble writer.
13. **G12 — Legacy:** cero writers/readers, tests, histórico, shadow, stock y rollback window cerrados.

---

## 10. Tests finales

| Test | Resultado |
|---|---|
| 1. Aceite | `8 €/L + 10 ml = 0,08 €`; `ml→L` universal |
| 2. Coca-Cola | `20 €/caja ÷ 24 ud/caja × 1 ud = 0,833333 €`; 24 vive en presentación |
| 3. Leche | `9,60 €/pack ÷ 6 L × 0,25 L = 0,40 €` |
| 4. Recepción | El mismo `reception_line` reenviado produce un único PURCHASE |
| 5. Histórico | `20 €/caja` se conserva aunque el precio actual pase a 25 |
| 6. Incompatible | `kg→L` produce `MISSING_CONVERSION`/`REQUIRES_REVIEW`, nunca 0 |
| 7. Precio | Todo precio tiene presentación/unidad de referencia; `20 €` desnudo no se promueve |
| 8. Proveedores | `6×1 L` y `12×500 ml` del mismo producto producen normalizados independientes |

Los tests deben ejecutarse con los casos reales de Leche avena, Oreo, Frankfurt, stock negativo y recetas sin precio; no solo con fixtures ideales.

---

## 11. Riesgos residuales

- No existe entorno de pruebas; cada fase de datos se aplica contra BD real. Requiere snapshot y runbook restaurable antes de cada fase.
- El histórico legacy sin autor sigue siendo desconocido; se conserva como `HISTORICAL_PARTIAL`, no se inventa usuario.
- Los 77 negativos requieren revisión humana; el gate no permite ponerlos a cero silenciosamente.
- OCR irrecuperable queda raw y fuera del maestro.
- `product_defaults` es configuración 1:1 vigente; si el negocio exige múltiples defaults simultáneos por local/contexto, deberá abrirse un cambio de diseño separado, no reutilizar `products.default_*`.
- Los gates no se consideran aprobados por estar escritos; deben ejecutarse durante la migración.

---

## 12. Veredicto final

| Elemento | Estado |
|---|---|
| Decisión defaults | RESOLVED: `product_defaults` |
| Decisión históricos | RESOLVED: versionado de maestros + snapshot mínimo transaccional |
| B2 precio | RESOLVED: `product_prices` |
| B8 coste desconocido | RESOLVED: estados estructurados, nunca 0 por error |
| B9 writers | RESOLVED: matriz de writer único y gates de cero writers legacy |
| B10 legacy | RESOLVED: eliminación con gate objetivo |

```text
B2 RESOLVED
B8 RESOLVED
B9 RESOLVED
B10 RESOLVED

READY FOR EXECUTION
```

`READY FOR EXECUTION` significa que el diseño está cerrado y la siguiente tarea puede ejecutar K1 respetando el DAG y los gates. No significa que ninguna migración se haya ejecutado ni que los gates operativos ya estén aprobados.

No se modificaron código, SQL, tablas ni datos. No se ejecutaron migraciones, no se hicieron escrituras READ-ONLY en la BD y no se hizo commit.
