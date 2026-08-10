---
documento: SPIKE-RESOLUCION-BLOQUEOS-MIGRACION
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

# Resolución de bloqueos — Migración del dominio producto/unidades

> **MATERIAL NO NORMATIVO — SPIKE-RESOLUCION-BLOQUEOS-MIGRACION**
>
> Revisión de diseño fechada el 2026-08-10. No modifica el plan K1-K12 inmutable, no ejecuta migraciones y no autoriza cambios de código, SQL o datos.
>
> La norma vigente vive en `marbella-os/`; la jerarquía que la ordena, en `marbella-os/CANON.md`. Si una decisión futura cambia una regla normativa, requiere actualizar el documento de dominio correspondiente y, si es estructural, un ADR.

**Documentos revisados completos:**

- `2026-08-10-auditoria-dominio-producto-unidades.md`
- `2026-08-10-revision-critica-unidades-por-contexto.md`
- `2026-08-10-revision-final-consistencia-plan-migracion.md`
- `2026-08-10-plan-migracion-dominio-producto-unidades.md`

**Criterio de estado:**

- `RESOLVED`: la decisión se deduce del corpus y queda especificada sin elegir entre alternativas abiertas.
- `CONDITIONALLY_RESOLVED`: el diseño está cerrado, pero su cierre depende de una validación objetiva antes de ejecutar.
- `BLOCKED — DECISION REQUIRED`: existen alternativas arquitectónicas reales y los documentos no autorizan elegir una.

---

## 1. Resumen ejecutivo

El diseño puede alcanzar una única autoridad por magnitud, pero **todavía no puede pasar a ejecución**. B1, B3, B4, B5, B6, B7, B9 y B10 quedan resueltos como especificación; B2 queda condicionado por una decisión de esquema que el plan dejó duplicada; B8 queda bloqueado por una decisión de preservación de costes históricos que no existe en el corpus.

**Veredicto final: `NOT READY FOR EXECUTION`.**

Esto no significa que el modelo sea inviable. Significa que no se debe ejecutar contra la BD real hasta que se decida y documente el contrato de histórico de costes y se cierre la ubicación única de los defaults de unidad. `ARQUITECTURA §11` confirma que no existe entorno de pruebas; por tanto, esos huecos no pueden resolverse durante una migración experimental.

### Estado B1-B10

| Bloqueo | Estado | Motivo breve |
|---|---|---|
| B1 ciclo K6/K7/K8 | RESOLVED | Se divide K8 en estructura y backfill; el DAG queda explícito. |
| B2 doble autoridad de precio | CONDITIONALLY_RESOLVED | `product_prices` es la SSOT; falta cerrar en el plan `products.default_*` frente a `product_defaults` y ejecutar el gate de cero writers legacy. |
| B3 presentación vs conversión | RESOLVED | El contenido comercial pertenece exclusivamente a la presentación; la conversión universal pertenece a `unit_conversions`. |
| B4 stock histórico | RESOLVED | Se conservan hechos originales y se agrega únicamente cantidad normalizada. |
| B5 recepción idempotente | RESOLVED | Identidad transaccional y unicidad se basan en factura/línea/recepción, no en un SELECT previo. |
| B6 backfill de precio | RESOLVED | Nunca copia `current_price` sin recomputar desde fuente de presentación verificada. |
| B7 rollback | RESOLVED | Se prohíben `DROP`/`DELETE` como rollback operativo; se exige snapshot restaurable y flags. |
| B8 costes históricos | BLOCKED — DECISION REQUIRED | Falta elegir versionado temporal o snapshot de coste histórico. |
| B9 writers | CONDITIONALLY_RESOLVED | La matriz está definida; el cierre exige inventario ejecutable de readers/writers y cero ocultos. |
| B10 legacy | CONDITIONALLY_RESOLVED | Condiciones objetivas definidas; no se cumplen hasta ejecutar backfill, shadow y ventana de rollback. |

---

## 2. B1 — Ciclo K6/K7/K8

### Problema

K6 implementa el motor que lee `unit_conversions`; K7 valida ese motor; K8 crea y puebla las tablas canónicas que incluyen `unit_conversions`. El plan original ordena K6 → K7 → K8, pero K6 no tiene su fuente de datos.

### Causa

La fase K8 mezcló dos operaciones distintas:

1. crear y proteger el esquema mínimo de unidades;
2. poblar productos, presentaciones, proveedores y colas de revisión.

La primera es precondición de K6. La segunda depende de K7. El plan no separó ambas.

### Decisión arquitectónica

K8 se divide conceptualmente en:

- **K8a — Estructura canónica:** `unit_dimensions`, `units`, `unit_conversions`, claves de producto y constraints, con seeds y RLS; sin cut-over.
- **K8b — Backfill canónico:** productos, defaults, presentaciones, `supplier_products`, presentaciones de proveedor y colas A/B/C/D.

K6 solo puede leer la estructura creada por K8a. K7 valida K6 contra seeds y corpus real. K8b usa el resultado validado.

### DAG definitivo

```text
K1
 ↓
K2a → K2b
 ↓     ↓
K3 ────┘
 ↓
K5
 ↓
K8a
 ↓
K6
 ↓
K7
 ↓
K8b
 ↓
K9
 ↓
K4
 ↓
K10
 ↓
K11
 ↓
K12
```

`K2a` es preflight/clasificación; `K2b` es la transformación determinista aprobada. No se inventa una nueva familia de fases: se separan dos salidas que el plan ya describía con dependencias diferentes.

### Fases: precondiciones, cambios y salidas

| Fase | Precondiciones | Cambios de diseño/ejecución | Salida | Dependencias |
|---|---|---|---|---|
| K1 | Corpus vigente y plan aprobado | Citas SSOT y regla `price_locked` | Contrato documental cerrado | Ninguna |
| K2a | Snapshot completo y consulta de clasificación | Solo lectura; clasifica unidades/mappings/precios | Reporte A/B/C/D por fila | K1 |
| K2b | Reporte aprobado y snapshot | Normaliza solo transformaciones deterministas | Legacy textual coherente + mapa reversible | K2a |
| K3 | Mappings identificados | Selección determinista y duplicados reportados | Un mapping elegido de forma estable | K2b |
| K5 | Todos los callers del copiloto identificados | Único writer de stock y grants cerrados | Ningún ajuste directo sin movement | K3 |
| K8a | K5 no afecta al esquema canónico; políticas diseñadas | Crea seeds, unidades, dimensiones, conversiones y esqueleto | Fuente estructural disponible | K5 |
| K6 | K8a migrado y protegido | Normalizador/conversor único por contrato | TS/SQL leen la misma fuente y devuelven estados | K8a |
| K7 | K6 sin cut-over | Paridad sobre corpus real | Paridad bloqueante aprobada | K6 |
| K8b | K7 aprobado | Backfill de productos/presentaciones/proveedores | Datos canónicos + cola de revisión | K7, K2b |
| K9 | Productos y presentaciones verificadas | Precio normalizado y writer único | `product_prices` actual coherente | K8b |
| K4 | Precio canónico y conversiones aprobadas | Coste con estados; sin wrapper que devuelva 0 por error | Contrato único de coste | K9, K7 |
| K10 | Precio no es dependencia matemática, pero stock units sí | Movimientos normalizados + vista | Stock reconstruible | K8b, K5 |
| K11 | Coste, precio, stock y recepción cerrados | Flujos canónicos e idempotentes | Operación con flags y errores explícitos | K4, K9, K10 |
| K12 | Shadow, readers/writers legacy a cero y restore probado | Retirada controlada | Legacy solo histórico o eliminado según tabla | K11 |

**B1: `RESOLVED`.** El ciclo desaparece al separar K8a/K8b y cambiar dependencias de K6/K7/K4.

---

## 3. B2 — Doble autoridad de precio

### Problema y causa

El plan conserva `ingredients.current_price` y crea `product_prices`. Durante dual write, ambos aparecen como campos que se pueden actualizar. Eso contradice `PRECIOS-Y-COMPRAS §1` y `PRINCIPIOS §3`: una cifra, un productor.

### Decisión arquitectónica

**SSOT final del precio actual: `product_prices`, una única fila `is_current=true` por `(product_id, reference_buy_unit_id)`.**

- `product_prices.price_eur` es el único precio normalizado que consumen costes, mermas y consumo.
- `purchase_invoice_lines.verified_*` conserva el precio original de presentación, pero no es el precio maestro.
- `supplier_product_presentations.list_price_eur` es informativo, nunca autoridad de coste.
- `ingredients.current_price` pasa a ser una **proyección read-only temporal** durante la transición.
- No existe un segundo formulario que pueda escribir `ingredients.current_price` directamente después del corte del writer.

### Dual-write autorizado

Sí se permite temporalmente, pero solo así:

1. `ProductPriceService` recibe una operación verificada.
2. Escribe `product_prices` y `product_price_history` en una transacción.
3. Actualiza `ingredients.current_price` como proyección técnica, no como input.
4. El sistema compara ambos valores y registra discrepancia.
5. Tras el gate de shadow, los lectores pasan a `product_prices`.
6. Se revoca toda escritura directa legacy.
7. K12 elimina la columna solo después de cero readers/writers y backup restaurable.

No se acepta “dual write” con dos acciones independientes. Si una escritura falla, falla la transacción; no se continúa con una sola mitad.

### Validación

- Cada producto activo tiene exactamente una fila actual por unidad de compra.
- `reference_buy_unit_id` coincide con el único default de compra decidido para el producto.
- Precio normalizado se recomputa desde una línea/presentación verificada; copiar `current_price` no es válido.
- Leche avena: `9,60 €/pack / 6 L = 1,60 €/L`, no `9,60 €/L`.
- Shadow: cero diferencias bloqueantes durante 14 días, con los últimos 5 días limpios.

### Rollback y cierre

- Rollback técnico: desactivar el flag de lectores canónicos y mantener `product_prices` intacto.
- Rollback de datos: no borrar filas ni history; restaurar writer legacy solo como proyección temporal y reconciliar después.
- Cierre B2: cero escritores directos de `ingredients.current_price`, cero lectores de coste, shadow aprobado y `product_prices` recomputable.

### Decisión pendiente que afecta a B2

El plan usa indistintamente `product_defaults.buy_unit_id` (§8) y `products.default_buy_unit_id` (§9). Debe elegirse una única ubicación para los defaults antes de crear `product_prices`. El corpus no autoriza elegir entre esas dos formas.

**B2: `CONDITIONALLY_RESOLVED — DECISION REQUIRED`** por esa ambigüedad de esquema, no por la autoridad del precio.

---

## 4. B3 — Presentación frente a conversión

### Decisión cerrada

| Información | Dueño único | Ejemplo |
|---|---|---|
| Conversión universal dimensional | `unit_conversions` sin scope de presentación | `1 L = 1000 ml` |
| Puente producto explícito | relación de producto/presentación con contenido conocido | `1 ud ColaCao = 760 g` |
| Composición comercial | `product_presentations` y `supplier_product_presentations` | `1 caja Coca-Cola = 24 ud` |

El número **24** vive únicamente en `content_total_qty=24` y `content_total_unit_id=ud` de la presentación de Coca-Cola para ese proveedor. No se crea `unit_conversions(scope_presentation_id)` para repetirlo.

El factor `ml→l=0,001` vive únicamente en `unit_conversions`. No se almacena una copia en cada módulo.

### Composición del cálculo

**Coca-Cola:**

```text
20 €/caja
÷ contenido de la presentación: 24 ud/caja
= 0,833333 €/ud
× 1 ud receta
= 0,833333 €
```

**Aceite:**

```text
8 €/L
× conversión universal: 10 ml × 0,001 L/ml
= 0,08 €
```

`ProductPriceService` usa el contenido de la presentación para normalizar precios; `UnitConversionService` solo resuelve conversiones de unidades y puentes explícitos. No hay una regla global `caja→ud`.

### Validación y rollback

- Constraint: ninguna presentación incompleta puede producir precio normalizado.
- Test: dos presentaciones `caja` de productos distintos no comparten factor por nombre.
- Rollback: las nuevas presentaciones se desactivan por flag; los datos observados y verificados se conservan.

**B3: `RESOLVED` como decisión de diseño.** El plan original debe adoptar esta regla antes de K8a; no se debe implementar su ejemplo actual de `scope_presentation_id`.

---

## 5. B4 — Stock histórico

### Modelo definitivo

El modelo mantiene la terminología del plan (`qty_signed`, `stock_unit_id`, `unit_snapshot_code`) y añade la cantidad original necesaria para no falsificar el pasado:

| Campo conceptual | Significado | Uso |
|---|---|---|
| `source_quantity` | Cantidad que llegó del hecho original | Auditoría/histórico |
| `source_unit_code` | Unidad original textual o snapshot | Auditoría/histórico |
| `qty_signed` | Cantidad ya normalizada y con signo | Única cantidad agregable |
| `stock_unit_id` | Unidad canónica de stock del producto | Agrupación de `v_current_stock` |
| `unit_snapshot_code` | Código de unidad preservado al emitir el movimiento | Trazabilidad de la versión |

Si se mantienen los nombres físicos actuales, `source_quantity/source_unit_code` pueden ser columnas nuevas equivalentes; no se permite perder esa información al renombrar `quantity/unit`.

### Ejemplo

```text
source_quantity = 3
source_unit_code = caja
presentación verificada = 24 ud/caja
qty_signed = +72
stock_unit_id = ud
```

El histórico sigue diciendo “3 cajas”; la vista suma `+72 ud`.

### Backfill

1. Congelar snapshot de `stock_movements` y `ingredients.stock_current`.
2. Copiar cantidad y unidad originales sin normalizarlos destructivamente.
3. Resolver producto y unidad de stock.
4. Aplicar solo conversiones universales o contenido de presentación verificado.
5. Escribir `qty_signed` normalizado con `source_system=legacy_*`.
6. Si falta contenido, dimensión o mapping, marcar `REQUIRES_REVIEW` y excluir del total canónico hasta resolución.
7. Representar el saldo de `stock_current` que no tiene movimiento como `INITIAL_LOAD` o `ADJUSTMENT` con fecha, referencia y motivo “legacy balance without source movement”; no inventar la causa.

### Validación, rollback y cierre

- `v_current_stock` suma solo `qty_signed` agrupado por producto y unidad canónica.
- Cada movimiento original tiene una fila normalizada o una revisión explícita.
- Los 77 negativos no se ponen a cero automáticamente.
- Rollback técnico: desactivar la vista canónica.
- Rollback de datos: restaurar snapshot y conservar movimientos nuevos en un ledger separado; nunca `DELETE` indiscriminado.

**B4: `RESOLVED` como diseño; cierre operativo condicionado al reporte de backfill.**

---

## 6. B5 — Idempotencia de recepción

### Identidad

- `purchase_invoices`: identidad documental por `supplier_id + invoice_number`, reforzada por `content_sha256`; si el documento es duplicado se conserva `duplicate_of_invoice_id`.
- `purchase_invoice_lines`: identidad por `purchase_invoice_id + line_id` estable; la posición OCR no basta si una línea puede corregirse.
- `receptions`: una recepción física tiene `reception.id`, factura origen, timestamp, usuario y estado confirmado.
- `reception_lines`: cada línea tiene `reception.id`, `invoice_line_id`, producto, presentación y cantidad recibida.
- `stock_movements`: `reference_type='reception_line'` y `reference_id=reception_line.id`.

### Constraint y operación

La creación del PURCHASE debe ser una operación transaccional idempotente con unicidad sobre el efecto, conceptualmente:

```text
UNIQUE(source_system, reference_type, reference_id, movement_type, product_id)
```

El servicio intenta insertar el efecto con esa identidad. Una repetición devuelve el movimiento existente, no crea otro. No se usa “SELECT y luego INSERT” como garantía.

### Casos

- Mismo albarán recibido dos veces: `content_sha256`/document identity lo marca duplicado; no se crea una segunda recepción confirmable.
- Reintento de la misma recepción: la constraint devuelve el mismo efecto.
- Línea corregida: no se edita el movimiento histórico; se crea `RECEPTION_CORRECTION`/`ADJUSTMENT` vinculado a la línea original y a la corrección.
- Cambio de cantidad recibida: nueva versión de `reception_line` o corrección transaccional, nunca mutación silenciosa del PURCHASE original.
- Factura con dos líneas iguales: cada línea debe tener identidad propia; no se deduplica por nombre/precio.

### Validación, rollback y cierre

- Test 7: misma recepción enviada dos veces produce exactamente un PURCHASE.
- Reintento concurrente bajo transacción produce un único movimiento.
- Rollback técnico: desactivar flujo nuevo; movimientos ya emitidos se corrigen con movimiento compensatorio, no se borran.
- Cierre B5: constraint aplicada, callers idempotentes y prueba concurrente aprobada.

**B5: `RESOLVED` como contrato de diseño; ejecución condicionada a la prueba transaccional.**

---

## 7. B6 — Backfill de precios

### Decisión

K9 no copia `ingredients.current_price` como verdad. Ese campo es una observación legacy potencialmente errónea. El precio canónico se calcula desde la mejor fuente verificable:

1. línea de factura verificada + presentación/contenido;
2. precio manual confirmado con motivo;
3. `current_price` legacy solo como `import_legacy` y estado `REQUIRES_REVIEW` si no puede recomputarse.

### Clasificación

- **Reconstructable:** presentación, cantidad, unidad y precio original presentes; se recalcula sin aproximación.
- **Partial:** precio actual existe, pero falta presentación o contenido; se conserva como legacy observado y no se publica como precio canónico automático.
- **Unrecoverable:** no hay unidad/contenido/fuente suficiente; queda en revisión, nunca factor 1.

### Validación y rollback

- Leche: `9,60 €/pack / 6×1 L = 1,60 €/L`; el gate debe fallar si copia `9,60`.
- Coca-Cola: `20 €/caja / 24 ud = 0,833333 €/ud`.
- Todas las filas de `product_prices` tienen `source_type`, `source_doc_ref`, unidad y `computation_log`.
- Rollback: conservar filas canónicas e history; desactivar writer canónico y no ejecutar `DELETE` por fecha.

**B6: `RESOLVED`.** La condición de cierre es recomputación independiente; no basta con que el total canónico coincida con un legacy posiblemente equivocado.

---

## 8. B7 — Rollbacks

### Principio

“Reversible” significa que se puede volver a operar sin perder hechos ni borrar datos posteriores. Un `GRANT` inverso no deshace movimientos; un `DROP` no es rollback si no hay restore probado.

| Fase | Operación | Reversible | Backup requerido | Rollback técnico | Rollback de datos |
|---|---|---|---|---|---|
| K1 | Documentación/lock | Sí | Git | Revert | No aplica |
| K2a | Clasificación | Sí | Snapshot read-only | No activar siguiente flag | No cambia datos |
| K2b | Normalización textual | Condicional | Snapshot por tabla + mapa por fila | Desactivar readers | Restaurar filas afectadas sin sobrescribir escrituras posteriores |
| K3 | Orden/mapping | Sí si no borra | Lista de duplicados | Desactivar selección canónica | Mantener mappings y reabrir revisión |
| K5 | Writers/grants stock | Condicional | Snapshot movements + permisos | Flag/writer legacy solo tras freeze | Compensar movimientos nuevos; nunca borrar |
| K8a | Schema canónico | Sí antes de cut-over | Backup de schema y seeds | Flags OFF; conservar tablas | No hay datos operativos canónicos todavía |
| K6/K7 | Servicios/paridad | Sí | Fixtures/corpus | Readers legacy OFF | No hay mutación de datos |
| K8b | Backfill | Sí si tablas se conservan | Dump de tablas nuevas y reporte A/B/C/D | Flags OFF; tablas read-only | Rehacer backfill o eliminar solo tablas nuevas sin datos operativos posteriores |
| K9 | Precio/product price | Condicional | Snapshot product_prices/history + source refs | Writer canónico OFF | Reconciliar; no `DELETE` de la ventana |
| K10 | Vista/stock reconciliation | Condicional | Snapshot view/movements/cola C | View OFF solo con writer único | Ajustes quedan como hechos; no se eliminan |
| K11 | Flujos | Condicional | Ledger de efectos/idempotency keys | Flags por flujo OFF | Correcciones compensatorias |
| K12 | Retirada legacy | No sin restore probado | Backup restaurable y ensayo | No se inicia si restore falla | Restaurar snapshot; ventana cerrada solo después de prueba |

**B7: `RESOLVED` como política de diseño.** Las operaciones destructivas dejan de ser rollback permitido. K12 no puede ejecutarse mientras “restaurar” sea solo una posibilidad teórica.

---

## 9. B8 — Coste cero frente a coste desconocido

### Ruta actual

`get_recipe_cost`/`fn_recipe_line_cost` en SQL pueden devolver `0` cuando la conversión es `NULL`; TypeScript devuelve estado `incompatible_units`/`missing_price`. `recipes/[id]/page.tsx` prioriza el resultado backend. Es la divergencia descrita en la auditoría y en `MODELO-DE-DATOS D21`.

### Contrato final

| Estado | Significado | `cost_eur` |
|---|---|---|
| `OK` | Conversión, precio y presentación válidos | Número, incluido cero solo si la cantidad física es cero |
| `INCOMPATIBLE_UNITS` | Dimensiones incompatibles sin puente | `NULL`/ausente |
| `MISSING_CONVERSION` | Falta relación necesaria | `NULL`/ausente |
| `MISSING_PRICE` | Precio no disponible o no válido | `NULL`/ausente |
| `PRESENTATION_UNKNOWN` | Falta contenido de pack/presentación | `NULL`/ausente |
| `AMBIGUOUS_CONVERSION` | Más de una relación o factor aproximado sin aprobación | `NULL`/ausente |
| `REQUIRES_REVIEW` | La entrada observada/verificada no puede promoverse | `NULL`/ausente |

El valor `0` solo representa un coste real de cantidad cero o una fórmula cuyo precio real es cero y está explícitamente aceptado. No representa desconocido.

### Comportamiento de consumidores

- Escandallo: suma solo líneas `OK` y muestra estado para las demás.
- Food cost: no calcula porcentaje si el coste es desconocido; muestra revisión.
- Insights y dashboards: excluyen o separan registros `UNKNOWN`; nunca los cuentan como coste cero.
- Frontend: pinta estado y no recalcula conversiones.
- SQL y TS: contrato de estados idéntico y paridad bloqueante.

No existe wrapper backward-compatible que emita cero semántico. La compatibilidad puede conservar la firma, pero debe devolver el estado.

**B8: `RESOLVED` para coste actual.** El coste histórico queda tratado en B8.1.

### B8.1 Costes históricos: bloqueo separado

Para contestar “¿por qué costaba X el día Y?” faltan dos alternativas posibles:

1. versionar receta, precios, presentaciones y conversiones con vigencia temporal; o
2. guardar un snapshot de coste por receta/línea/venta con todos los hechos usados.

El plan no elige una. El precio histórico solo no conserva la receta histórica ni sus factores. No se puede seleccionar una alternativa sin decisión de producto/contabilidad.

**B8 histórico: `BLOCKED — DECISION REQUIRED`.** Debe aprobarse una de las dos estrategias y añadirla al plan antes de K9/K11.

---

## 10. B9 — Matriz completa de writers

La matriz separa el writer actual del writer futuro. Un adapter o proyección no es una autoridad.

| Dato | Writer actual | Writer futuro | SSOT | Fase |
|---|---|---|---|---|
| Producto | `IngredientWizard`, `IngredientEditModal`, acciones ingredients | Product/Ingredient service | `products` | K8b |
| Presentación | Campos `pack_*`, `order_unit`, formularios | Presentation service con aprobación | `product_presentations` | K8b |
| Supplier product | fuzzy mapping, nombres en `ingredients` | Matching service + confirmación | `supplier_products` | K8b |
| Supplier presentation | `supplier_item_mappings`, OCR/mapping | Presentation matching + confirmación | `supplier_product_presentations` | K8b/K9 |
| Conversión | normalizadores TS, SQL functions, pack pricing | UnitConversionService + SQL espejo, misma tabla | `unit_conversions` | K6/K7 |
| Precio | manual, `handle_new_invoice_line`, pack trigger, price action | ProductPriceService | `product_prices` | K9 |
| Compra solicitada | `/orders/new`, `purchase_orders`, PDF/WhatsApp | Purchase order service | `purchase_orders` | K11 opcional |
| Compra observada | OCR/IA sobre `purchase_invoice_lines` | OCR pipeline observed-only | líneas `observed_*` | K9/K11 |
| Recepción | `handle_new_invoice_line` implícito | ReceptionService con confirmación | `receptions/reception_lines` + movement | K11 |
| Stock | movement trigger, BDP webhook, staff RPC, inventario, mermas, copiloto | StockProjectionService / único RPC movement | `stock_movements` | K5/K10/K11 |
| Inventario | `inventory/actions.ts` y recuentos | InventoryService | `inventory_counts` + ADJUSTMENT | K10/K11 |
| Venta | webhook BDP `process_ticket_stock_deduction` | webhook como adapter; movement service | ticket + SALE movement | K11 |
| Receta | página de recetas/importador | Recipe service/actions | `recipes/recipe_lines` | K11 |
| Coste | `get_recipe_cost` SQL, `recipe-cost.ts`, página | Cost engine con contrato único | derivado; precios + conversiones | K4/K11 |
| IA/OCR | extracción/matching | solo `observed_*` y candidatos | no escribe maestro | K9/K11 |
| Cron | no se identifica writer legítimo de este dominio | solo tareas explícitamente listadas | ninguno salvo jobs aprobados | Gate B9 |
| n8n/integraciones | no se identifica writer legítimo de este dominio | no puede escribir maestro sin contrato | ninguno salvo integración declarada | Gate B9 |

### Cierre B9

Antes de ejecutar se requiere un inventario reproducible de:

- `INSERT`, `UPDATE`, `UPSERT` y RPCs sobre estas magnitudes;
- triggers y funciones `SECURITY DEFINER`;
- acciones de servidor, webhooks, jobs, n8n e IA;
- vistas y consultas que sigan leyendo columnas legacy.

Un writer no identificado no puede declararse inexistente por no aparecer en la matriz.

**B9: `CONDITIONALLY_RESOLVED`.** La matriz es completa a nivel de diseño; el cierre exige que el inventario ejecutable devuelva cero writers/ readers ocultos antes de cada cut-over.

---

## 11. B10 — Cierre verificable del legacy

`LEGACY ELIMINATED` significa simultáneamente:

```text
0 writers legacy
+ 0 readers legacy
+ backfill reconciliado
+ shadow aprobada
+ ventana de rollback cerrada
= LEGACY ELIMINATED
```

| Legacy | Reemplazo | Readers restantes permitidos | Writers restantes permitidos | Condición de eliminación |
|---|---|---|---|---|
| `ingredients.current_price` | `product_prices` | Solo proyección temporal | Ninguno directo | Shadow precio limpia + cero referencias directas + K12 restore probado |
| `conversion_factor` | contenido explícito de presentación | Raw histórico | Ninguno | Cero consumidores semánticos y mappings migrados/revisados |
| `normalizeUnit` locales, `norm`, `normalizeWasteUnit` | normalizador canónico | Ninguno, salvo adapters temporales | Ninguno | Inventario AST/grep completo = 0 copias independientes |
| `canonicalPurchaseUnit` fallback | estado `unknown` | Ninguno | Ninguno | No existe fallback `kg` |
| `handle_new_invoice_line` stock/precio | ReceptionService/ProductPriceService | Raw trigger solo desactivado | Ninguno | Confirmación + idempotencia + cero PURCHASE duplicado |
| `update_ingredient_stock_trigger` mutable | `v_current_stock` | Ninguno | Ninguno sobre columna mutable | Movements normalizados y vista reconciliada |
| `actualizar_stock` | RPC movement | Ninguno | Grant revocado/cero callers | Auditoría de permisos y logs = cero uso |
| `get_recipe_cost`/`fn_recipe_line_cost` | v2 con estados | Ninguno | Ninguno | Cero estados de error convertidos en 0 |
| `ingredients.unit/base_unit/unit_type/purchase_unit` | units/defaults/product | Histórico raw | Ninguno | Cero readers/writers y FKs completas |
| `ingredients.pack_*`/`supplier_pricing_mode` | presentations/price service | Histórico raw | Ninguno | Todas las filas clasificadas |
| `supplier_item_mappings` | supplier products/presentations | Read-only histórico | Ninguno | Mapping completo, revisión de no encontrados y shadow |
| `ingredient_price_history` | product price history | Read-only histórico | Ninguno nuevo | No se elimina; se congela tras migrar fuente viva |
| `purchase_invoice_lines.line_unit` | observed text + verified FK | Auditoría raw | Ninguno como unidad maestra | Raw preservado, cero lectores de negocio |
| `recipes.articulo_id` | `map_tpv_receta` | Histórico | Ninguno | Cero readers/writers y mapping verificado |
| Views legacy | vistas canónicas | Ninguno | Ninguno | Cero consultas dependientes y comparación aprobada |

**B10: `CONDITIONALLY_RESOLVED`.** Las condiciones están definidas, pero no se pueden afirmar cumplidas en fase de diseño.

---

## 12. Orden K definitivo

Este es el orden sin ciclos que debe sustituir al orden actual en el plan antes de ejecución:

1. **K1 — Documentación y precio bloqueado.** Entrada: corpus vigente. Salida: writers documentados y lock respetado. Rollback: revert técnico.
2. **K2a — Snapshot y clasificación.** Entrada: datos legacy. Salida: snapshot, mapa A/B/C/D y cola. Rollback: no muta datos.
3. **K2b — Transformaciones deterministas.** Entrada: mapa aprobado. Salida: vocabulario textual coherente y reporte reversible. Rollback: snapshot/mapeo por fila.
4. **K3 — Mappings deterministas.** Entrada: mappings clasificados. Salida: selección estable y duplicados en revisión. Rollback: desactivar selección, no borrar hechos.
5. **K5 — Único writer legacy de stock.** Entrada: callers adaptados y permisos auditados. Salida: copiloto sin UPDATE directo. Rollback: flag/grant solo con freeze y reconciliación.
6. **K8a — Esquema base canónico.** Entrada: contrato de unidades/presentaciones. Salida: tablas, seeds, FKs, RLS y constraints.
7. **K6 — Motor de normalización/conversión.** Entrada: K8a. Salida: TS/SQL con estados y una semántica.
8. **K7 — Paridad.** Entrada: K6 y corpus real. Salida: 100 % de estados y tolerancia numérica aprobada.
9. **K8b — Backfill maestros y presentaciones.** Entrada: K2/K3/K7. Salida: products, presentations, supplier products y colas C/D.
10. **K9 — Precio canónico.** Entrada: presentaciones y fuentes verificadas. Salida: `product_prices` como único writer y legacy proyección.
11. **K4 — Coste con estados.** Entrada: precio/conversión canónicos. Salida: v2 sin cero semántico y paridad.
12. **K10 — Stock canónico.** Entrada: units, products, movements legacy y K5. Salida: `v_current_stock` normalizado y negativos gestionados.
13. **K11 — Flujos operativos.** Entrada: coste/precio/stock/recepción cerrados. Salida: recepción, receta, inventario, venta y consumo idempotentes.
14. **K12 — Retirada legacy.** Entrada: gates completos. Salida: cero readers/writers y backup/restore probado.

El nombre de K8a/K8b es necesario porque separar estructura y backfill no es una preferencia: K6 necesita la estructura y K8b necesita K7.

---

## 13. Gates entre fases

| Gate | Condición | Bloquea |
|---|---|---|
| G0 decisión | Se ha decidido una única ubicación para `products.default_*`/`product_defaults` y estrategia de costes históricos | K8a/K9/K11 |
| GA modelo | Producto, defaults, dimensiones, presentación y supplier presentation tienen dueño único | K8a |
| GB conversiones | Universal, puente producto y presentación no comparten semántica; sin `scope_presentation_id` duplicado | K6 |
| GC writers | Inventario de writers/readers completado; ningún writer desconocido | K5/K9/K10 |
| GD paridad | TS/SQL comparten tabla/contrato; estados 100 % iguales y valores dentro de tolerancia | K8b/K4 |
| GE backfill | Productos, unidades, presentaciones, mappings y precios con reporte por fila; ambiguos fuera del maestro | K9/K10 |
| GF stock | Cada movimiento tiene original + normalizado o revisión; `v_current_stock` reconstruible | K11 |
| GG idempotencia | Pruebas concurrentes de recepción, venta, consumo e inventario sin duplicados | K11 |
| GH shadow | 14 días, cero bloqueantes durante los últimos 5 días | K12 |
| GI rollback | Snapshot restaurable y procedimiento probado por fase | K12 |
| GJ legacy | Cero readers/writers legacy, backfill reconciliado, shadow aprobada y rollback window cerrada | declaración final |

---

## 14. Tests de aceptación

| Test | Resultado requerido | Gate |
|---|---|---|
| 1. Aceite | `8 €/L + 10 ml = 0,08 €` | GB, GD |
| 2. Coca-Cola | `20 €/caja + 24 ud/caja + 1 ud = 0,833333 €` | GA, GB, GD |
| 3. Leche | `9,60 €/pack + 6×1 L + 250 ml = 0,40 €` | GE, GD |
| 4. Recepción | `3 cajas` solicitadas; `2 cajas+5 ud` recibidas; `53 ud` stock; un PURCHASE | GG |
| 5. Histórico | El original `20 €/caja` permanece aunque cambie el precio actual | GE, GI |
| 6. Incompatible | `kg→L = MISSING_CONVERSION/REQUIRES_REVIEW`, nunca 0 | GB, GD |
| 7. Idempotencia | Misma recepción dos veces = un movimiento | GG |
| 8. Proveedores | `6×1 L` y `12×500 ml` del mismo producto normalizados de forma independiente | GA, GE |

También son obligatorios los casos reales ya detectados: Leche avena, Oreo, Frankfurt, 77 negativos y 39 recetas sin PVP. No se acepta que un fixture ideal oculte los datos corruptos reales.

---

## 15. Criterios de aceptación del documento

La migración no puede declararse lista mientras exista cualquiera de estas condiciones:

- B8 histórico en `BLOCKED — DECISION REQUIRED`.
- Doble ubicación no decidida para defaults de unidad.
- `current_price` con writer directo.
- `scope_presentation_id` usado para repetir contenido de presentación.
- Movimiento histórico sin cantidad/unidad original o sin cantidad normalizada/revisión.
- Recepción sin constraint de idempotencia.
- Wrapper de coste que convierte desconocido en cero.
- Rollback basado en `DELETE`, `DROP` o restore no probado.
- Reader/writer legacy no identificado.
- Gate shadow, backfill o rollback solo descrito y no verificable.

---

## 16. Riesgos residuales

Aunque se resuelvan los contratos anteriores, permanecen riesgos operativos que no deben disfrazarse:

- No hay entorno de pruebas; cada migración se aplica contra BD real (`ARQUITECTURA §11`).
- `ingredient_price_history.changed_by` histórico sigue sin autor; se preserva como desconocido.
- Los 77 negativos requieren revisión humana y pueden no tener una causa única.
- `line_unit` OCR irrecuperable debe permanecer raw, no convertirse retrospectivamente.
- D19/D22 reducen la red de seguridad de tipos y pruebas.
- La elección de snapshot o versionado de coste histórico afecta almacenamiento, consultas y producto.

---

## 17. Veredicto final

| Bloqueo | Estado final |
|---|---|
| B1 | RESOLVED |
| B2 | CONDITIONALLY_RESOLVED — elegir ubicación única de defaults y ejecutar gates |
| B3 | RESOLVED |
| B4 | RESOLVED |
| B5 | RESOLVED |
| B6 | RESOLVED |
| B7 | RESOLVED |
| B8 | **BLOCKED — DECISION REQUIRED** |
| B9 | CONDITIONALLY_RESOLVED — inventario ejecutable de writers/readers |
| B10 | CONDITIONALLY_RESOLVED — backfill, shadow y rollback window |

La respuesta a “¿podemos ejecutar sin volver a abrir el diseño?” es **no**.

El estado correcto sigue siendo:

# NOT READY FOR EXECUTION

Para llegar a `READY FOR EXECUTION` deben aprobarse, como mínimo:

1. la ubicación única de defaults de unidad;
2. la estrategia de costes históricos: versionado temporal o snapshots ligados a transacción;
3. la actualización del plan K1-K12 con este DAG, los contratos SSOT, las constraints de idempotencia y los gates.

Este documento no edita el plan original ni el sistema. No se han ejecutado fases, migraciones, scripts de datos ni commits.
