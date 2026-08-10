---
documento: SPIKE-REVISION-FINAL-CONSISTENCIA-PLAN-MIGRACION
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

# Revisión final de consistencia — Plan de migración K1-K12

> **MATERIAL NO NORMATIVO — SPIKE-REVISION-FINAL-CONSISTENCIA-PLAN-MIGRACION**
>
> Análisis fechado el 2026-08-10. No modifica el plan inmutable, no autoriza la ejecución y no describe cambios aplicados al sistema.
>
> El plan revisado es `marbella-os/6-investigacion/spikes/2026-08-10-plan-migracion-dominio-producto-unidades.md`. La auditoría y la revisión crítica anteriores son material de investigación, no norma. Ante cualquier discrepancia manda el corpus normativo vigente según `CANON.md`.

**Modo:** revisión de diseño y consistencia documental; cero escrituras en código, SQL, datos o BD.  
**Documentos revisados:** auditoría arquitectónica, revisión crítica de unidades por contexto y plan completo K1-K12.  
**Criterio:** una magnitud, un productor; una conversión, una semántica; histórico preservado; ejecución reversible.

---

## 1. Veredicto general

# NOT READY FOR EXECUTION

El conjunto contiene una dirección arquitectónica válida, pero todavía no es un plan ejecutable seguro. El modelo sí expresa la intención correcta de separar producto, unidades, presentaciones, precios, stock y recetas; sin embargo, el plan mantiene contradicciones internas que permitirían implementar dos verdades bajo nombres nuevos.

### Lo que está correctamente diseñado

- Las unidades de compra, stock y receta pueden ser diferentes mediante referencias a `units`.
- `g/kg` y `ml/l` están concebidas como conversiones dimensionales universales.
- `caja`, `pack` y `saco` se reconocen conceptualmente como presentaciones específicas, no como unidades globales.
- El producto maestro se separa del proveedor mediante `supplier_products`.
- El precio normalizado se pretende expresar en la unidad de compra y el precio observado de la factura se conserva aparte.
- El stock se pretende convertir en proyección de `stock_movements`.
- OCR/IA se separa conceptualmente de los datos verificados.
- Se proponen estados explícitos para incompatibilidades y ausencia de precio.

### Bloqueos antes de K1

| ID | Bloqueo | Gravedad | Evidencia |
|---|---|---|---|
| B1 | Dependencia circular: K6 necesita `unit_conversions`, pero K8 crea las tablas y K7 depende de K6/K8 | CRÍTICA | Plan §12, §23.2, §33 K6-K8 |
| B2 | `ingredients.current_price` y `product_prices` aparecen simultáneamente como escritores/autoridades durante dual write | CRÍTICA | Plan §8, §13, §23.2, §30 |
| B3 | La composición de una presentación vive a la vez en `unit_conversions.scope_presentation_id` y en `supplier_product_presentations.content_total_*` | CRÍTICA | Plan §11.3, §12.2-12.3; revisión crítica C3 |
| B4 | La vista de stock suma cantidades por unidad sin especificar la normalización de movimientos históricos a `stock_unit_id` | CRÍTICA | Plan §17.2-17.4, §23.2 K10 |
| B5 | La recepción puede duplicar el `PURCHASE`: conviven trigger antiguo y recepción explícita sin clave de idempotencia definida | ALTA | Plan §16.2, §16.3, §28.1 |
| B6 | El backfill de K9 permite copiar un `current_price` legacy que ya se ha demostrado incorrecto, como Leche avena `9,6 €/L` frente a `1,6 €/L` | ALTA | Plan §23.2 K9, §29.2; revisión crítica C2 |
| B7 | El wrapper backward-compatible de K4 puede seguir emitiendo `0`, contradiciendo el requisito de no silenciar incompatibilidades | CRÍTICA | Plan §24.6 y §33 K4 frente a §21.1 y §31.1 |
| B8 | El histórico de coste de receta no tiene entidad/versionado explícito; precio histórico solo no basta para reproducir un coste pasado | ALTA | Plan §13.5, §20-21, §31; ausencia de `recipe_history`/cost snapshot |
| B9 | Los rollbacks K8, K9 y K12 contienen `DROP`/`DELETE` o restauración hipotética sin procedimiento seguro para datos creados después | ALTA | Plan §36.1 |
| B10 | La retirada del legacy carece de una matriz completa de escritor, lector, proyección y condición de eliminación | ALTA | Plan §24.3, §28.1, §33 K12 |

Mientras B1-B10 no estén resueltos en una revisión del plan o en decisiones normativas posteriores, comenzar la ejecución puede producir un sistema con dos autoridades simultáneas.

---

## 2. Alcance y precedencia

La auditoría, la revisión crítica y el plan son spikes `normativo: false`, `estado: archivado`, `precedencia: 0`. Se han leído completos, pero no autorizan decisiones por sí mismos. Esta revisión tampoco las autoriza.

La materia normativa vigente procede principalmente de:

- `PRECIOS-Y-COMPRAS.md`: un precio actual por unidad de compra, precio por pack derivado por BD, paridad cliente/BD e invariantes 1-6.
- `MODELO-DE-DATOS.md`: autoridad de cada magnitud, regla de que las vistas son formas de lectura y deuda D19/D21.
- `ARQUITECTURA.md`: un motor produce una magnitud y ninguna pantalla calcula negocio.
- `PRINCIPIOS.md`: una magnitud, un productor; el sistema debe gritar y no convertir desconocidos en valores plausibles.
- `SEGURIDAD.md`: toda tabla nueva nace con políticas en la misma migración.

No se ha ejecutado ninguna fase K ni se ha modificado el sistema.

---

## 3. Prueba de SSOT real

La columna **Fuente temporal** describe el período de transición. No convierte una proyección legacy en segunda autoridad: para que el plan sea ejecutable debe declarar expresamente el escritor único en cada fase.

| Concepto | SSOT final | Otra fuente maestra actual o de transición | Cuándo desaparece o deja de escribir | Estado |
|---|---|---|---|---|
| Producto | `products` | `ingredients` como maestro legacy y posible proyección | K8 crea/backfill; K12, tras cero lectores y snapshot | Falta fijar contrato de proyección |
| Unidad | `units` | Textos en `ingredients.*`, `recipe_ingredients.unit`, pedidos y movimientos | K6/K8 adaptan; K12 elimina columnas cuando no haya lectores | Correcto en intención |
| Dimensión | `unit_dimensions` | Dimensiones codificadas en TS/SQL | K6, después de que todos lean la tabla | Correcto en intención |
| Presentación de producto | `product_presentations` | `ingredients.pack_*`, `order_unit` | K8 backfill; K12 retira lectores legacy | `contains_*` no cubre claramente contenido por pieza |
| Producto-proveedor | `supplier_products` | `ingredients.supplier`, `supplier_2`, `supplier_item_mappings` | K8 backfill; K12 solo tras revisión de nombres no encontrados | Falta estado de cada mapping legado |
| Presentación de proveedor | `supplier_product_presentations` | Tríada y `conversion_factor` de `supplier_item_mappings` | K8/K9 migran; K12 elimina lectores tras paridad | B3 duplica su semántica con `unit_conversions` |
| Conversión dimensional | `unit_conversions` sin scope de presentación | Funciones SQL, normalizadores y reglas TS duplicadas | K6/K7; legacy solo wrappers hasta cero lectores | Orden K6-K8 circular |
| Conversión de presentación | Presentación con contenido total explícito | `conversion_factor`, `pack_units`, `pack_unit_size_*` | K8/K9; eliminación tras todos los mappings migrados | Debe salir de `unit_conversions.scope_presentation_id` |
| Precio de presentación observado | `purchase_invoice_lines.verified_*` con unidad/presentación | `unit_price`, `line_unit`, OCR crudo | Nunca se elimina el dato histórico; se conserva como snapshot | Debe ser inmutable tras verificación o versionado |
| Precio de compra normalizado | `product_prices.price_eur + reference_buy_unit_id` | `ingredients.current_price` | K9: pasa a proyección; K12: cero escritores/lectores directos | B2 y B6 bloquean |
| Precio actual | Fila `product_prices.is_current=true` | `ingredients.current_price` | K9 dual write; canonical-only antes de activar lectores; K12 retiro | El plan no define un único writer desde el primer dual write |
| Histórico de precio | `product_price_history` más snapshot transaccional de factura | `ingredient_price_history` legacy | Legacy debe quedar read-only preservado, no borrarse por defecto | Falta histórico completo de precio/presentación en una matriz única |
| Compra solicitada | `purchase_orders`/`purchase_order_items` | PDF y pedido legacy | No entra en stock; se conserva como histórico | Correcto, pero no debe llamarse recepción |
| Compra recibida/documento | `purchase_invoices`/líneas verificadas | OCR y líneas antiguas | Se conservan los originales | Debe distinguir cantidad facturada de cantidad recibida |
| Recepción física | `receptions`/`reception_lines` | Trigger `handle_new_invoice_line` | K9/K11: trigger no puede generar PURCHASE después del corte | Falta idempotencia y dueño de cantidad recibida |
| Stock | `stock_movements` normalizados + `v_current_stock` | `ingredients.stock_current` y actualizaciones directas históricas | K10 proyección; K12 columna mutable fuera | B4: movimientos históricos requieren cantidad normalizada y original preservado |
| Inventario | `inventory_counts` como hecho físico; ADJUSTMENT como efecto | `INVENTORY_COUNT` legacy en `stock_movements` | K10 migra; histórico se conserva | Falta especificar migración de conteos antiguos a delta/signo |
| Venta | `tickets_marbella`/`ticket_lines_marbella` como hecho; SALE como efecto | `ventas_marbella` legacy | No se elimina el hecho de venta; se retiran lectores antiguos cuando proceda | Debe existir idempotencia por ticket/línea/receta |
| Receta | `recipes` con versionado o snapshot histórico | `recipes` actual | K11 adapta; K12 no debe borrar historia | El plan no define versionado de receta |
| Línea de receta | `recipe_lines` con producto, cantidad y unidad FK | `recipe_ingredients` | K11 backfill; K12 solo tras cero lectores | Correcto en intención |
| Coste de receta | Motor canónico único, derivado de precio vigente o de snapshot temporal | RPC SQL, TS y `backendCost` actual | K4/K7/K11; RPC antiguo no puede seguir devolviendo 0 | B7; falta coste histórico reproducible |

### 3.1 Conclusión de la prueba SSOT

La tabla anterior no puede considerarse cerrada todavía porque el plan usa tres nombres para la misma configuración: `product_defaults` (§8), columnas `default_*` en `products` (§9) y columnas nuevas en `ingredients` (§24.2). Debe elegirse uno:

1. `products.default_*_unit_id` como dueño final; o
2. `product_defaults` como tabla 1:1; pero no ambos.

Las columnas nuevas de `ingredients` solo pueden ser un adaptador/proyección temporal, con un único writer canónico y fecha de retirada. El plan no lo declara con suficiente precisión.

---

## 4. Dual-read y dual-write

La transición propuesta es válida como técnica, pero no como autoridad. La siguiente tabla es la condición mínima para que exista una sola SSOT durante ella:

| Fase | Autoridad de lectura | Autoridad de escritura | Proyección permitida | Corte obligatorio |
|---|---|---|---|---|
| Antes de K8 | Legacy | Legacy, salvo correcciones explícitas | Ninguna canónica todavía | Snapshot y clasificación completos |
| K8 schema/backfill | Legacy | Legacy | Tablas canónicas pobladas como snapshot | No activar lectores canónicos con datos incompletos |
| K9 price transition | `product_prices` en shadow; legacy para operación hasta gate | `ProductPriceService` único; `ingredients.current_price` solo proyección | `ingredients.current_price` | Dejar de aceptar escrituras directas legacy antes de activar dual write |
| K10 stock transition | Comparación legacy/view | `StockProjectionService`/movements único | `ingredients.stock_current` solo espejo temporal | View canónica tras reconciliación o cola visible |
| K11 flows | Canónico por feature flag | Services/RPC canónicos | Adapters de lectura únicamente | Trigger viejo y RPC viejo sin permisos antes del piloto |
| K12 cleanup | Canónico | Canónico | Ninguna columna legacy mutable | Cero lectores, cero escritores, restore probado |

El plan actual dice “dual write” (§30), pero no afirma de forma ejecutable que `ingredients.current_price` y `ingredients.stock_current` se convierten en proyecciones **no escribibles** durante K9/K10. “Ambas columnas se escriben” no es SSOT: es dos productores salvo que el writer sea único y la segunda escritura sea una proyección derivada dentro de la misma transacción.

---

## 5. Prueba del dominio de unidades

El modelo soporta conceptualmente:

| Contexto | Ejemplo | Dueño final | Conversión |
|---|---|---|---|
| Compra | caja | presentación del proveedor | presentación → unidad de compra/stock |
| Recepción | 2 cajas + 5 ud | `reception_lines` | cada línea → stock unit |
| Stock | 53 ud | movimientos + vista | ninguna después de normalizar |
| Inventario | 52 ud | `inventory_counts` | lectura en stock unit |
| Receta | 10 ml | `recipe_lines.quantity_unit_id` | ml → L |
| Precio | 8 €/L | `product_prices.reference_buy_unit_id` | ninguna después de normalizar |

Los cálculos conceptuales pasan:

- Aceite: `10 ml × 0,001 L/ml × 8 €/L = 0,08 €`.
- Harina: `150 g × 0,001 kg/g × 2,50 €/kg = 0,375 €`.

El bloqueo no está en la aritmética, sino en que el plan aún permite que la misma relación de presentación se modele como conversión de unidades y como contenido de presentación (§12.2 frente a §11.3). Debe quedar una única semántica:

- `unit_conversions`: conversiones universales dimensionales y puentes de producto expresamente definidos.
- `product_presentations`/`supplier_product_presentations`: composición comercial y contenido facturable.
- `ProductPriceService`: normaliza un precio de presentación usando el contenido de la presentación; no inventa una unidad global `caja`.

---

## 6. Prueba completa Coca-Cola

El recorrido pasa conceptualmente solo después de resolver el dueño de la composición:

1. `products`: Coca-Cola 330 ml como producto maestro.
2. `supplier_products`: relación Carrefour → producto.
3. `supplier_product_presentations`: Carrefour, caja, `billing_qty=1`, `content_total_qty=24`, `content_total_unit_id=ud`.
4. Línea verificada: `20 €/caja`, sin convertir el dato original.
5. `ProductPriceService`: `20 / 24 = 0,833333 €/ud`, con referencia `ud` y `source_doc_ref`.
6. Pedido: 3 presentaciones de caja.
7. Recepción: 2 cajas + 5 ud; genera exactamente un efecto PURCHASE por cada línea confirmada.
8. Stock: `2×24+5 = 53 ud`.
9. Receta: 1 ud.
10. Coste: `1 × 0,833333 €/ud = 0,833333 €`.

El plan todavía tiene una contradicción en §12.3: presenta “caja → 24 ud” como una fila de `unit_conversions` con `scope_presentation_id`, mientras §10.3 dice que caja no es unidad. El test no está cerrado hasta que una sola tabla sea propietaria de ese 24.

---

## 7. Prueba completa Aceite y proveedores

### 7.1 Aceite

Para `pack 6×1 L = 48 €`:

- presentación: 6 piezas, cada pieza con contenido explícito de 1 L;
- total normalizable: 6 L;
- precio normalizado: `48/6 = 8 €/L`;
- stock recibido: `+6 L`;
- receta: `10 ml`;
- consumo: `−0,010 L`;
- coste: `0,010×8 = 0,08 €`.

El atributo “cada pieza contiene 1 L” no está formalizado en el plan. `contains_qty=6, contains_unit_id=ud` no basta por sí solo para obtener 6 L. La revisión crítica anterior ya detectó este hueco; el plan original no lo corrigió. Es un bloqueo de K8/K9.

### 7.2 Proveedores diferentes

El mismo `products.id` puede tener:

| Proveedor | Presentación | Precio original | Normalizado |
|---|---|---:|---:|
| A | 6×1 L | 48 €/pack | 8 €/L |
| B | 12×500 ml | 52 €/pack | 8,666667 €/L |
| C | 1 L | 8,50 €/L | 8,50 €/L |

La identidad del producto no se contamina si proveedor, SKU, presentación, precio observado y precio normalizado están separados. El plan lo expresa, pero debe decidir si el precio actual admite un único precio vigente por producto o si el precio de proveedor solo vive como observación/histórico. La autoridad económica sigue siendo `product_prices`, no `supplier_product_presentations.list_price_eur`.

---

## 8. Prueba de histórico

El plan conserva el precio normalizado y declara que conserva la línea verificada, pero no presenta una única especificación de histórico transaccional inmutable.

Para que `20 €/caja` pueda derivar posteriormente `0,833333 €/ud` sin alterar el pasado, la línea histórica debe conservar como mínimo:

- proveedor y producto mapeado;
- presentación o texto de presentación;
- cantidad facturada y unidad facturada;
- precio unitario original y total de línea;
- contenido verificado usado para normalizar;
- fecha de factura y recepción;
- referencia a `purchase_invoice_line`, pedido y recepción;
- usuario/flujo que verificó;
- precio normalizado calculado y versión de conversión usada.

`product_price_history` por sí sola no cubre el precio original de presentación. `purchase_invoice_lines.verified_*` puede cubrirlo, pero el plan debe declarar que esos campos son append-only/versionados y que nunca se sustituyen por el normalized price.

### 8.1 Costes históricos ausentes

El plan exige preservar “costes históricos” en el enunciado, pero solo define el coste de receta como derivado del precio actual (§21). Para reproducir el coste de una venta o de una receta en una fecha pasada hacen falta:

- versión de la receta y sus líneas en esa fecha;
- precio normalizado vigente en esa fecha;
- versión de conversiones y presentación;
- factores de merma/yield vigentes;
- o un snapshot de coste calculado ligado a la transacción.

Sin una de esas dos estrategias, el sistema conserva históricos de precios pero no el coste histórico que se habría mostrado. Esto es B8 y bloquea el criterio de “migración sin pérdida”.

---

## 9. Prueba de stock

La autoridad final propuesta es correcta en dirección:

```text
stock inicial
+ PURCHASE
- SALE
- WASTE
± ADJUSTMENT de inventario
± rectificaciones
= v_current_stock
```

La tabla canónica debe ser `stock_movements`; `v_current_stock` debe ser una proyección regenerable. Los 77 negativos no deben ponerse a cero: deben ir a una cola de revisión y resolverse mediante movimientos con referencia y responsable.

### 9.1 Hueco de normalización histórica

El plan §17.3 agrupa por `product_id, stock_unit_id` y suma `qty_signed`. K10, sin embargo, solo exige llenar `stock_unit_id` desde el texto legacy (§23.2). Eso puede producir varias filas para el mismo producto en `g`, `kg`, `ml`, `l`, `ud` y sumar cantidades incomparables.

K10 debe exigir:

1. conservar `source_quantity` y `source_unit_code` originales;
2. calcular `normalized_qty` en la unidad de stock del producto;
3. usar solo `normalized_qty` en `v_current_stock`;
4. rechazar a revisión lo que no tenga conversión explícita;
5. preservar movimientos antiguos sin reescribirlos como si hubieran nacido normalizados;
6. representar las actualizaciones directas de `stock_current` que no tienen movimiento mediante `INITIAL_LOAD`/`ADJUSTMENT` explícito, con fecha y motivo, sin inventar su causa.

Sin esto no se puede afirmar que el stock sea reconstruible.

### 9.2 Idempotencia de efectos

Cada efecto PURCHASE, SALE, WASTE o ADJUSTMENT debe tener una clave única de idempotencia, por ejemplo `(source_system, reference_type, reference_id, movement_type, product_id)`, adaptada a líneas y recepciones. El plan menciona referencias, pero no define la restricción ni el comportamiento al reintentar un webhook, una recepción o un inventario.

---

## 10. Prueba de recetas y coste

El modelo correcto es:

```text
recipe_line(product, quantity, recipe_unit)
  → UnitConversionService / función SQL canónica
  → cantidad en buy_unit
  → product_prices.price_eur por buy_unit
  → coste de línea
```

La receta sí conserva producto, cantidad y unidad; la unidad puede diferir de compra, stock y precio. El frontend no debe convertir manualmente: debe recibir el estado del motor y pintar `OK`, `MISSING_PRICE`, `INCOMPATIBLE_UNITS` o `AMBIGUOUS_CONVERSION`.

Pero K4 no es ejecutable tal como está escrito:

- K4 dice que el wrapper antiguo puede seguir emitiendo `0` “por ahora” (§33 K4).
- `PRECIOS-Y-COMPRAS.md` y `PRINCIPIOS.md` prohíben precisamente ocultar una ausencia detrás de cero.
- El plan exige que la BD no devuelva 0 (§21.1), por lo que el wrapper compatible debe dejar de ser compatible en ese sentido: debe devolver estado o fallar explícitamente.

El criterio correcto es: no activar ninguna ruta de coste que pueda devolver `0` para `INCOMPATIBLE_UNITS`, `MISSING_PRICE` o `PRESENTATION_UNKNOWN`. La compatibilidad debe ser de forma de respuesta, no de semántica falsa.

---

## 11. Prueba TS / SQL / frontend / backend

El estado actual tiene divergencias conocidas: cinco normalizadores, múltiples conversiones, coste TS/SQL distinto y pantalla que prioriza `backendCost` (§auditoría heredada §D, plan §5.2-5.3).

El plan futuro acierta al pedir un motor por capa y paridad, pero sus gates son insuficientes:

- `grep "export function normalizeUnit"` no detecta `normalizeUnit` locales no exportadas, `norm`, `normalizeWasteUnit` ni conversiones inline.
- “Un motor TS y uno SQL” sigue siendo dos implementaciones; solo es aceptable si ambos leen la misma tabla, tienen contrato de estados idéntico y un test de paridad bloqueante.
- `UnitConversionService` se describe como “SSOT en memoria TS” (§25.1), pero el SSOT debe ser la tabla/versionado; la memoria es caché, nunca autoridad.
- El plan no define una fecha/flag de retirada de los wrappers legacy ni una lista completa de lectores antes de K12.
- El frontend actual puede usar `backendCost` mientras las líneas muestran estados calculados en TS; K4/K11 deben eliminar esa mezcla, no solo añadir un nuevo RPC.

Gate necesario: inventario de todos los productores y lectores por magnitud, comprobación estática y prueba de ejecución; cero escritores legacy antes de activar el writer canónico.

---

## 12. Prueba de IA/OCR

El pipeline propuesto es correcto:

```text
OCR observado
→ matching proveedor-producto
→ presentación y contenido
→ conversión
→ validación
→ confirmación
→ transacción
```

`CAJA 24 UDS / 20 €` debe acabar como presentación verificada, `20 €/caja` preservado y `0,833333 €/ud` derivado. Si falta el contenido, `REQUIRES_REVIEW`; nunca `factor=1`.

El hueco de ejecución está en la transición: `handle_new_invoice_line` hoy escribe precio y stock al insertar la línea (§28.1). K9/K11 deben impedir que una línea observada o verificada parcialmente dispare el trigger viejo. Hace falta una condición única de “verified + matched + presentation known + reception confirmed” y una garantía de que el antiguo trigger no puede actuar en paralelo.

También debe quedar prohibido que `conversion_factor` sobreviva como número semánticamente ambiguo. Puede conservarse como dato legacy observado, pero no como entrada del motor canónico una vez exista la presentación explícita.

---

## 13. Datos ambiguos y clasificación

La clasificación A/B/C/D es útil, pero no está suficientemente cerrada para ejecutar K2/K8/K9.

| Clase | Significado operativo | Regla necesaria |
|---|---|---|
| AUTO-MIGRATE | Correspondencia exacta y verificable | Ejecutar solo con conteo before/after y constraint posterior |
| TRANSFORM DETERMINISTICALLY | Transformación reversible con evidencia suficiente | Guardar mapa de transformación por fila y snapshot |
| REQUIRES_REVIEW | Falta contenido, mapping, dimensión o precio fiable | No crear maestro ni movimiento normalizado |
| PRESERVE_HISTORICAL | El dato no puede limpiarse sin destruir su significado pasado | Conservar raw y marcarlo no utilizable como maestro |
| UNRECOVERABLE | No existe evidencia suficiente | No inventar destino; registrar cola y motivo |

Puntos aún peligrosos:

- `u→ud` no debe ser una transformación global solo por probabilidad de contexto; debe clasificarse por columna, producto y evidencia.
- `gr` no puede convertirse indistintamente en `g` o `kg`; debe derivarse de la magnitud y del dato fuente, y dejar revisión cuando no pueda demostrarse.
- K2 dice `gr→g/kg`, pero su criterio solo habla de eliminar `gr` de `purchase_unit`; no verifica coherencia entre `purchase_unit`, `unit_type`, `unit` y stock.
- `caja`/`pack` sin contenido deben permanecer en `REQUIRES_REVIEW`; no se debe crear una presentación `1 ud` por conveniencia.
- Los porcentajes estimados A/B/C/D del plan (§22.1) no son un gate de seguridad. Deben ser resultado de un reporte reproducible, no una premisa.

---

## 14. Orden K1-K12

### 14.1 Orden actual y riesgo por fase

| Fase | Necesita | Crea/cambia | Dependen de ella | Qué rompe si llega antes | Evaluación |
|---|---|---|---|---|---|
| K1 | Nada, salvo confirmar corpus vigente | Citas SSOT y bloqueo de `price_locked` | K2, K4, K6, K9 | Si no se corrige, los escritores siguen usando norma rota | Válida como precondición |
| K2 | Snapshot, clasificación por fila y rollback | Textos legacy de unidades | K3, K8 | Cambiar `u/gr` sin evidencia contamina FKs y precios | Requiere endurecer |
| K3 | Inventario completo de mappings y timestamps | Selección determinista | K5 según plan, K8/K9 realmente | Elegir un mapping incorrecto cambia precio/stock | Válida tras auditoría |
| K4 | Contrato de unidades/conversión disponible | RPC de coste con estados | K11 | Si se ejecuta antes de la conversión canónica, cristaliza otra semántica | Dependencia declarada incorrecta |
| K5 | Adaptar todos los callers y auditoría de grants | Único camino de stock del copiloto | K10/K11 | Revocar antes de adaptar deja al copiloto roto; mantenerlo duplica stock | Válida solo con caller gate |
| K6 | Tablas y semillas de unidades, o un contrato explícito provisional | Servicio TS + función SQL | K7, K8, K9, K11 | Hoy usa una tabla que K8 crea después | **Circular** |
| K7 | K6, corpus de datos y esquema canónico | Comparación read-only | K8 | No puede comparar contra función que no tiene tabla fuente | **Circular** |
| K8 | K7 según plan, pero K7 necesita parte de K8 | Tablas canónicas y backfill | K9/K10/K11 | Backfill sin semántica final de presentación crea maestros incorrectos | **Debe dividirse** |
| K9 | Products/presentaciones/conversor y recomputación independiente | `product_prices`, dual write | K10/K11/K12 | Copiar `current_price` duplica errores y crea dos autoridades | Bloqueada por B2/B6 |
| K10 | Movimientos normalizados, K5 y units | Vista de stock y reconciliación | K11/K12 | Vista sobre cantidades incompatibles falsea stock | Bloqueada por B4 |
| K11 | Precio, stock, coste y recepción con idempotencia | Flujos operativos canónicos | K12 | Trigger viejo puede duplicar recepción/stock; venta puede consumir sin puente | Bloqueada por B5/B7 |
| K12 | Shadow, cero lectores/escritores legacy y restore probado | Retirada de columnas/RPC/triggers | Ninguna | Drop sin restore probado destruye rollback | No lista para ejecución |

### 14.2 Orden seguro propuesto

No es una ejecución ni una nueva funcionalidad; es la corrección de dependencias del plan:

1. **K1** — documentación y lock, sin cambios persistentes de datos.
2. **K2-preflight** — snapshot, clasificación A/B/C/D por fila y reporte; todavía no transformar las filas ambiguas.
3. **K3** — determinismo de mappings, después de tener identificadas duplicidades y sin activar mappings no verificados.
4. **K5** — cerrar el escritor directo de stock después de adaptar y probar todos sus callers; puede ejecutarse sobre el esquema legacy.
5. **K8a** — crear y proteger `unit_dimensions`, `units`, `unit_conversions` y el esqueleto de identidad canónica. Semillas y constraints, sin cut-over.
6. **K6** — implementar normalizador/conversor contra ese esquema y sus estados; ningún módulo antiguo se considera autoridad nueva.
7. **K7** — paridad TS/SQL sobre corpus real y casos universales/presentación; bloqueante.
8. **K8b** — backfill de productos, presentaciones, supplier products y colas de revisión; no mezclarlo con la creación de tablas.
9. **K9** — recomputar precios desde líneas/presentaciones verificadas, no copiar ciegamente `current_price`; activar un único writer de `product_prices` y dejar legacy como proyección.
10. **K4** — activar coste con estados sobre precios y conversiones canónicas; no conservar wrapper que emita cero semántico.
11. **K10** — normalizar movimientos históricos a stock unit, construir la vista y resolver/revisar los 77 negativos.
12. **K11** — recepción explícita, recetas FK, inventario, venta y consumo, con idempotencia y flags por flujo.
13. **K12** — eliminar solo después de shadow, cero referencias y restore verificado.

Si se quieren conservar los números K originales, K8 debe documentarse como K8a/K8b y las dependencias de K4/K6/K7 deben actualizarse explícitamente. El orden actual no es seguro por la circularidad K6→K7→K8→K6.

---

## 15. Prueba de migración sin pérdida

| Dato | Cómo se conserva | Hueco actual |
|---|---|---|
| Histórico de compras | `purchase_invoices` y líneas raw/verificadas | Falta declarar append-only/versionado de `verified_*` |
| Precio original de presentación | Snapshot `20 €/caja` en línea verificada | Debe ser obligatorio y no sustituible por normalized |
| Precio normalizado histórico | `product_price_history` con unidad y source | Debe guardar versión de conversión/presentación |
| Movimientos de stock | Tabla legacy preservada + campos source | Falta `source_quantity/source_unit` y normalización histórica segura |
| Ventas | `tickets_marbella` y líneas | Falta idempotencia y versión de receta/consumo para coste histórico |
| Recetas | `recipes`/`recipe_lines` | No existe versionado o snapshot de líneas |
| Costes históricos | Recalculables solo si hay snapshots/versiones | **No resuelto** |
| Proveedores | `suppliers` y `supplier_products` | Decisión bigint/uuid pendiente (§14.1) |
| Presentaciones | Product/supplier presentations | Falta resolver dueño único del contenido |

Está prohibido normalizar retrospectivamente una línea de factura y borrar su unidad original. El valor limpio es derivado; no reemplaza el hecho histórico.

---

## 16. Prueba de rollback

| Fase | Qué puede cambiar | Snapshot/comprobación necesaria | Rollback seguro requerido | Estado actual |
|---|---|---|---|---|
| K1 | Código/comentarios y lock | Tests antes/después | Revert de código | Aceptable |
| K2 | Datos textuales legacy | Snapshot por tabla y mapa por fila | Restaurar solo filas afectadas sin perder escrituras posteriores | El `UPDATE` inverso genérico no basta |
| K3 | Selección de mappings/índices | Lista de duplicados y query determinista | Revertir selección sin borrar mappings | Aceptable si no se borra |
| K4 | RPC/contrato de coste | Corpus de paridad y compatibilidad de respuesta | Flag a motor anterior, pero nunca a un motor que devuelve 0 silencioso | Debe eliminar wrapper 0 |
| K5 | Grants y writers de stock | Lista de callers y prueba de permisos | Revertir permiso no deshace movements; requiere reconciliación | Incompleto |
| K6/K7 | Servicios, función y tests | Fixtures versionadas | Desactivar adapter sin dejar dos writers | Requiere esquema K8a |
| K8 | Tablas y backfills | Dump de tablas nuevas + conteos + mappings | No `DROP` directo; conservar tablas y desactivar flags, o exportar/restaurar probado | `DROP SCHEMA canonical` no corresponde al diseño público descrito |
| K9 | Precios actuales e históricos | Snapshot de product_prices/history + source refs | Desactivar writer canónico; conservar nuevas filas, no `DELETE` de toda la ventana | El `DELETE FROM product_prices` propuesto no es aceptable |
| K10 | Proyección y ADJUSTMENT | Snapshot de vista, movimientos y cola C | Flag solo si existe un writer único; recalcular vista después | Requiere protocolo de freeze/replay |
| K11 | Recepciones, ventas, consumos | Idempotency keys y ledger de efectos | Flags por flujo + reconciliación de movimientos ya emitidos | Incompleto sin idempotencia |
| K12 | Drop de columnas/RPC/triggers | Backup restaurable y ensayo de restore | No borrar hasta probar restore; si se borra, rollback no es inmediato | El plan se contradice: “restaurar” pero “no se puede si se borró” |

La ausencia de entorno de pruebas (§ARQUITECTURA §11) eleva estos gates: cada snapshot y rollback debe ser verificable antes en forma de script/runbook contra una copia restaurable o mediante un procedimiento probado, no solo descrito.

---

## 17. Prueba de eliminación del legacy

| Legacy | Sustituto | Fase de deprecación | Fase de eliminación | Condición obligatoria |
|---|---|---|---|---|
| `ingredients.current_price` | `product_prices.price_eur` | K9 | K12 | ProductPriceService único writer; cero lectores directos; shadow histórico y actual sin diff bloqueante |
| `ingredients.stock_current` | `v_current_stock` | K10 | K12 | Todas las escrituras pasan por movements; vista normalizada; 77 negativos revisados o cola asignada |
| `ingredients.unit`, `base_unit`, `unit_type` | `units` + defaults | K8/K10 | K12 | Cero lectores/escritores; cada cantidad histórica conserva unidad raw |
| `ingredients.purchase_unit` | `products.default_buy_unit_id` | K9 | K12 | Precio y presentación migrados; ningún cálculo lee texto |
| `ingredients.recipe_unit` | `products.default_recipe_unit_id` | K8/K11 | K12 | Todas las líneas tienen `quantity_unit_id` |
| `ingredients.order_unit` | `default_order_presentation_id` | K8 | K12 | Cada `caja/pack` tiene contenido o está en review |
| `ingredients.pack_*` y `supplier_pricing_mode` | presentations + price service | K8/K9 | K12 | Todas las presentaciones clasificadas y precio recomputado |
| `supplier_item_mappings.conversion_factor` | contenido explícito de presentación | K8/K9 | K12 o read-only histórico | Cero lectores del número ambiguo; mapping antiguo conservado raw |
| `supplier_item_mappings` | `supplier_products` + supplier presentations | K8 | K12 o read-only histórico | 100 % de filas clasificadas; no se borra ninguna irreconstruible |
| `normalizeUnit` locales, `norm`, `normalizeWasteUnit` | `unitNormalizer` canónico | K6 | K6/K12 | Gate AST/grep que detecte todas las copias, no solo exports |
| Conversiones SQL antiguas | `convert_unit_canonical` | K6 | K11/K12 | Paridad 100 % y cero callers legacy |
| `get_recipe_cost` / `fn_recipe_line_cost` | v2 JSON con estado | K4 | K11/K12 | Cero rutas que devuelvan 0 como error; shadow y UI migradas |
| `actualizar_stock` | `actualizar_stock_con_movimiento` | K5 | K5/K12 | Grants revocados y cero callers, no solo flag |
| `handle_new_invoice_line` stock automático | `ReceptionService`/trigger de recepción | K9/K11 | K11/K12 | Confirmación de recepción e idempotencia; cero PURCHASE duplicados |
| `update_ingredient_stock_trigger` sobre columna mutable | vista/proyección de movements | K10 | K12 | Ningún UPDATE directo; fuente de movimientos normalizada |
| `ingredient_price_history` | `product_price_history` | K9 | No eliminar por defecto | Read-only histórico preservado; filas nuevas solo en sistema canónico |
| `purchase_invoice_lines.line_unit` | `observed_billing_text` + verified FK | K9/K11 | No eliminar raw histórico | Cero lectores como unidad maestra; raw disponible para auditoría |
| `recipes.articulo_id` | `map_tpv_receta` | K11 | K12 | Cero escritores/lectores y FK de recipe mapping verificado |

“Sin lectores” debe comprobarse en código, migraciones, vistas, funciones, jobs, policies y consultas dinámicas; un grep de una sola cadena no es suficiente.

---

## 18. Criterios de aceptación final corregidos

El plan solo puede cambiar a READY FOR EXECUTION cuando todos sean verdaderos:

1. Existe una tabla SSOT única para cada concepto y se ha elegido `products.default_*` frente a `product_defaults`.
2. `current_price` es proyección legacy no escribible; `product_prices` tiene un único writer.
3. La composición de presentación tiene un único dueño; no existe `scope_presentation_id` semánticamente duplicado.
4. Cada presentación volumétrica o de masa tiene contenido por pieza explícito cuando lo necesita.
5. `unit_conversions` solo resuelve conversiones permitidas por dimensión y puentes de producto documentados.
6. El precio original de factura conserva cantidad, unidad, presentación, proveedor, fecha y referencia transaccional.
7. Existe una estrategia de coste histórico: versionado de receta/conversión/precio o snapshot de coste.
8. Cada movimiento histórico tiene unidad original preservada y cantidad normalizada a la unidad de stock antes de agregarse.
9. `v_current_stock` es reconstruible y los 77 negativos tienen estado, responsable y criterio de cierre; no se corrigen automáticamente a cero.
10. Recepción, invoice line y stock tienen una única cantidad recibida y una clave de idempotencia.
11. El coste SQL/TS comparte contrato de estados y nunca devuelve cero para un fallo.
12. OCR solo escribe observed; la transacción maestra requiere matching, presentación conocida, validación y confirmación.
13. `u`, `gr`, `caja`, `pack` y valores desconocidos se clasifican por fila; no se aplican conversiones globales por probabilidad.
14. El orden K no contiene ciclos y K8 se divide o se reordena para que K6/K7 tengan su tabla fuente.
15. Cada fase tiene snapshot, prueba previa, criterio posterior y rollback que no borra datos creados posteriormente.
16. Existe una matriz de escritores/lectores y fechas de retirada para todo el legacy.
17. Los gates de paridad, shadow, idempotencia y restauración se han ejecutado; no basta con que estén descritos.
18. Los tests Coca-Cola, Aceite, Leche y proveedores múltiples pasan usando presentación, contenido y precio original, no fixtures simplificados que omitan esos campos.

---

## 19. RONS — NOT READY

El modelo canónico es razonable, pero el plan K1-K12 **no está listo para ejecución** por B1-B10. Las correcciones mínimas que deben quedar documentadas antes de tocar la BD son:

- romper el ciclo K6/K7/K8 mediante K8a/K8b o un orden equivalente;
- elegir una única autoridad final para defaults de unidad y para precio actual;
- separar definitivamente conversiones dimensionales de composición de presentaciones;
- especificar contenido por pieza para packs como Leche `6×1 L`;
- impedir que K9 copie `ingredients.current_price` sin recomputación independiente;
- normalizar movimientos históricos a la unidad de stock preservando cantidad/unidad originales;
- hacer idempotentes recepción, venta, consumo e inventario;
- eliminar el wrapper de coste que devuelve cero como compatibilidad;
- añadir versionado/snapshot suficiente para costes históricos;
- reemplazar los rollbacks destructivos por procedimientos que no borren datos posteriores;
- completar la matriz de retirada del legacy con condiciones verificables.

Hasta que estas condiciones se incorporen a un nuevo plan o a una decisión aprobada, el estado correcto es **NOT READY**, no **READY FOR EXECUTION**.

---

## 20. Referencias

- `marbella-os/6-investigacion/spikes/2026-08-10-auditoria-dominio-producto-unidades.md`
- `marbella-os/6-investigacion/spikes/2026-08-10-revision-critica-unidades-por-contexto.md`
- `marbella-os/6-investigacion/spikes/2026-08-10-plan-migracion-dominio-producto-unidades.md`
- `marbella-os/3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md`
- `marbella-os/3-ingenieria/MODELO-DE-DATOS.md`
- `marbella-os/3-ingenieria/ARQUITECTURA.md`
- `marbella-os/3-ingenieria/SEGURIDAD.md`
- `marbella-os/1-producto/PRINCIPIOS.md`
- `marbella-os/1-producto/MAPA-DE-CAPACIDADES.md`
- `marbella-os/5-estado/DEUDA.md`
- `marbella-os/5-estado/ESTADO.md`

> Este documento es un spike inmutable y no normativo. No modifica el plan original ni autoriza K1-K12.
