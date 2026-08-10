---
documento: SPIKE-PLAN-MIGRACION-DOMINIO-PRODUCTO-UNIDADES
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-10
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA, DEUDA, ESTADO, MAPA-DE-CAPACIDADES
---

# Plan de migración — Dominio producto / unidades / cantidades / precios / costes

> **MATERIAL NO NORMATIVO — SPIKE-PLAN-MIGRACION-DOMINIO-PRODUCTO-UNIDADES**
>
> Esto es un análisis fechado el 2026-08-10, no una norma. **No autoriza ninguna decisión** ni modifica el sistema. Describe un diseño futuro y un plan de ejecución paso a paso.
>
> La norma vigente vive en `marbella-os/`; la jerarquía que la ordena, en `marbella-os/CANON.md`. Ante cualquier discrepancia gana el documento normativo, sin discusión.

**Fecha:** 2026-08-10 · **Modo:** solo lectura (código + SELECT/RPC en BD real + auditoría heredada) · **Repo:** `marbella-app`
**Normativa aplicada:** CANON, GLOSARIO, MODELO-DE-DATOS, PRECIOS-Y-COMPRAS, ARQUITECTURA, DEUDA, ESTADO, MAPA-DE-CAPACIDADES, PRINCIPIOS, PROTOCOLO-AGENTES.
**Auditoría heredada:** SPIKE-AUDITORIA-DOMINIO-PRODUCTO-UNIDADES (2026-08-10), 346 líneas, §A–§N.
**Convención de etiquetas:** VERIFICADO (evidencia actual en código/datos) · HEREDADO (hallazgo de la auditoría anterior) · PROPUESTO (diseño futuro) · PENDIENTE (falta decisión/evidencia) · DESCONOCIDO (no se puede determinar).

---

## 1. Resumen ejecutivo

El dominio que conecta el dato de proveedor («una caja de 24 ud a 20 €») con el dato de negocio («una ración cuesta 0,83 € de coste») carece hoy de una semántica compartida. Existen **6 columnas de unidad** en `ingredients` con significados solapados, **7 vocabularios** de unidades, **5 normalizadores sintácticos**, **~8 implementaciones de conversión** y una divergencia real entre el coste de receta en TypeScript (que distingue `incompatible_units`) y en SQL (que devuelve `0` silenciosamente).

El resultado visible:
- **77 ingredientes con stock negativo** (HEREDADO) entre ellos Limón −31.889 ud, Vasos 350ml −22.392 ud.
- **5 recetas con food cost >300 %** (HEREDADO): Oreo Helado 1.957 %, Pirulo 1.440 %, Tropical 1.200 %.
- **`canonicalPurchaseUnit` mapea desconocido→`kg` silenciosamente** (VERIFICADO en `albaran-price-match.ts:97`).
- **RPC `actualizar_stock` modifica stock sin movimiento** (VERIFICADO en `20260508153000_copilot_rpcs.sql:72-74`).
- **5 ficheros citan un SSOT que ya no existe** (VERIFICADO): `context/INGREDIENTS_PRECIOS_Y_ALBARANES.md` fue sustituido por PRECIOS-Y-COMPRAS.md pero nadie re-apuntó las citas.

Este documento diseña la **arquitectura canónica futura**, el **plan K1–K12 de migración incremental**, la **estrategia de shadow validation**, la **clasificación de datos corruptos** y el **mapa de impacto con referencias de fichero y línea**.

No se implementa nada. No se tocan datos. El objetivo es alcanzar una **Single Source of Truth real** para producto, unidad, dimensión, cantidad, presentación, conversión, precio y coste.

---

## 2. Contexto y normativa

### 2.1 Corpus normativo utilizado (todos `vigente` y `normativo: true`)

| Documento | Precedencia | Aplicación en este plan |
|---|---|---|
| CANON | 100 | Jerarquía de fuentes, dueño único por hecho, ciclo de vida, front-matter |
| PRINCIPIOS | 60 | Prioridad de arbitraje: operación > honestidad > seguridad > corrección > comodidad |
| ADR-0001 (hours-engine) | 80 | Patrón de motor único → aplicable a coste y conversión |
| MODELO-DE-DATOS | 20 | Autoridad de cada magnitud, duplicaciones conocidas (D19, D20, D21) |
| PRECIOS-Y-COMPRAS | 20 | SSOT del precio actual en €/unidad de compra, invariantes 1-6, modo per_pack derivado |
| ARQUITECTURA | 20 | Capas, motores, circulación de datos, §11 sin entorno de pruebas |
| GLOSARIO | 20 | Términos canónicos: ingrediente, albarán, mapeo, precio actual, precio bloqueado, etc. |
| MAPA-DE-CAPACIDADES | 20 | Estado: Inventario=frágil, Consumo personal=frágil, Recetas=consolidada |
| DEUDA | 20 | D19 (tipos sin usar), D21 (TS+SQL duplicado), D22 (pruebas sin ejecutar), D27 (reglas huérfanas) |
| ESTADO | 20 | Inventario=frágil, Consumo personal=frágil, Copiloto=frágil |
| PROTOCOLO-AGENTES | 20 | Ciclo 7-fase, P1 conocimiento precede acción, P3 dejar corpus mejor |
| FRONTEND | 20 | Componente 48 px, Cero mostrado como blanco |
| SEGURIDAD | 20 | Políticas RLS; tabla nueva nace con política |

### 2.2 Principios obligatorios aplicados (del enunciado del plan)

1. Una única fuente de verdad por concepto.
2. Una única semántica de dominio.
3. Conversiones deterministas.
4. Trazabilidad completa.
5. Separar datos: maestros / transaccionales / históricos / derivados / observados.
6. Producto maestro independiente del proveedor.
7. Presentación comercial separada de unidad física.
8. No confundir SSOT con «una única unidad para todo».
9. El frontend no redefine reglas de dominio.
10. SQL/backend/frontend no mantienen conversiones divergentes.
11. IA/OCR proporciona datos observados, no verdad maestra.
12. No usar factor=1, 0 o NULL como fallback silencioso cuando cambia el significado económico.
13. No inventar conversiones para datos ambiguos.
14. Preservar histórico.
15. Extensible: no depender de Carrefour, Coca-Cola, cajas como casos concretos.

### 2.3 Orden de prioridad del plan (del enunciado)

**Corrección semántica > Integridad de datos > Trazabilidad > Compatibilidad > Velocidad**

---

## 3. Auditoría heredada

### 3.1 Hallazgos heredados y confirmados

Todas las afirmaciones de la auditoría SPIKE-AUDITORIA-DOMINIO-PRODUCTO-UNIDADES §A–§N se han verificado contra el código actual del repositorio el 2026-08-10. **Resultado: 0 discrepancias.**

| # | Hallazgo | Etiqueta | Confirmación concreta |
|---|---|---|---|
| H1 | 226 ingredientes, 6 columnas de unidad con mezcla `ud`/`kg`/`u`/`l`/`gr`/`ml` | HEREDADO + VERIFICADO | `purchase_unit`, `unit`, `base_unit`, `recipe_unit`, `order_unit`, `unit_type` en esquema. |
| H2 | 77 ingredientes `stock_current < 0` | HEREDADO | Datos de BD 2026-08-10; causante: SALE masivo sin entrada equivalente. |
| H3 | 5 recetas food cost > 300 % por precio de caja como unitario | HEREDADO | Oreo 1.957 %, Pirulo 1.440 %, Tropical 1.200 %, Sangría 685 %. |
| H4 | `waste_percentage` campo muerto | HEREDADO + VERIFICADO | Grep sin lectores más allá de formularios de guardado. |
| H5 | `fn_recipe_line_cost` devuelve `0` ante conversión NULL | HEREDADO + VERIFICADO | `20260513121500_recipe_cost_cl_and_pack_bridge.sql:151-170`. |
| H6 | Pedido a proveedor → PDF/WhatsApp, sin conexión con stock | HEREDADO + VERIFICADO | `purchase_order_items.unit_price = 0` en todos los items. |
| H7 | 5 citas a SSOT `context/INGREDIENTS_PRECIOS_Y_ALBARANES.md` que no existe | HEREDADO + VERIFICADO | Grep en src/ 5 ficheros: `ingredient-price-sync.ts:3`, `IngredientWizard.tsx:1`, `recipe-cost.ts:10`, `ingredients/page.tsx:2`, `albaranes/actions.ts:3`. |
| H8 | 7 vocabularios de unidades | HEREDADO + VERIFICADO | STANDARD_UNITS, RECIPE_UNIT_OPTIONS, ORDER_UNITS, ORDER_CARD_UNITS, WASTE_UNITS, IA_IMPORT_UNITS, PACK_PRESETS. |
| H9 | ~8 implementaciones de conversión | HEREDADO + VERIFICADO | TS ×3, SQL ×5 (convert_pricing_qty, recipe_qty_to_purchase, invoice_line_price, staff_consumption, normalize_pricing_unit). |
| H10 | `canonicalPurchaseUnit` devuelve `'kg'` ante desconocido/vacío | HEREDADO + VERIFICADO | `albaran-price-match.ts:97` y `:104`. |
| H11 | `actualizar_stock` RPC sin movimiento | HEREDADO + VERIFICADO | `20260508153000_copilot_rpcs.sql:61-82` UPDATE directo. |
| H12 | TS vs BD coste: TS distingue `incompatible_units`, BD devuelve 0 | HEREDADO + VERIFICADO | `recipe-cost.ts:202-204` vs `20260513121500:168-170`. |
| H13 | `supplier_id` (ingredients) texto sin FK, vínculo por nombre | HEREDADO + VERIFICADO | `orders/new/page.tsx:147` JOIN por `suppliers.name = ingredients.supplier`. |
| H14 | `ingredient_price_history.changed_by` todo NULL | HEREDADO | 1.162 filas sin usuario. |

### 3.2 Discrepancias con auditoría

**Ninguna.** Todos los hallazgos de la auditoría del 2026-08-10 siguen presentes en el estado actual del código y las migraciones del 2026-08-10. No se ha ejecutado ninguna corrección desde la auditoría.

---

## 4. Estado actual

### 4.1 Capacidades y su estado (MAPA-DE-CAPACIDADES)

| Capacidad | Estado | Relevancia para la migración |
|---|---|---|
| Compras y albaranes | consolidada | **Origen** del precio actual y del stock de entrada |
| Inventario | frágil | **Destino** afectado; stock negativo masivo |
| Recetas y escandallos | consolidada | **Consumidor** del precio y la conversión |
| Consumo personal | frágil | Puente stock→valoración depende de unidad |
| Copiloto | frágil | Escritor alternativo sin rastro (stock) |
| Análisis de negocio | en movimiento | Indicadores dependen de food cost correcto |

### 4.2 Deuda técnica directa relacionada (DEUDA)

| Deuda | Impacto en migración |
|---|---|
| D19 Tipos BD sin usar → 15 tablas sin tipar | Cualquier cambio de esquema es manual; no hay red de TypeScript |
| D21 Reglas en TS y SQL duplicadas | La migración de coste de receta debe alinear ambas o la brecha empeora |
| D22 Sin tests ejecutables | No hay forma de validar regresión antes de tocar producción |
| D23-D26 Agujeros de acceso | Innecesarios para la migración, pero deben resolverse antes o en paralelo |
| D15 Deuda de vocabulario: `u` vs `ud`, `gr` vs `kg` | El corazón mismo de esta migración |

### 4.3 Arquitectura del dato hoy (ARQUITECTURA §5-6)

Sin motor canónico. El coste de receta tiene dos productores (TS `recipe-cost.ts`, SQL `fn_recipe_line_cost`) que deben coincidir pero divergen (H12). El stock tiene dos escritores: trigger `update_ingredient_stock_trigger` (con rastro) y RPC `actualizar_stock` (sin rastro). Normalización sintáctica: 5 funciones. Precio: albarán (trigger), manual, pack (trigger) compiten por `current_price` («manda el último que escriba», PRECIOS-Y-COMPRAS §3).

---

## 5. Modelo actual

### 5.1 Mapa tabla → concepto actual

| Concepto | Tabla/archivo actual | Campos clave | Fuente actual de verdad | Problema fundamental | Destino (PROPUESTO) |
|---|---|---|---|---|---|
| Producto / Ingrediente maestro | `ingredients` | `id, name, purchase_unit, unit, base_unit, unit_type, recipe_unit, order_unit, current_price, supplier_pricing_mode, pack_price, pack_units, pack_unit_size_qty, pack_unit_size_unit, stock_current, supplier_id, supplier, supplier_2, price_locked, inventory_visible, waste_percentage` | Último escritor manual/albarán/pack | 6 columnas unidad duplicadas; supplier_id huérfano; stock sin SSOT de movimiento | `products` (maestro) + `product_units` (configuración canónica) |
| Unidad física | Columna `unit`/`base_unit` en `ingredients` | `ud/g/kg/ml/l/cl/u/gr` | Trigger + formulario | `u≠ud`, `gr≠kg`, valores legacy sin normalizar | Tabla `units` canónica |
| Dimensión (masa/volumen/conteo) | Implícita en código (MASS_UNITS/VOLUME_UNITS/COUNT_UNITS) | `recipe-cost.ts:15-17` | Código TS | No existe en datos; SQL tiene lógica equivalente sin compartir | `unit_dimensions` enumerada |
| Presentación / Pack (ingrediente) | `ingredients.pack_*` | `pack_price, pack_units, pack_unit_size_qty, pack_unit_size_unit, supplier_pricing_mode` | Formulario `IngredientWizard` | Colapsa presentación y modo de precio en el maestro; no por proveedor | `product_presentations` |
| Presentación / Proveedor | `supplier_item_mappings` | `line_billing_unit, line_content_qty, line_content_unit, conversion_factor, last_known_price` | Aprendizaje OCR + confirmación | Sin ORDER BY estable en selección; tríada vs factor superpuestos | `supplier_product_presentations` |
| Conversión (precio albarán) | SQL `invoice_line_price_to_purchase_unit` | `20260515160700:11-36` | Trigger `handle_new_invoice_line` | Usa tríada o fallback cf sin documentar cuál gana | `unit_conversions` (compartido) |
| Conversión (receta) | TS `recipe-cost.ts` + SQL `recipe_qty_to_purchase_unit_for_cost` | ~200 líneas cada uno | Ambos, deben coincidir | Divergen (0 vs incompatible_units) | Motor canónico único por capa |
| Conversión (consumo personal) | SQL `staff_consumption_qty_to_purchase_unit` | `20260512200000:11-75` | RPC | Aislado, no comparte tabla | Motor canónico único |
| Precio actual | `ingredients.current_price` | `numeric(10,2)` | Último: albarán / manual / pack | No registra *qué unidad* representa el precio (invariante 1 sí lo hace, pero implícitamente) | `product_prices` con `reference_unit_id` |
| Precio observado (OCR) | `purchase_invoice_lines.unit_price, line_unit, total_price` | OCR directo | OCR/IA + edición manual | `line_unit` es caótico (681 NULL, CJ/CAJA/UNI/MAN…) | Dato observado, nunca verdad maestra |
| Precio histórico | `ingredient_price_history` | `old_price, new_price, changed_at, changed_by=NULL` | Trigger | Sin autor; sin unidad de referencia | `product_price_history` con unidad |
| Producto-Proveedor | `supplier_item_mappings` + `ingredients.supplier/supplier_2` | Nombres, no FK | Vínculo por nombre | Sin FK; múltiples proveedores en texto libre | `supplier_products` FK |
| Proveedor | `suppliers` | 18 filas | Manual | OK | Se mantiene |
| Pedido | `purchase_orders`, `purchase_order_items` | `unit_price=0` en todos items | Manual/PDF | No afecta a stock ni precio | `purchase_orders` (enhanced) |
| Compra / Albarán | `purchase_invoices`, `purchase_invoice_lines` | `quantity, unit_price, mapped_ingredient_id, status, line_unit, base_price, tax_rate, total_price` | OCR + manual | Origen real; trigger actualiza precio | Se mantiene con mejor trazabilidad |
| Recepción | Implícita: trigger al insertar línea mapeada | `handle_new_invoice_line` | Trigger | No hay entidad recepción explícita | `stock_movements` con `source_reception_id` |
| Stock | `ingredients.stock_current` | `stock_current` (número) | Trigger + RPC sin rastro | No concilia con movimientos; 77 negativos | **Proyección** de `stock_movements` |
| Movimiento | `stock_movements` | 181.560 filas, tipos SALE 176.780 / PURCHASE 1.182 / WASTE 3.440 / INVENTORY 80 / ADJUSTMENT 78 | Trigger de tablas + deducción venta | OK como concepto; falta cerrar el UPDATE sin rastro | Tabla canónica, FK a `units`, único escritor |
| Inventario | `INVENTORY_COUNT` en movements | 80 filas | Acción manual | Pocos datos; sin auditoría separada | `inventory_counts` explícito |
| Merma | `WASTE` en movements | 3.440 filas | Acción manual | OK | Se mantiene |
| Venta (deducción stock) | `SALE` en movements, `process_ticket_stock_deduction` | 176.780 filas | Webhook BDP | Unidades de receta sin puente a entrada; stock negativo | Deducción por unidades canónicas |
| Receta | `recipes` + `recipe_ingredients` | 158 recetas, 362 líneas, `quantity_gross, quantity_net, unit, quantity_half, umb_multiplier` | Formulario recetas | OK estructura; `unit` mezcla `u` legacy | Líneas con `unit_id` FK |
| Coste / Escandallo | `fn_recipe_line_cost` + `recipe-cost.ts` | 9 args SQL / 2 implementaciones | RPC + cliente | Divergencia H12; BD devuelve 0 | Motor canónico, una implementación por capa con tests de paridad |

### 5.2 Normalizadores sintácticos hoy (5 duplicados)

| Nombre | Archivo:Línea | Valores de entrada | Fallback | Propósito |
|---|---|---|---|---|
| `normalizeUnit` | `recipe-cost.ts:19-28` | l/lt/litro, ml, cl, kg/kilo, g/gr/gramo, ud/u/unidad/un | **Devuelve entrada sin cambiar** si no reconoce | coste receta |
| `normalizeUnit` | `ingredients/page.tsx:23-32` | igual que arriba más `uds`, `unidades`, `cls` | **`'ud'`** | UI ingredientes |
| `normalizeUnit` | `InventoryClient.tsx:41-50` | similar | **`ud`** | UI inventario |
| `normalizeUnit` | `IngredientEditModal.tsx:73-84` | similar | **`ud`** | modal edición |
| `normalizeWasteUnit` | `WasteClient.tsx:36-54` | incluye bandeja/bolsa/pieza | **propio** | mermas |
| `norm` | `ingredient-pack-pricing.ts:8-19` | g/kg/l/ml/ud | entrada tal cual | packs |
| `canonicalPurchaseUnit` | `albaran-price-match.ts:91-105` | incluye bote/piezas + remueve tildes | **`'kg'` SILENCIOSO** (H10) | matching albarán |

### 5.3 Implementaciones de conversión (8+)

| Nombre | Ubicación | Compatibilidad | Incluye puente per_pack | Trata fallo |
|---|---|---|---|---|
| `convertToPurchaseUnitQuantity` | `recipe-cost.ts:59-86` | masa/volumen/count | No | null |
| `convertToPurchaseUnitQuantityWithPackBridge` | `recipe-cost.ts:132-167` | igual + puente | Sí | `incompatible_units` vs `missing_price` |
| `convertPricingQtyNumeric` | `ingredient-pack-pricing.ts:170-192` | pack→unidad | Sí | 0? |
| SQL `convert_pricing_qty` | `20260513121500:4-58` | g↔kg, ml↔l↔cl, ud=ud | No | NULL |
| SQL `recipe_qty_to_purchase_unit_for_cost` | `20260513121500:63-122` | igual + puente per_pack | Sí | NULL |
| SQL `invoice_line_price_to_purchase_unit` | `20260515160700:11-36` | modo albarán | Sí (línea) | 0? |
| SQL `staff_consumption_qty_to_purchase_unit` | `20260512200000:11-75` | modo staff | Sí | error table |
| SQL `normalize_pricing_unit` | `20260415140000:25-47` | sintaxis | No | entrada? |

---

## 6. Problemas (gravedad ascendente)

| # | Categoría | Descripción | Etiqueta | Impacto económico/trazabilidad |
|---|---|---|---|---|
| P1 | **Falta de semántica** | 6 columnas unidad con 4 vocabularios (`u/ud/gr/kg/ml/l`) significan cosas solapadas pero no idénticas | VERIFICADO | Precios interpretados con unidad equivocada → food cost 1.957 % |
| P2 | **Fallback silencioso** | `canonicalPurchaseUnit` devuelve `kg` ante vacío/desconocido; BD devuelve coste `0` ante sin-conversión | VERIFICADO | Precio/escandallo aparentemente correcto (0€) sin alerta |
| P3 | **SSOT no único** | Stock: 2 escritores (trigger + RPC sin rastro). Precio: 3 escritores (trigger/manual/pack). Coste: 2 productores | VERIFICADO | Stock negativo sin causa rastreable; 1.162 precios históricos sin autor |
| P4 | **Divergencia real TS↔SQL** | Coste de línea incompatible: TS devuelve estado, BD devuelve 0. UI mezcla ambos | VERIFICADO | `recipes/[id]/page.tsx:580` usa RPC → línea sin conversión se ve como 0 € |
| P5 | **Relación por nombre** | `ingredients.supplier_id` es texto sin FK; JOIN por `suppliers.name = ingredients.supplier` | VERIFICADO | Cambio de nombre de proveedor = silencio |
| P6 | **Sin entorno de pruebas** (ARQUITECTURA §11) | Cada migración va a producción. No hay CI de tests. (D22) | VERIFICADO | Riesgo de migración irreversible |
| P7 | **Histórico sin autor** | `ingredient_price_history.changed_by` = NULL en 1.162 filas | HEREDADO | Imposible auditar |
| P8 | **Pedido→albarán desconexión** | `purchase_orders` genera PDF, no tiene relación con `purchase_invoices` que alimenta stock | VERIFICADO | No hay expectativa de recepción |
| P9 | **Stock negativo masivo** | 77 ingredientes <0 (ud 40, kg 24, l 7, u 6) | HEREDADO | Inventario no fuente de verdad |
| P10 | **OCR línea caótica** | `line_unit` en invoice_lines: 681 NULL, CJ/CAJA/caja/UNI/MAN/bolsa/CA… | HEREDADO | Solo fiable la tríada del mapping |

---

## 7. Modelo canónico (PROPUESTO)

### 7.1 Principios de diseño canónico

1. **Todo dato numérico con unidad referenciada.** No hay `numeric` suelto que signifique «cantidad» o «precio» sin FK a una unidad conocida.
2. **Observado ≠ maestro.** El OCR produce `observed_line`; la confirmación humana promueve a `transactional`.
3. **Ambigüedad explícita, no factor=1.** Si falta información, estado `AMBIGUOUS`/`REQUIRES_REVIEW`.
4. **Conversión = relación nombrada entre dos unidades.** Siempre `{from, to, factor, direction, dimension}`.
5. **Presentación = cómo se vende un producto.** No redefine la unidad física del maestro.
6. **Histórico inmutable por construcción.** Ningún update sobre `*_history`; solo INSERT.
7. **Stock = proyección agregada de movimientos.** `stock_current` es READ ONLY derivado; nadie lo escribe directamente.
8. **Un motor por capa (TypeScript y SQL), misma tabla de factores compartida y versionada.**

### 7.2 Diagrama de entidades

```
[UNIT_DIMENSION] 1──n [UNIT] 1──n [UNIT_CONVERSION] n──1 [UNIT]
                                         │
[PRODUCT] 1────n [PRODUCT_PRESENTATION] ─┘
      │              │
      │              └── supplier_product_presentation FK (por proveedor)
      │
      ├──n [PRODUCT_PRICE] (histórico + actual, con reference_unit_id)
      │
      └──n [SUPPLIER_PRODUCT] n──1 [SUPPLIER]
               │
               └──n [SUPPLIER_PRODUCT_PRESENTATION]
                           │
                           └── conversion a unidad de compra

[PURCHASE_INVOICE] 1──n [PURCHASE_INVOICE_LINE] (observed)
                           │ (mapeado)
                           ▼
[STOCK_MOVEMENT] 1──n [RECEPTION] (receipt)
    │
    ├── types: PURCHASE / SALE / WASTE / INVENTORY / ADJUSTMENT
    ├── quantity_qty + quantity_unit_id FK
    └── reference_doc + source_system

[RECIPE] 1──n [RECIPE_LINE] n──1 [PRODUCT]
                           │
                           └── quantity_qty + quantity_unit_id FK
                               + unit_cost EUR (from canonical price engine)
```

### 7.3 Datos maestros / transaccionales / derivados / observados / históricos

| Clase | Tablas/entidades | Política de escritura |
|---|---|---|
| **Maestros** | `unit_dimensions`, `units`, `unit_conversions`, `products`, `product_presentations`, `suppliers`, `supplier_products`, `supplier_product_presentations` | UI humano + aprobación; nadie más escribe |
| **Observados** | `ocr_extractions`, `purchase_invoice_lines.observed_*`, `ai_suggestions` | OCR/IA + APIs; nunca fuente de verdad; con `confidence_score` |
| **Transaccionales** | `purchase_invoices`, `purchase_invoice_lines.verified_*`, `purchase_orders`, `stock_movements`, `inventory_counts`, `waste_records`, `recipes`, `recipe_lines`, `tickets`, `ticket_lines` | Transacción confirmada por usuario o flujo |
| **Derivados** | `stock_current` (VIEW o proyección), `food_cost_pct`, `normalized_price`, `recipe_total_cost` | Motor único; nunca escritura manual; regenerable |
| **Históricos** | `product_price_history`, `unit_conversion_history`, `master_audit_log`, `ingredient_price_history` (legacy preserved) | INSERT-only; triggers automáticos |

---

## 8. SSOT (Single Source of Truth — PROPUESTO)

| Concepto | Dueño canónico | Escritor autorizado | Lectores | Formato del dato |
|---|---|---|---|---|
| Unidad física | `units.code` (ej: `kg`, `ml`, `ud`) | Maestro de datos (administrativo) | Todos | `id uuid + code text unique + dimension_id FK + symbol text + is_active bool` |
| Dimensión | `unit_dimensions.code` (ej: `mass`, `volume`, `count`) | Creado en migración, modificable solo con ADR | Todos | enumeración cerrada con CHECK |
| Conversión canónica | `unit_conversions(from_unit_id, to_unit_id, factor_numeric, is_approximate, valid_from, valid_to)` | Maestro de datos | Todos los motores de conversión | Tabla; INSERT-only versionada |
| Producto maestro | `products (id, name, slug, category, status, created_at)` | Gestión de ingredientes/carta | Todos | UUID identidad estable; N:M con proveedor |
| Unidad de compra de producto | `product_defaults.buy_unit_id` (FK a units) | Gestión ingredientes | Precios, compras, recepción, escandallo | Una por producto; invariable para precio |
| Unidad de stock de producto | `product_defaults.stock_unit_id` (FK a units) | Gestión ingredientes | Stock, inventario, mermas | Una por producto; puede coincidir con buy |
| Unidad de receta default | `product_defaults.recipe_unit_id` (FK a units) | Gestión ingredientes | UI recetas (default editable) | |
| Presentación comercial (producto) | `product_presentations (id, product_id, name, qty, unit_id, is_default)` | Gestión ingredientes | Pedidos, UI | ej: «Caja 24 ud» = 24 × ud |
| Presentación comercial (proveedor) | `supplier_product_presentations (supplier_product_id, presentation_id, billing_qty, billing_unit_id, content_qty, content_unit_id, price_list_eur)` | Gestión compras + learning | Precio albarán, matching | |
| Producto proveedor | `supplier_products(id, supplier_id FK, supplier_sku, supplier_name, product_id FK, status, confidence_score)` | Aprendizaje + confirmación | Matching OCR | PK uuid; FK a suppliers y products |
| Precio actual maestro | `product_prices` WHERE `is_current=true` (`product_id, buy_unit_id, price_eur, effective_from, source_type, source_doc_id, locked`) | Único motor de precio: albarán (verificado) o manual | Todos los consumidores de coste | `(product_id, buy_unit_id, effective_from)` unique |
| Precio normalizado | Derivado: `product_prices.price_eur` (ya está expresado en buy_unit_id por diseño) | Motor de precio | Recetas, mermas, consumo | No necesita calcularse; el precio maestro ya es €/buy_unit |
| Precio observado (OCR) | `purchase_invoice_lines.observed_total_eur / observed_qty / observed_billing_unit_text` | OCR/IA pipeline | Revisión humana, matching | Texto crudo; no FK |
| Precio de presentación (albarán) | `purchase_invoice_lines.verified_unit_price_eur / verified_billing_unit_id` (ej: €/caja) | Línea verificada | Historial de precios | Preservado tal cual factura |
| Histórico de precios | `product_price_history` (id, product_id, buy_unit_id, old_price, new_price, changed_by, changed_at, reason, source_doc) | Trigger automático | Auditoría | INSERT-only |
| Stock actual | `VIEW v_current_stock AS SELECT product_id, stock_unit_id, SUM(qty) FROM stock_movements GROUP BY product_id, stock_unit_id` | **Proyección.** Nadie escribe el valor | Inventario, pedidos, dashboard | Derivable; idempotente |
| Movimiento stock | `stock_movements(id, product_id, stock_unit_id, qty_signed, movement_type, occurred_at, reference_type, reference_id, created_by, processed_by, note, original_description, source_system)` | **UNICO WRITER:** servicio transaccional | Vistas y derivados | Tabla, auditada |
| Inventario físico | `inventory_counts(id, product_id, stock_unit_id, physical_qty, system_qty_before, diff_qty, counted_by, counted_at, attachment_id, status)` | Usuario inventario | Generador ADJUSTMENT | INSERT-only |
| Receta | `recipes(id, name, servings, sale_price_eur, has_half_ration, sale_price_half_eur, target_food_cost_pct, menu_category_id)` | Gestión recetas | Carta, escandallo, costes | |
| Línea de receta | `recipe_lines(id, recipe_id, product_id, quantity_qty, quantity_unit_id, quantity_half_qty, gross_or_net, waste_factor_pct, line_order)` | Gestión recetas | Escandallo | Unidad FK obligatoria; nunca NULL |
| Coste de línea de receta | **DERIVADO** `recipe_line_cost_qty_buy = convert(quantity_qty, quantity_unit_id, buy_unit_id); cost = recipe_line_cost_qty_buy * current_price_eur` | Único motor canónico de coste | UI receta, análisis | VIEW / columna derivada |
| Ingrediente OCR mapeado | `ocr_product_matches(id, ocr_line_id, supplier_product_id, match_score, is_ambiguous, selected_by_user)` | Matching engine + usuario | Pipeline de albarán | Estado `MATCHED / AMBIGUOUS / REVIEW / UNMATCHED` |

---

## 9. Producto (PROPUESTO)

### 9.1 Identidad

`products.id` = UUID, estable por diseño.

`ingredients.id` actual (UUID) se preserva y migra como `products.id = ingredients.id`. Sin reidentificación para mantener trazabilidad.

### 9.2 Atributos

| Atributo | Tipo | ¿Puede NULL? | Invariante |
|---|---|---|---|
| `id` | uuid | No | PK |
| `name` | text | No | Único por categoría o similar |
| `slug` | text | No | Derivado; URL-safe |
| `description` | text | Sí | |
| `category_id` | uuid FK | Sí | Hacia `categories` (se mantiene tabla) |
| `status` | enum (draft, active, archived) | No | Por defecto `active` |
| `is_food` | bool | No | Permite filtrar inventario/consumo |
| `has_stock_tracking` | bool | No | Falso = gasto no inventariable |
| `recommended_stock_qty` | numeric | Sí | Con `recommended_stock_unit_id` FK |
| `default_buy_unit_id` | uuid FK units | No | Invariante SSOT de precio |
| `default_stock_unit_id` | uuid FK units | No | Invariante SSOT de stock |
| `default_recipe_unit_id` | uuid FK units | No | Default UI |
| `default_order_presentation_id` | uuid FK product_presentations | Sí | Default pedido |
| `current_price_locked` | bool | No | Hereda `price_locked` |
| `waste_pct_applicable` | numeric | Sí | Campo nuevo (no muerto), aplica cuando recipe line especifica |
| `legacy_ingredient_id` | uuid | Sí | = `id` (autoref para backcompat) |

### 9.3 Relaciones

- products 1──n product_presentations
- products 1──n product_defaults (o columnas planas en products como arriba)
- products n──m supplier_products
- products 1──n recipe_lines
- products 1──n stock_movements
- products 1──n product_prices
- products n──1 categories

### 9.4 Quién escribe / lee

- **Escribe:** Gestión ingredientes UI (`/ingredients`, `IngredientWizard`, `IngredientEditModal`) → servidor actions.
- **Lee:** Todo el sistema: recetas, compras, stock, inventario, análisis, carta pública.

### 9.5 Datos derivados

- `v_product_with_current_price` = JOIN products + product_prices (is_current=true)
- `v_product_summary` = JOIN products + stock actual + última recepción + food cost promedio

### 9.6 Invariantes

1. `default_buy_unit_id` y `default_stock_unit_id` no pueden ser NULL para productos con `has_stock_tracking = true`.
2. Dos unidades por producto (buy y stock) deben compartir dimensión o existir conversión puente en product_presentations.
3. Producto maestro independiente de proveedor: `products.name` no menciona «Coca-Cola 24 ud» — esa es presentación.
4. Un producto archivado no aparece en nuevas líneas de receta/albarán; líneas históricas conservan nombre snapshot.

---

## 10. Unidades (PROPUESTO)

### 10.1 UNIT DIMENSION — enumeración cerrada

`unit_dimensions` con `CHECK (code IN ('mass', 'volume', 'count', 'length', 'area', 'custom'))`.

Solo 3 dimensiones se usan activamente en producción hoy: `mass`, `volume`, `count`. Las demás se reservan para extensibilidad sin usarlas.

### 10.2 UNIT canónica

| Atributo | Tipo | Invariante |
|---|---|---|
| `id` | uuid | PK |
| `code` | text | ÚNICO, ej `kg`, `g`, `l`, `ml`, `cl`, `ud`, `caja`, `pack`, `botella`, `saco`, `bandeja`, `bolsa`, `pieza`. CHECK `^[a-z_]+$` |
| `dimension_id` | uuid FK | Obligatorio. Caja/pack/etc → dimensión `count` o `custom`; pero: **OJO**. Ver §10.3 |
| `name_es` | text | Nombre visible (ej: kilogramo) |
| `symbol` | text | Ej: kg, ml, ud |
| `is_base` | bool | Verdadero para `kg`, `l`, `ud`. Unidades base de cada dimensión |
| `si_scale` | numeric NULL | Factor hacia la base. `g` tiene 0.001, `mg` 0.000001. `ud` tiene 1.0 |
| `is_active` | bool | Por defecto true |

### 10.3 Dimensión COUNT vs PRESENTACIÓN (distinción crítica)

Clave conceptual del modelo canónico:

- **`ud` (unidad) es dimensión `count`**. Representa una pieza atómica indivisible desde el punto de vista de stock/receta.
- **«Caja» / «pack» / «saco» / «botella» NO son unidades primarias de dimensión COUNT.** Son presentaciones (ver §11). No viven en `units` como entidades canónicas de conversión de dimensión, sino como registros de `product_presentations` que encapsulan:
  - `presentation_kind` (caja, pack, saco, botella, bandeja, bolsa, pieza…)
  - `contains_qty` (cuántas)
  - `contains_unit_id` (de qué: ud, g, kg, ml, l…)

**Razón:** Una caja de Coca-Cola no equivale dimensionalmente a una caja de leche ni a una caja de huevos. La conversión «caja ↔ ud» no es global. Caja es una presentación *de un producto concreto*, no una unidad de dimensión universal.

Este es el error conceptual actual: `order_unit = 'caja'` 59 veces en `ingredients.order_unit`, y 59 significados distintos.

Unidades del COUNT canónico (unívocas, semántica global): `ud` (y en un futuro `docena` si fuera necesario). Todo lo demás es presentación.

### 10.4 Mapa de migración unidades actual → canónica

| Unidad actual | Columnas que la usan | Valor actual N | Destino | Migración |
|---|---|---|---|---|
| `ud` | purchase_unit, unit, recipe_unit, unit_type | 87/118/117/87 | `units.code = 'ud'`, `dimension = count` | A (automática) |
| `kg` | purchase_unit, unit_type | 79/57 | `units.code = 'kg'`, `dimension = mass`, base=true | A |
| `g` | unit, recipe_unit | 79/4 | `units.code = 'g'`, si_scale=0.001 | A |
| `gr` | unit_type | 22 | → `g` (normalización) | A |
| `l` | purchase_unit, unit, recipe_unit, unit_type | 29/29/28/26 | `units.code = 'l'`, base=true, volume | A |
| `ml` | unit, recipe_unit, unit_type | 29/7/3 | `units.code = 'ml'`, si_scale=0.001 | A |
| `cl` | (UI recetas y última actualización SQL) | presente en código no en 226 | `units.code = 'cl'`, si_scale=0.01 | A |
| `u` | purchase_unit, unit_type, recipe_lines | 31/30/9 | → `ud` (normalización legacy) | B (transformación determinista; auditar antes por si alguna significa otra cosa; dado el contexto bar-restaurant, alta probabilidad que sí) |
| `unitat` | unit_type | 1 | → `ud` | B |
| `unidad` | order_unit | 92 | → PRESENTACIÓN (order_presentation_id, tipo `pieza`) | C? No; `unidad`= 1 ud → se asigna `default_order_presentation_id` al registro de presentación «1 ud» qty=1 ud | B |
| `caja` | order_unit | 59 | → PRESENTACIÓN (order_presentation_id, tipo=`caja`). Contenido `caja_24_uds` etc. requiere mapeo | C (revisión humana para contenido de cada caja); mapeo desde `ingredients.pack_units + pack_unit_size_unit` cuando exista |
| `pack` | order_unit | 51 | → PRESENTACIÓN tipo `pack` | C |
| `pieza` | order_unit | 6 | → PRESENTACIÓN tipo `pieza` qty=1 | B |
| `lt` | order_unit | (pocos) | → `l` | A |

### 10.5 Invariantes de UNIT

1. Toda cantidad en una tabla transaccional/maestra tiene `*_unit_id` FK NOT NULL (o `*_unit_code` CHECK).
2. Unidades de `mass`/`volume` tienen `si_scale` no NULL.
3. `ud` tiene dimensión `count` y no tiene escala SI (1 ud = 1 ud por construcción).
4. Código único + nombre visible único en español.

---

## 11. Presentaciones (PROPUESTO)

### 11.1 PRODUCT_PRESENTATION

Qué es una presentación: forma de agrupar/comercializar **un producto concreto**, con una descripción y un contenido conocido.

Atributos:

| Atributo | Tipo | Invariante |
|---|---|---|
| `id` | uuid | PK |
| `product_id` | uuid FK products | NOT NULL |
| `presentation_kind` | enum (caja, pack, saco, botella, bandeja, bolsa, pieza, garrafa, lata, brick, otro) | NOT NULL. Visible en UI |
| `display_name` | text | Generado o manual. Ej: «Caja 24 ud», «Saco 5 kg», «Pack 6×1 L» |
| `contains_qty` | numeric | NOT NULL. cuánto contiene la presentación |
| `contains_unit_id` | uuid FK units | NOT NULL. en qué unidad está `contains_qty` |
| `ean_or_sku` | text NULL | |
| `weight_g` | numeric NULL | Peso bruto |
| `is_default_for_order` | bool | Un solo TRUE por producto |
| `is_default_for_supplier_receipt` | bool NULL | |
| `dimensions` | jsonb NULL | |

### 11.2 Casos reales (modelado canónico)

#### 11.2.1 Coca-Cola

HEREDADO + PROPUESTO

- **Producto maestro:** Refresco de cola (Coca-Cola convencional)
  - `default_buy_unit_id = ud` (unidad de lata/botella individual)
  - `default_stock_unit_id = ud`
  - `default_recipe_unit_id = ud`
- **Presentación:** `Caja 24 ud`
  - `kind = caja`
  - `display_name = 'Caja 24 ud'`
  - `contains_qty = 24`
  - `contains_unit_id = ud`

#### 11.2.2 Leche

HEREDADO + PROPUESTO

- **Producto maestro:** Leche (vaca/avena/normal/semidescremada — SKU separados si compran separado)
  - `buy_unit = l` (€/L, homogéneo para receta que use ml/l)
  - `stock_unit = l` (1 botella 1 L = 1 L en stock; o ud si se cuenta por botella — decisión producto)
  - `recipe_unit = ml`
- **Presentación:** `Pack 6 × 1 L`
  - `kind = pack`
  - `contains_qty = 6`
  - `contains_unit_id = ud` (6 unidades)
  - **pero además** la propia unidad contiene 1 L → la presentación puede relacionarse con otra conversión:
    - Alternativa: `contains_qty = 6`, `contains_unit_id = ud`; y cada unidad-ud se conoce que es 1000 ml mediante la *unidad* de producto o una conversión puente en producto. La compra usa presentación (6 ud × 1 ud).
    - Precio albarán: «Pack 6 L a 9,60 €» = 9,60 € / presentación = 1,60 €/L = precio normalizado buy_unit `l`. ✓

#### 11.2.3 Harina

PROPUESTO

- **Producto maestro:** Harina de trigo / fuerza / repostería
  - `buy_unit = kg`; `stock_unit = kg`; `recipe_unit = g`
- **Presentación:** `Saco 5 kg`
  - `kind = saco`; `contains_qty = 5`; `contains_unit_id = kg`
- **Precio compra:** 1 saco × 4,50 €/saco → normalizado 0,90 €/kg

#### 11.2.4 Huevos

PROPUESTO

- **Producto maestro:** Huevos (M/L/XL, blanco/marron)
  - `buy_unit = ud`; `stock_unit = ud`; `recipe_unit = ud`
- **Presentación:** `Caja 30 ud`
  - `kind = caja`; `contains_qty = 30`; `contains_unit_id = ud`
- **Precio compra:** 1 caja × 5,40 €/caja → 0,18 €/ud

#### 11.2.5 Frankfurt

HEREDADO (case §G auditoría): Frankfurt pack 12,49 € / 16 ud × 12 ud → 192 ud reales vs 16

PROPUESTO: El mapeo actual (16 ud con contenido 12 ud cada una) es incorrecto. La presentación real es Caja 192 ud o Caja 16 packs × 12 ud. Es **C (revisión humana)**, no se puede auto-migrar.

### 11.3 SUPPLIER_PRODUCT_PRESENTATION

Además de `product_presentations` (genéricas), cada proveedor puede tener su propia forma de facturar la misma presentación.

| Atributo | Tipo | Nota |
|---|---|---|
| `supplier_product_id` | uuid FK | Relación supplier_products → supplier |
| `product_presentation_id` | uuid FK | Apunta a presentación genérica si aplica |
| `supplier_presentation_name` | text | Nombre que usa el proveedor |
| `billing_qty` | numeric | Cantidad facturable: ej: 1 (caja) |
| `billing_unit_text_or_id` | mixto | Lo que lee OCR |
| `content_total_qty` | numeric | Equivalente total en unidad base del producto. Ej: 1 caja = 24 ud, content_total = 24 |
| `content_total_unit_id` | uuid FK | `ud` |
| `list_price_eur` | numeric NULL | Precio catálogo |
| `last_seen_at` | timestamptz | |

---

## 12. Conversiones (PROPUESTO)

### 12.1 Eliminar `conversion_factor` como número aislado

Hoy `supplier_item_mappings.conversion_factor` es un solo número. Su significado es:

```
precio albarán / conversion_factor = € / buy_unit
```

Pero nadie sabe (sin leer el código del trigger) si el factor aplica a cantidad o a precio, ni su dirección.

Modelo canónico: **toda conversión es `[from] --(factor / bidireccional?)--> [to]`**.

### 12.2 `unit_conversions` tabla canónica

| Atributo | Tipo | Invariante |
|---|---|---|
| `id` | uuid | PK |
| `from_unit_id` | uuid FK units | NOT NULL |
| `to_unit_id` | uuid FK units | NOT NULL |
| `factor_numeric` | numeric (30,15) | NOT NULL. Significado: `1 from_unit = factor_numeric to_unit` |
| `direction` | enum (`forward`, `bidirectional`) | bidireccional para SI (kg-g); forward solo si no es reversible |
| `is_approximate` | bool | False por defecto. Conversiones exactas son obligatorias para precio |
| `conversion_type` | enum (`si_prefix`, `dimensional_bridge_via_presentation`, `custom_exact`, `custom_approx`) | |
| `scope_product_id` | uuid FK NULL | Si está relleno: conversión válida SOLO para este producto. Ej: 1 ud colacao = 760 g (válido solo para ColaCao, no universal) |
| `scope_supplier_id` | uuid FK NULL | |
| `scope_presentation_id` | uuid FK NULL | |
| `valid_from` | timestamptz | NOW() por defecto |
| `valid_to` | timestamptz NULL | NULL = vigente |
| `created_by` | uuid perfiles | Auditoría |
| `reason_code` | text | |

**Unicity constraint:**
- SI-prefix: `UNIQUE (from_unit_id, to_unit_id, scope_product_id NULLS NOT DISTINCT, scope_supplier_id NULLS NOT DISTINCT, valid_to NULL)`.

### 12.3 Distinción: conversión de CANTIDAD vs conversión de PRECIO

| Tipo | Significado | Usa tabla |
|---|---|---|
| Conversión cantidad | `qty_A × factor = qty_B` | unit_conversions (aplicable si misma dimensión o scope_product bridge) |
| Conversión precio | `€/A × conversion(qty: A→B)^{-1} = €/B` | MISMA tabla. Fórmula: `€ / buy_unit = (€ / billing_presentation_qty) / content_total_in_buy_unit` |

**Ejemplo Coca-Cola:**
- Presentación «caja» → 1 caja = 24 ud (unit_conversions, scope_presentation_id = coca-cola-caja-24uds)
- Precio observado: 20 € / caja (€/presentation_unit)
- Precio normalizado (€/ud, buy_unit): `20 € / 24 ud = 0,833333 €/ud`

**Ejemplo sin unidad (AMBIGUO):**
- Dato OCR: «20 €» sin mencionar unidad → ESTADO `REQUIRES_REVIEW`, no factor=1.

### 12.4 Conversiones iniciales (migración A — automática)

Todas dentro de misma dimensión, exactas:

- Masa: `g ↔ kg` (1000), `mg ↔ g` (1000)
- Volumen: `ml ↔ l` (1000), `cl ↔ l` (100), `cl ↔ ml` (10)
- Count: `ud ↔ ud` (1, identidad)

Conversiones PUENTE por producto (extraídas hoy de `ingredients.pack_*`):

- `ingredients.supplier_pricing_mode = 'per_pack'` AND `pack_unit_size_qty IS NOT NULL` →
  → crear `unit_conversions` con `scope_product_id`, `from=ud`, `to=buy_unit`, `factor = pack_unit_size_qty IF pack_unit_size_unit matches buy dimension`.

Estado actual: **PROPUESTO; la tabla y su population se diseñan en fase K5.**

---

## 13. Precios (PROPUESTO)

### 13.1 Taxonomía formal de precios

| Tipo de precio | Definición canónica | Tabla/columna destino | Unidad de referencia obligatoria |
|---|---|---|---|
| **OBSERVED PRICE** | Lo que ve OCR/IA en el papel. Texto crudo + confianza | `purchase_invoice_lines.observed_unit_price_eur, observed_total_eur, observed_billing_text` | No (dato observado) |
| **PRESENTATION PRICE** | Precio por presentación del proveedor, *verificado* por usuario | `purchase_invoice_lines.verified_presentation_price_eur` | `verified_billing_presentation_id` o `verified_billing_unit_id` |
| **PURCHASE PRICE (línea)** | Coste total verificado de la línea | `purchase_invoice_lines.verified_total_eur` | EUR (total) |
| **NORMALIZED PRICE** | Precio expresado en la buy_unit del producto (€/kg, €/L, €/ud) | `product_prices.price_eur WHERE is_current = true` | `product_prices.reference_buy_unit_id` FK |
| **CURRENT MASTER PRICE** = NORMALIZED PRICE actual | Igual, con estado «actual» | `v_product_current_price` (VIEW) | buy_unit canónica |
| **HISTORICAL PRICE** | Snapshots de normalized price con vigencia | `product_price_history` | reference_buy_unit_id snapshot |
| **SUPPLIER LIST PRICE** | Precio de catálogo proveedor, informativo | `supplier_product_presentations.list_price_eur` | billing presentation |

### 13.2 `product_prices` — tabla canónica de precio maestro

| Atributo | Tipo | Invariante |
|---|---|---|
| `id` | uuid | PK |
| `product_id` | uuid FK | NOT NULL |
| `reference_buy_unit_id` | uuid FK units | NOT NULL. Debe coincidir con `products.default_buy_unit_id` (CHECK via trigger) |
| `price_eur` | numeric | NOT NULL, >0 |
| `is_current` | bool | Exactamente 1 TRUE por (product_id, reference_buy_unit_id) |
| `effective_from` | timestamptz | NOT NULL |
| `effective_to` | timestamptz NULL | NULL = vigente |
| `source_type` | enum (`albaran_verified`, `manual_entry`, `supplier_list`, `import_legacy`, `review_adjustment`) | NOT NULL |
| `source_doc_ref` | text UUID NULL | `purchase_invoice_lines.id` or manual |
| `locked_by_user_id` | uuid NULL | Precio bloqueado |
| `locked_reason` | text NULL | |
| `computation_log` | jsonb NULL | Traza de cómo se obtuvo: factor, presentación usada, usuario |

### 13.3 `product_price_history` (trigger INSERT-only)

Trigger `trg_product_prices_history` BEFORE UPDATE on product_prices: inserta fila anterior + `changed_at`, `changed_by`, `reason` into history.

### 13.4 Reglas de actualización

1. Un albarán verificado **solo** propone candidato a normalized price. La aplicación efectiva depende de:
   - existir `mapped_product_id` (MATCHED)
   - existir `verified_billing_presentation_id` + contenido
   - conversión de cantidad es `is_approximate = false`
   - `locked_by_user_id` es NULL
2. Si alguna condición falla: línea de albarán en estado `PRICE_REVIEW_REQUIRED`. No se actualiza precio. **Nunca factor=1 fallback.**
3. Normalización exacta:

```
normalized_price_eur (€/buy_unit) =
  presentation_price_eur
  / convert_qty(presentation_qty, presentation_unit → buy_unit, context:invoice_line)
```

### 13.5 Preservación del histórico

NUNCA se sobrescribe `ingredient_price_history` legacy. Se migra como referencia pero la fuente viva pasa a ser `product_price_history`. Ambos coexistirán al menos 6 meses hasta validación.

---

## 14. Proveedores (PROPUESTO)

### 14.1 `suppliers` (se mantiene, añadir PK)

Tabla `suppliers` actual ya tiene `id(bigint)` + `name` + 18 filas. Se promueve id a uuid en migración (o bien se mantiene bigint con nueva columna `uuid` para joins uniformes). PENDIENTE: decidir bigint vs uuid.

### 14.2 `supplier_products` — N:M real con FK

Hoy la relación es `ingredients.supplier` (texto) = `suppliers.name`. Esto es P5.

Tabla nueva:

| Atributo | Tipo | |
|---|---|---|
| `id` | uuid | PK |
| `supplier_id` | bigint/uuid FK suppliers | NOT NULL |
| `product_id` | uuid FK products | NOT NULL |
| `supplier_sku` | text | |
| `supplier_item_display_name` | text | Nombre «Naranja Postre» |
| `status` | enum (`active`, `inactive`, `proposed`) | |
| `confidence` | numeric [0,1] | Del matching engine |
| `first_seen_at` | tstz | |
| `last_seen_at` | tstz | |
| `last_verified_price_eur` | numeric NULL | |
| `last_verified_price_at` | tstz NULL | |

### 14.3 Migración

- De `supplier_item_mappings` (tríada + conversion_factor, nombre, supplier_id):
  - cada fila → candidato `supplier_products(supplier_id, product_id=ingredient_id, supplier_item_display_name=supplier_item_name, status=active, confidence=1.0 si manual)`
  - `conversion_factor + line_billing_unit + line_content_qty + line_content_unit` → `supplier_product_presentations` (§11.3)
- De `ingredients.supplier, supplier_2`:
  - buscar `suppliers` por name; si existe → upsert `supplier_products` status=active si no existe

---

## 15. Compras (PROPUESTO)

### 15.1 Conceptos claros

> **Pedido** = lo que se solicita. **No entra en stock ni en precio.** (Confirmación VERIFICADO hoy: no entra.)
>
> **Compra (Albarán)** = lo que se compró según documento. Entra en flujo de verificación.

### 15.2 Pedido

`purchase_orders` y `purchase_order_items` se mantienen pero se mejora:

- `purchase_order_items.unit_id` FK (hoy `unit` texto)
- `purchase_order_items.presentation_id` FK opcional (si se pide por caja)
- `purchase_order_items.expected_price_eur` (no cero; hoy `unit_price = 0` en todos)
- `purchase_order_items.received_qty` contrapartida con recepción

### 15.3 Albarán

`purchase_invoices`, `purchase_invoice_lines` se mantienen con división observado/verificado:

- observado (OCR): `observed_quantity`, `observed_billing_unit_text`, `observed_unit_price_eur`, `observed_total_eur`, `ocr_confidence`
- verificado (usuario): `verified_quantity`, `verified_billing_presentation_id`, `verified_unit_price_eur`, `verified_total_eur`, `mapped_supplier_product_id`, `match_status` (UNMATCHED/MATCHED/AMBIGUOUS/REVIEW)
- referencia a pedido (opcional): `purchase_order_id` FK

### 15.4 Línea de albarán: flujo VERIFICADO → stock/precio

```
línea verified OK + mapped_supplier_product_id OK
  ├─► stock_movement (PURCHASE): qty = convert(presentation_qty → stock_unit_id)
  │                               source_doc = invoice_line_id
  │
  └─► candidato normalized_price:
       IF (price NOT locked) AND (conversion exacta) AND (diferencia > 1e-5 vs actual):
         INSERT nueva product_price + history
```

---

## 16. Recepción (PROPUESTO)

Hoy la recepción es implícita. Modelo canónico:

### 16.1 `receptions` (entidad nueva)

| Atributo | Tipo |
|---|---|
| `id` | uuid |
| `purchase_invoice_id` | uuid FK |
| `received_at` | tstz |
| `received_by` | uuid FK perfiles |
| `total_packages_count` | int |
| `condition` | enum |
| `attachments` | jsonb fotos |
| `notes` | text |

### 16.2 `reception_lines`

Por cada línea del albarán:
- producto, presentación recibida, cantidad recibida, unidad
- diferencia vs lo pedido (si hay pedido asociado)
- **Una recepción CONFIRMADA genera los movimientos PURCHASE, no el trigger de inserción albarán.**

Hoy el trigger `handle_new_invoice_line` genera stock al insertar línea. En modelo futuro, ese paso pasa a ser explícito en recepción. Esto evita stock de albaranes en borrador.

**Compatibilidad:** Durante transición coexisten ambos caminos con feature flag (§30).

---

## 17. Stock (PROPUESTO)

### 17.1 Principios

1. `stock_current` es una **proyección** de `stock_movements`. Nadie lo escribe.
2. Todo cambio de stock tiene `stock_movements` (incluye el copiloto).
3. Unidades mediante FK.

### 17.2 `stock_movements` — tabla canónica única

Migrar y extender la actual:

| Atributo actual (181.560 filas) | Nuevo | Cambio |
|---|---|---|
| `ingredient_id` | `product_id` FK | rename + FK constraint |
| `quantity` (signed implicit by type?) | `qty_signed numeric` | Signo: + entrada, − salida |
| `unit` text | `stock_unit_id` FK units | |
| `unit_price` | `unit_cost_eur_at_move_time` | Copia snapshot del normalized_price; no es SSOT pero sí auditoría |
| `total_amount` | `total_cost_eur` | |
| `movement_type` | `movement_type` CHECK (PURCHASE, SALE, WASTE, INVENTORY_COUNT, ADJUSTMENT, CONSUMPTION_STAFF, RECEPTION_CORRECTION, INITIAL_LOAD, TRANSFER_IN, TRANSFER_OUT) | Ampliado |
| `movement_date` | `occurred_at` | |
| `reference_doc` | `(reference_type, reference_id)` (tuple) | |
| `original_description` | se preserva | |
| `notes` | se preserva | |
| `processed_by` | se preserva | |
| `product_snapshot_name` (nuevo) | | Nombre snapshot para que archivado no pierda trazabilidad |
| `unit_snapshot_code` (nuevo) | | Snapshot unit code |
| `source_system` | enum (legacy_trigger, legacy_copilot_update, legacy_manual, canonical_writer, ocr_pipeline, tpv_deduction, user_inventory, user_waste, staff_consumption_app) | Obligatorio para diagnóstico |

### 17.3 Vista `v_current_stock`

```sql
CREATE VIEW v_current_stock AS
SELECT product_id,
       stock_unit_id,
       COALESCE(SUM(qty_signed), 0)            AS current_qty,
       MIN(occurred_at)                        AS first_movement_at,
       MAX(occurred_at)                        AS last_movement_at,
       COUNT(*) FILTER (WHERE qty_signed > 0)  AS n_purchases,
       COUNT(*) FILTER (WHERE qty_signed < 0)  AS n_consumptions
FROM stock_movements
GROUP BY product_id, stock_unit_id;
```

### 17.4 Migración del stock actual (HEREDADO, P9, 77 negativos)

- Fase K8: `ingredients.stock_current` vs `v_current_stock` reconciliación.
- Si difieren: añadir movimiento `ADJUSTMENT` con `reference_type='K8_RECONCILIATION'` y nota.
- Los 77 negativos son **C (revisión humana)** para decidir si son mermas, errores de mapeo, o ajustes aceptados. No se «corrigen a cero» sin explicación.
- RPC `actualizar_stock` (§3): se retira en K5, sustituido por una función equivalente que ESCRIBE movimiento (proyección se actualiza sola).

---

## 18. Inventario (PROPUESTO)

### 18.1 Flujo

```
Usuario inicia inventario → inventario id + fecha
  ├─► Por cada producto:
  │      lectura física (qty + unidad)
  │      foto opcional
  │      confirmación usuario
  │
  └─► Cierre:
       system_qty_before = v_current_stock
       diff = physical_qty − system_qty_before
       INSERT 1 movimiento ADJUSTMENT por producto con diff
       REFERENCE = inventory_count.id
```

### 18.2 `inventory_counts`

| Atributo | Tipo |
|---|---|
| `id` | uuid |
| `inventory_session_id` | uuid FK |
| `product_id` | uuid FK |
| `stock_unit_id` | uuid FK |
| `physical_qty` | numeric |
| `system_qty_before` | numeric snapshot |
| `diff_qty` | numeric |
| `counted_by` | uuid |
| `counted_at` | tstz |
| `attachment_id` | uuid storage |
| `status` | enum |
| `notes` | text |
| `adjustment_movement_id` | uuid FK stock_movements |

### 18.3 Invariantes

1. `physical_qty >= 0` (una cuenta física no es negativa).
2. Cierre de inventario genera movimiento cuyo diff + system_before == physical (check).
3. No existe UPDATE de stock directo; todo pasa por ADJUSTMENT.

---

## 19. Ventas (PROPUESTO)

### 19.1 Flujo actual (VERIFICADO)

Webhook BDP → `process_ticket_stock_deduction` → 176.780 movimientos SALE con unidades de receta.

### 19.2 Cambio canónico

1. Línea de venta: `ticket_lines_marbella` mapea `map_tpv_receta.articulo_id → recipe_id`.
2. Cada recipe_line de recipe consume `quantity_gross × factor_porción` del producto en `recipe_unit_id`.
3. Conversión canónica: `recipe_quantity_in_buy_unit = convert(qty, recipe_unit_id → buy_unit_id)` vía unidad canónica.
4. **Movimiento SALE** se registra en `stock_unit_id` del producto, tras convertir la cantidad de la línea (receta) a stock.
5. Si la conversión no está disponible: `CONSUMPTION_FAILED` log (similar a `staff_consumption_register_errors` hoy), **no se resta cero ni se descuenta sin convertir**.

### 19.3 Impacto inmediato

Esto es lo que corrige la causa del stock negativo masivo (P1 + P9): las 176.780 salidas de hoy usan unidades de receta sin puente cuando compras entraron en unidades de presentación distintas. Con convert canónico + estado explícito, las incompatibilidades saltan a revisión en lugar de descontar ciegas.

---

## 20. Recetas (PROPUESTO)

### 20.1 `recipe_lines`

Migrar de `recipe_ingredients` a `recipe_lines` (renombrado semántico):

| Atributo actual | Destino | Cambio |
|---|---|---|
| `quantity_gross` | `quantity_qty` numeric | Not NULL |
| `unit` texto | `quantity_unit_id` FK units | Unidad canónica; CHECK dimension compatible |
| `quantity_net` | `waste_factor_pct` numeric NULL | En lugar de 2 columnas, `net = gross × (1 - waste_pct/100)` |
| `quantity_half` | `quantity_half_qty` numeric NULL | |
| `umb_multiplier` | `yield_factor` numeric DEFAULT 1 | Renombrado claro |
| NUEVO | `line_order` int | Orden de la línea |
| NUEVO | `note` text | |

### 20.2 Invariantes de línea

1. `quantity_unit_id` no NULL.
2. Dimensión de `quantity_unit_id` debe ser compatible con buy_unit del producto vía unit_conversions (posiblemente scope=product). Si no → la línea en estado `INCOMPATIBLE_UNITS`.
3. Waste factor rango [0, 100).
4. Medio racón válida solo si recipe lo soporta (`has_half_ration = true` en recipes).

---

## 21. Escandallos (PROPUESTO)

### 21.1 Motor de coste único

Un único motor por capa (TypeScript + SQL) con la **misma** definición (D21, paridad forzada):

```
line_cost_eur =
  convert(
    quantity = gross_qty × (1 - waste_pct/100) × yield_factor × (half ? half_ratio : 1),
    from = quantity_unit_id,
    to = product.buy_unit_id,
    scope = product_id
  )
  × product.current_price_eur
```

Estado por línea (propagado hasta UI):
- `OK (coste_eur)`
- `MISSING_PRICE` (precio actual NULL o 0 sin lock)
- `INCOMPATIBLE_UNITS` (no hay conversión)
- `AMBIGUOUS_CONVERSION` (factor approximate, conversión múltiple sin preferencia clara)

**La BD NO DEVUELVE 0.** Devuelve JSON con estado por línea (coincidente con TS ya existente).

### 21.2 Corrección de F2

`recipes/[id]/page.tsx:580` hoy usa RPC `get_recipe_cost` que devuelve 0. Se sustituye por un VIEW `v_recipe_cost_exploded` o RPC que devuelve `{total_eur, total_with_status, lines: [{status, line_cost_eur, note, ...}]}`. UI pinta `—` con badge de estado, no `0,00 €`.

### 21.3 Casos extremos

- **Oreo Helado:** food cost 1.957 % → causa raíz: precio actual Oreo = 51,6 €/ud en lugar de 51,6/24 = 2,15 €/ud. Modelo canónico: el precio del albarán entra como PRESENTATION PRICE (caja 24 ud × 51,6 €) → normalized price por buy_unit = ud → (51,6 / 24) = 2,15 €/ud. El escandallo Oreo Helado (1 ud = 2,15 €) vs venta 2,90 € → food cost ≈ 74 %. Razón.
- **Pirulo:** similar, precio de caja como unitario.
- **39 recetas sale_price=0:** estado NOT_PRICED visible en UI, no food cost 0%.

---

## 22. Datos corruptos

Clasificación A/B/C/D (PROPOSED classification, aplicar en K8):

| Categoría | Casos | Clase | Acción en migración |
|---|---|---|---|
| Vocabulario `u` → `ud` | purchase_unit, unit_type, recipe_lines, recipe_unit | B (transformación determinista tras auditoría que confirma) | Script de update transaccional; backup; reporte |
| Vocabulario `gr` → `g` o `kg` según contexto | unit_type 22 filas | B (gr → g; unit_type debe coincidir purchase_unit después) | Same |
| `unitat` → `ud` | 1 fila | B | Simple |
| Caja/Pack como order_unit SIN contenido (sin pack_units) | 59 caja + 51 pack, algunos no tienen `pack_*` poblado | C (revisión humana) | Marcar con estado ORDER_PRESENTATION_UNKNOWN; no asumir 24 ud |
| Caja/Pack como order_unit CON contenido (coherente con pack_*) | Los que sí tienen pack_units+pack_unit | B (auto) | Crear product_presentations desde pack_* |
| `waste_percentage` distinto de cero | Muy pocos (poblado solo en formularios, no en lógica) | C | Revisar y aplicar si el usuario confirma; si no, descartar (era campo muerto); PRESERVE |
| 77 ingredientes stock_negativo | Limón, Sal, Vasos 350 ml, etc. (HEREDADO) | C | K8 reconciliación; cada uno genera ADJUSTMENT + revisor asignado |
| `get_recipe_cost` = 0 en líneas incompatibles | N recetas (recalcular con BD nueva) | A (automático display) | UI nuevo; no tocar datos |
| 5 recetas food cost > 300 % | Oreo, Pirulo, Tropical, Sangría | C | Precios revisados manualmente; mapping albarán confirmado |
| Precios 0€ con pack_mode (Cava mix) | pack_price 0 → current_price 0 | B + humano | Requiere dato del proveedor o asignar manual; no inventar |
| `ingredients.supplier_id` texto sin FK vs supplier.name | 226 | A (lookup por nombre) + fallback C | Migrar a supplier_products; Nombres no encontrados → REVIEW |
| `supplier_item_mappings` sin ORDER BY estable | 226 | A | Añadir created_at DESC + is_verified DESC; PK único para selección determinista |
| `ingredient_price_history.changed_by` NULL 1.162 | Histórico | D (PRESERVE HISTORICAL) | Mantener en legacy; nuevas filas con autor |
| `purchase_order_items.unit_price = 0` | Todos | B (mantener) + C (asignar) | No romper histórico futuro; nuevas filas con precio estimado |
| `line_unit` OCR (CJ/CAJA/caja/UNI/681 NULL) | Invoice_lines | D (irrecuperable como dato unitario limpio; USABLE como observado) | Mantener como observed_billing_text; NO usarlo para nada excepto OCR-matching |
| `line_content_qty/unit` en mappings si existe | OK mappings confirmados | A | Usar |
| `bdp_articulos.coste=0` (194) | Tabla externa | D (irrelevante; no es SSOT) | Preservar como copia BDP |
| `recipes.articulo_id` sin escritura (F14) | 158 | A (usar map_tpv_receta como SSOT) | recipes.articulo_id se deprecía; FK real en map_tpv_receta |
| `purchase_orders.voice_transcription` código muerto | | A (ignore/columna deprecated) | Sin efecto |
| `event_products.price` vs carta | | Fuera de alcance | |

### 22.1 Resumen por clase

| Clase | % estimado total de filas afectadas |
|---|---|
| A Automático | ~60 % (normalizaciones de vocabulario `u→ud`, `gr→g`, joins existentes) |
| B Transformación determinista | ~20 % (contenido pack, supplier FK por nombre match) |
| C Revisión humana | ~15 % (77 stock neg, 5 food cost extremo, contenidos de caja sin pack) |
| D Irrecuperable / preserva | ~5 % (line_unit OCR, history changed_by NULL) |

---

## 23. Migración de datos

### 23.1 Estrategia general

- **Big bang NO.** Fases K1-K12.
- **Compatibilidad ascendente:** columnas deprecated no se borran hasta K12.
- **Backfill bidireccional durante transición:** dual write (§30).
- **Historical preservation:** tablas legacy `ingredients`, `ingredient_price_history`, `supplier_item_mappings` NO SE BORRAN. Se renombra a `ingredients_legacy_2026_08_10` o se añade columna `_deprecated` y queda RLS read-only para master.

### 23.2 Paso a paso de datos (orden en fases)

| Fase | Paso | Tipo | Qué toca | Validación |
|---|---|---|---|---|
| K2 | Normalizar vocabulario en texto | B | `u→ud`, `gr→g/kg`, `unitat→ud` en ingredients.* y recipe_lines.* | Diff reporte + COUNT antes/después |
| K5 | Cerrar escritores no autorizados | A | `actualizar_stock` deprecated en favor de `actualizar_stock_con_movimiento` nuevo | No hay UPDATE directo (SQL CHECK + revoke) |
| K5 | Determinismo mapping | A | `supplier_item_mappings` añadir is_verified DESC + created_at DESC ORDER | Unicity check |
| K6 | Unidades tablas | A | Crear units + unit_dimensions; poblar codes conocidos | FK checks |
| K7 | Mapear ingredient.purchase_unit/unit/recipe_unit → units.id | A-B | Backfill FK en columnas nuevas | 100 % non-null para productos activos |
| K8 | product_presentations desde pack_* | B-C | Desde `ingredients.pack_*` + `per_pack` + `order_unit` | % presentations creadas vs productos activos |
| K8 | supplier_products + supplier_product_presentations | A-C | Desde `supplier_item_mappings` + `ingredients.supplier` nombre match | Auditoría mapeos manuales |
| K9 | `product_prices` desde `current_price` + history | A-B | `ingredients.current_price → product_prices(is_current, buy_unit_id=ingredient.purchase_unit)` + trigger history | Suma actual coincide con legacy |
| K10 | stock_movements con FKs | A | `ingredient_id→product_id`, `unit→stock_unit_id` (new col) | 181.560 filas con FK not null |
| K10 | `v_current_stock` reconciliación vs stock_current legacy | C (por producto negativo) | Diffs report | 77 negativo revisados o ajustados |
| K11 | recipe_lines FKs | A | `unit→quantity_unit_id`; create missing units | 362 líneas todas FK not null |
| K11 | Nuevo RPC coste → get_recipe_cost JSON estado | A | | Tests paridad (§32) |
| K11 | UI receta pinta estados | A | | No visualización 0€ |
| K12 | Retirada columnas deprecated | Condicional | waste_percentage, base_unit, unit, unit_type, ingredients.supplier_id (texto), recipes.articulo_id | 0 lectores en grep |

### 23.3 Preservación histórica

- Ninguna tabla antigua se DROPea antes de 2 trimestres post-K12.
- Snapshot congelado de `ingredients` + `stock_movements` pre-migración guardado en esquema `snapshot_2026q3_legacy_product_units`.
- Backups BD vía Supabase Point-in-Time + dump manual antes de cada fase K.

---

## 24. SQL (PROPUESTO — solo especificación, NO ejecutar)

### 24.1 Tablas NUEVAS

| Tabla | Clase | PK / constraints clave | FK | Política RLS (CREAR OBLIGATORIO, SEGURIDAD §5) |
|---|---|---|---|---|
| `unit_dimensions` | maestro | code text PK CHECK enum | | authenticated SELECT; admin writer |
| `units` | maestro | uuid PK; code text UNIQUE | dimension_id → unit_dimensions | igual |
| `unit_conversions` | maestro versionado | uuid PK; UK (from, to, scope, valid_to NULL); CHECK factor>0 | from/to → units; scope product/supplier/presentation | |
| `products` | maestro (renamed ingredients + split) | uuid PK (preservar ids!) | category_id, default_buy_unit_id, stock_unit_id, recipe_unit_id FK a units | RLS existente adaptada |
| `product_presentations` | maestro | uuid PK; UK (product_id, display_name) | product_id → products; contains_unit_id → units | |
| `supplier_products` | transaccional maestro | uuid PK; UK (supplier_id, product_id, supplier_sku) | supplier_id → suppliers; product_id → products | |
| `supplier_product_presentations` | maestro N:M | uuid PK | supplier_product_id, product_presentation_id, content_total_unit_id | |
| `product_prices` | transaccional SSOT | uuid PK; UK (product_id, buy_unit, is_current true partial) | product_id → products; reference_buy_unit_id → units | |
| `product_price_history` | histórico INSERT-only | uuid PK; trigger auto-fill | product_prices FK | select only admin/master |
| `receptions` | transaccional | uuid PK | purchase_invoice_id → purchase_invoices | |
| `reception_lines` | transaccional | uuid PK | reception_id, invoice_line_id, product_id, presentation_id | |
| `inventory_sessions` | transaccional | uuid PK | created_by | |
| `inventory_counts` | transaccional | uuid PK | session_id, product_id, adjustment_movement_id → stock_movements | |

### 24.2 Columnas NUEVAS en tablas existentes

| Tabla | Columna | Tipo | FK | Destino |
|---|---|---|---|---|
| `ingredients` (→ products) | `default_buy_unit_id` | uuid NULL (luego NOT NULL) | units | Backfill |
| `ingredients` | `default_stock_unit_id` | uuid NULL → NOT NULL | units | Backfill |
| `ingredients` | `default_recipe_unit_id` | uuid NULL → NOT NULL | units | Backfill |
| `ingredients` | `_legacy_columns_mode` | bool default true | | Feature flag transición |
| `stock_movements` | `product_id` (syn) | uuid | → ingredients.id | rename ingredient_id? |
| `stock_movements` | `stock_unit_id` | uuid NULL → NOT NULL | units | Backfill desde `unit` text |
| `stock_movements` | `source_system` | enum | | default 'legacy_trigger' |
| `stock_movements` | `processed_by_user_id` | uuid | profiles | |
| `recipe_ingredients` | `quantity_unit_id` | uuid NULL → NOT NULL | units | |
| `recipe_ingredients` | `waste_factor_pct` | numeric | | derived from quantity_net? |
| `purchase_invoice_lines` | `observed_quantity` numeric, `observed_billing_text` text | | | split actual |
| `purchase_invoice_lines` | `verified_*` (5 cols) | | | after confirm |
| `purchase_invoice_lines` | `mapped_supplier_product_id` | uuid | supplier_products | reemplaza mapped_ingredient_id |
| `supplier_item_mappings` | `supplier_product_presentation_id` | uuid FK | supplier_product_presentations | |

### 24.3 Columnas DEPRECATED

| Tabla | Columna(s) | Última fase de lectura | Motivo retiro |
|---|---|---|---|
| `ingredients` | `unit`, `base_unit`, `unit_type` | K10 | SSOT en `*_unit_id` FK |
| `ingredients` | `purchase_unit` (text) | K9 → FK | K12 retiro |
| `ingredients` | `waste_percentage` | K12 | Campo muerto F8 |
| `ingredients` | `supplier_id` (text, no FK) | K8 | supplier_products N:M |
| `ingredients` | `supplier`, `supplier_2` (text) | K8 | idem |
| `recipes` | `articulo_id` | K11 | SSOT=map_tpv_receta |
| `purchase_invoice_lines` | `line_unit` (text legacy) | K12 | observed_billing_text + verified FKs |
| `ingredients` | `current_price` (deprecated col) | K12 → después | SSOT = product_prices |
| `ingredients` | `stock_current` (updateable col) | K10 → K12 | SSOT = view projection |

### 24.4 Constraints / FK / CHECK

- FKs nuevas en todas las columnas `_unit_id`.
- `CHECK (source_system IN (...))` stock_movements.
- Partial unique index en `product_prices`: `UNIQUE (product_id, reference_buy_unit_id) WHERE is_current = true`.
- Enforce 1 buy_unit dimension: products default_stock y buy deben ser compatibles via conversion.
- Validación de dimension: trigger BEFORE INSERT/UPDATE on `unit_conversions` que `from.dimension == to.dimension` (a menos que scope_product bridge).

### 24.5 Triggers NUEVOS / reemplazos

| Trigger | Propósito | Sustituye a |
|---|---|---|
| `trg_product_price_history` | INSERT-only history | trigger actual? (No existía changed_by poblado) |
| `trg_reception_creates_purchase_movement` | Recepcion confirmada → movement PURCHASE | parte de `handle_new_invoice_line` actual |
| `trg_inventory_close_creates_adjustment` | Cierre inventario → ADJUSTMENT | actual INVENTORY_COUNT? |
| `trg_stock_projection_refresh` (opcional, si materializamos) | Sincronizar materialized view | Ninguno hoy |
| `trg_supplier_item_mapping_ordering` | Default ordering, timestamp | Ninguno |

### 24.6 RPCs (Functions) NUEVAS / deprecated

| RPC actual | Estado | Nueva versión | Cambio |
|---|---|---|---|
| `get_recipe_cost` | K4 deprecated → K11 reemplazo | `get_recipe_cost_v2` JSONB (lines + status) | Devuelve estados en lugar de 0 |
| `fn_recipe_line_cost` | K4 deprecated | `fn_recipe_line_cost_v2` JSON | `{ qty_buy, line_cost_eur, status, note }` |
| `convert_pricing_qty` | K6 → wrapper | `convert_unit_canonical` | Lee tabla `unit_conversions` |
| `invoice_line_price_to_purchase_unit` | K9 reemplazo | `line_normalized_price` | Usa supplier_product_presentations + unit_conversions |
| `actualizar_stock` (UPDATE directo) | **K5 ELIMINAR permisos y marcar deprecated** | `actualizar_stock_con_movimiento` | Crea stock_movement ADJUSTMENT + referencia |
| `recipe_qty_to_purchase_unit_for_cost` | K11 → wrapper sobre `convert_unit_canonical` | | |
| `staff_consumption_qty_to_purchase_unit` | K11 → igual wrapper | | Mantener tabla de errores |

### 24.7 Views nuevas

- `v_units_active` (solo activas)
- `v_product_with_current_price` (JOIN products + product_prices current + buy_unit)
- `v_current_stock` (SUM movements)
- `v_stock_movements_enriched` (JOIN producto/unidad/snapshot)
- `v_recipe_cost_exploded_v2` (líneas con estado)
- `v_supplier_product_catalog` (JOIN suppliers + supplier_products + presentations + last_price)

---

## 25. Backend (PROPUESTO)

### 25.1 Services nuevos

| Servicio | Propósito | Capa lee | Capa escribe |
|---|---|---|---|
| `UnitConversionService` | SSOT en memoria TS; carga tabla `unit_conversions` active; métodos convert(qty,from,to,scope). Paridad tests vs SQL | units + conversions | nada (lee tablas) |
| `ProductPriceService` | Único escritor de product_prices; implementa reglas §13.4 | invoice_lines, product_prices | product_prices, history |
| `StockProjectionService` | Única ruta para mutations de stock; todo INSERT movement | stock_movements, products | stock_movements |
| `InventoryService` | Flujo inventario sesión → counts → adjustments | inventory_sessions/counts | INVENTORY_COUNT movements (ADJUSTMENT) |
| `RecipeCostService` | TS mirror del SQL fn_recipe_line_cost_v2; misma tabla de conversiones; tests de paridad (§32 K7) | — | — (read-only engine) |
| `SupplierProductMatchingService` | OCR line → candidate matches → user confirms; AMBIGUOUS si score delta < threshold | supplier_products + presentations | supplier_products, ocr_matches |
| `ReceptionService` | Confirm recepción → PURCHASE movements + (si unlocked) price candidate write | receptions, albaranes | stock_movements, product_prices |

### 25.2 Repositories / data access

- `ProductRepository`: getById, listActive, withCurrentPrice, withStockProjection
- `UnitRepository`: byCode, byDimension
- `StockMovementsRepository`: insertMovement, listByProduct, summarize
- `PriceRepository`: upsertCurrentPrice (via service), listHistory

### 25.3 Server actions (rename)

| Actual | Fase | Cambio |
|---|---|---|
| `src/app/dashboard/albaranes/actions.ts` (5 citas SSOT roto) | K1 | Re-apuntar comentarios a PRECIOS-Y-COMPRAS.md |
| `src/app/dashboard/albaranes-precios/actions.ts` (usa canonicalPurchaseUnit) | K6 | sustituir por UnitConversionService |
| `src/app/dashboard/inventory/actions.ts` | K5 | migrate UPDATE direct → insert movement |
| `src/app/dashboard/inventory/waste/actions.ts` | K10 | FK unit_id en vez de texto |
| `src/app/ingredients/page.tsx` actions | K2 | normalizadores centralizados |
| `src/app/staff/actions.ts` (consumo) | K11 | usar convert canónico |
| `src/app/api/webhooks/bdp/ventas/route.ts` (deducción venta) | K11 / K12 | usar convert canónico; si falla → `CONSUMPTION_FAILED` table |

### 25.4 Validators / Parsers

| Actual | Destino |
|---|---|
| 5 normalizeUnit | `unitNormalizer()` 1 sola en `src/lib/domain/units.ts` |
| 8 convert implementations | `UnitConversionService.convert()` |
| `canonicalPurchaseUnit` (fallback kg) | Devuelve `{kind: 'unknown', raw}`; nunca kg |
| `recipe-cost.ts` funciones | `RecipeCostService` (re-exporta wrapper para compatibilidad) |

---

## 26. Frontend (PROPUESTO)

### 26.1 Páginas y cambios clave

| Página | Archivo | Actual | Propósito cambio | Fase |
|---|---|---|---|---|
| Ingredientes lista/edición | `src/app/ingredients/page.tsx`, `IngredientWizard.tsx`, `IngredientEditModal.tsx` | 6 columnas unidad; 2 normalizadores locales; UI precio per_pack inline | Unidades via `units` FK; presentations picker; lock price UI explícita; modo per_pack = presentation | K1→K11 |
| Recetas detalle | `src/app/recipes/[id]/page.tsx:580` | Usa `get_recipe_cost` RPC → muestra 0 € | Sustituir por `v_recipe_cost_exploded_v2`; badge por estado | K4→K11 |
| Inventario | `src/app/dashboard/inventory/InventoryClient.tsx` | `normalizeUnit` local | Unidades desde servicio canónico | K6 |
| Mermas | `WasteClient.tsx` | `normalizeWasteUnit` propio | Mismo servicio | K6 |
| Pedidos nuevo | `src/app/orders/new/page.tsx` | Supplier por nombre match `:147`; `unit_price=0` items | supplier_products FK; presentations picker; estimated_price | K8 |
| Tarjeta pedido | `OrderProductCard.tsx:33` | UI units propia | Compartir unidades canónicas | K6 |
| Albaranes acciones | `src/app/dashboard/albaranes/actions.ts` | Cita SSOT legacy; canonicalPurchaseUnit | K1 + K6 |
| Albaranes precios | `src/app/dashboard/albaranes-precios/actions.ts` | matching | MatchingService | K9 |

### 26.2 Hooks / utilidades

| Actual (archivo) | Destino |
|---|---|
| `normalizeUnit × 5` | `src/hooks/domain/useUnits.ts` (lee units REST/SWR; 1 implementación) |
| `convertToPurchaseUnitQuantity` TS × 2 | Export from `UnitConversionService` + wrapper hook |
| `src/lib/ingredient-pack-pricing.ts` (norm y convert) | Refactoriza a ProductPresentationService |
| `STANDARD_UNITS` en ingredientes | Static list desde Units seeds |
| `PACK_UNITS_PRESETS` | Presets via table product_presentation_templates |

### 26.3 Regla FRONTEND §: UI pinta; no interpreta

Frontend no implementa conversión. Pinta el estado que devuelve el motor. Muestra badge «Unidades incompatibles», «Sin precio», «Conversión aproximada». NUNCA normaliza una unidad a `kg` por desconocida; NUNCA muestra `0,00 €` cuando el motor dice `INCOMPATIBLE_UNITS`. Muestra `—` y badge de estado. (Implementa PRINCIPIO 2: sistema grita, no susurra.)

---

## 27. IA / OCR (PROPUESTO)

### 27.1 Pipeline correcto

```
[PASO 1] DATOS OBSERVADOS
   Imagen albarán → OCR → texto crudo
      │
      ▼
[PASO 2] NORMALIZACIÓN TEXTUAL
   Líneas: cantidad (numérico), unidad texto crudo, precio_unit, precio_total
      │
      ▼  output: observed_lines (GUARDAR con confianza)
[PASO 3] MATCHING PROVEEDOR → PRODUCTO
   supplier + supplier_item_display_name fuzzy → supplier_products
   score; delta < umbral = AMBIGUOUS
      │
      ▼  output: match_candidates por línea
[PASO 4] PRESENTACIÓN (unidad de factura → contenido total)
   "CAJA 24 UDS" → billing_presentation_name=caja, contains_qty=24, contains=ud
   "PACK 6 × 1L" → billing=pack, contains_qty=6, contains=ud(c/u=1L)
      │ (Si no parsea con suf. confianza) → REQUIRES_REVIEW. No factor=1.
      ▼
[PASO 5] CONVERSIÓN (tabla unit_conversions + scope)
   €/caja  →  €/ud = (€/caja) / 24 ud_per_caja
      │
      ▼
[PASO 6] VALIDACIÓN
   - Precio comparado con anterior: diff > 25 % → ALERT
   - Conversión approximate → WARNING
   - locked_price → skip writing
   ▼
[PASO 7] TRANSACCIÓN (solo si usuario confirma todo)
   INSERT verified_line + supplier_product_presentation last_price
   IF price unlocked AND validation OK → nuevo product_price
   IF receptión confirmada → INSERT PURCHASE movement
```

### 27.2 Estados OCR (reemplazo del fallback factor=1)

`OCR_LINE_STATUS ∈ { EXTRACTED, MATCHED, AMBIGUOUS_MATCH, PRESENTATION_UNKNOWN, CONVERSION_MISSING, PRICE_DELTA_ALERT, LOCKED_PRICE_SKIPPED, USER_CONFIRMED, ERROR_REVIEW }`.

NUNCA `status = OK` por default sin confirmación.
NUNCA `canonicalPurchaseUnit(undefined) = 'kg'` (retiro F3/P2).

### 27.3 Procesos actuales a migrar

| Actual | Paso destino |
|---|---|
| `handle_new_invoice_line` trigger SQL después de insert | PASO 7, después USER_CONFIRMED |
| OCR pipeline actual produce `line_unit` texto crudo | PASO 1 salida observed_billing_text |
| `canonicalPurchaseUnit` (fallback kg) | PASO 2 con estado AMBIGUOUS si no reconoce |
| Mapeo supplier_item_mappings + fuzzy | PASO 3 (SupplierProductMatchingService) |
| `supplier_item_mappings.conversion_factor` | PASO 5 con tabla canónica |

---

## 28. Automatizaciones (PROPUESTO)

| Escritor | Dato que escribe HOY | Capa | Automático | SSOT afectado | ¿Debe poder escribir? (canónico) |
|---|---|---|---|---|---|
| OCR pipeline | purchase_invoice_lines (crudo) | Supabase edge / webhook? | Sí | observado | ✅ (solo observed_*, nunca verified/maestro) |
| Trigger `handle_new_invoice_line` | `current_price` + `stock_movements` PURCHASE | SQL trigger | Sí (aut. al insertar línea mapeada) | precio, stock | ✅ pero solo DESPUÉS de confirmed (K9+ reception) |
| Trigger `trg_ingredients_pack_pricing_sync` | `current_price` modo pack | SQL trigger | Sí cuando cambian cols pack | precio | ✅ product_prices (con version history) |
| Formulario IngredientWizard | ingredients.* pack/precio/unidades | Server action src/app/ingredients | Manual | product, units, pack, price | ✅ |
| Formulario edición ingrediente | idem + manual current_price | IngredientEditModal | Manual | product, price | ✅ |
| Botón aplicar actualizaciones precio albarán | `applyAlbaranPriceUpdatesAction` | albaranes-precios/actions.ts | Semiautomático usuario pulsa | precio actual | ✅ pero no debe romper price_locked (hoy lo rompe según auditoría F6 punto 6) |
| RPC copiloto `actualizar_stock` | `UPDATE ingredients.stock_current` (SIN RASTRO) | SQL RPC SECURITY DEFINER | Sí vía copiloto IA | stock | ❌ EN K5 SUSTITUIR. Nueva versión ESCRIBE movement |
| Webhook BDP ventas | `process_ticket_stock_deduction` → SALE movements | `bdp/ventas/route.ts` | Sí | stock (SALE) | ✅, pero con convert canónico; si falla conversión → tabla errores no deducir ciego |
| Consumo personal staff | WASTE movements + errores | `staff/actions.ts` + SQL RPC | Manual usuario + automático | stock, coste | ✅ |
| Inventario recuento manual | INVENTORY_COUNT + ADJUSTMENT | `inventory/actions.ts` | Manual | stock | ✅ |
| Mermas | WASTE movements | inventory/waste/actions.ts | Manual | stock | ✅ |
| Cron semanal recálculo balances (horas) | weekly_snapshots | Supabase cron | Sí | Horas (irrelevante aquí) | Fuera de alcance |
| n8n / integraciones apps-script | payroll, emails, … | integrations/ | Mixto | nóminas, personal | Fuera de alcance |
| IA chat (copiloto) | lee + actualizar_stock | ai/ | Sí (pregunta usuario) | stock via RPC | ✅ solo a través de nueva API de movement |
| Matching mapeo automático albarán | supplier_item_mappings insert | trigger fuzzy | Sí | supplier mapping | ✅ como candidate + status, hasta confirmación no active |
| Trigger `update_ingredient_stock_trigger` después de movement insert | `ingredients.stock_current +=` | SQL | Sí (al insertar movimiento) | stock actual | ✅ K10+ → view projection; retira UPDATE |
| `fn_recipe_line_cost` SQL + `recipe-cost.ts` TS | coste | RPC + import | Bajo demanda | coste (dato derivado) | ✅ Ambas; paridad tests obligatoria K7 |

### 28.1 Matriz de decisión de escritores (solo se marca lo que cambia)

| Escritor actual | Acción migración | Fase |
|---|---|---|
| RPC `actualizar_stock` UPDATE sin rastro | Deprecar execute grant; sustituir por RPC que INSERT movement | K5 |
| Trigger `handle_new_invoice_line` escribe price+stock directo | Separar: price write → ProductPriceService; stock write → ReceptionService; trigger marca línea candidate | K9 |
| `applyAlbaranPriceUpdatesAction` sin comprobar price_locked | Añadir comprobación + escribir history | K1 |
| 5 normalizeUnit locales | Retirar, una implementación compartida | K6 |

---

## 29. Shadow validation (PROPUESTO)

Fase previa a activación del modelo nuevo.

### 29.1 Estrategia: DUAL READ

Todo dato que se lee por pantalla, durante transición, se calcula por AMBOS caminos:
- LEGACY (actual)
- CANONICAL (nuevo, via tablas nuevas + servicios)

Se comparan y se envía diff a log `shadow_comparisons`.

### 29.2 Comparar como mínimo

| Dato | Fórmula legacy | Fórmula canónica | Umbral aceptable | Bloqueante si diff |
|---|---|---|---|---|
| Unidades buy | `ingredients.purchase_unit` text | `units.code` via FK | 0 diff en vocabulario normalizado | Sí si no coincide U en producto activo |
| Conversión kg↔g, ml↔l | convert_pricing_qty SQL | convert_unit_canonical | 0 diff | Sí |
| Precio actual por ingrediente | `ingredients.current_price` | `v_product_with_current_price.price_eur` | absoluto < 0.01 € | Sí si > |
| Stock actual por producto | `ingredients.stock_current` | `v_current_stock.current_qty` | 0 tras reconciliación K8 | Sí post K8 |
| Coste de línea receta (1000 líneas reales) | `fn_recipe_line_cost` SQL y `recipe-cost.ts` | `RecipeCostService TS` vs `fn_recipe_line_cost_v2 SQL` + legacy nuevo | Paridad exacta de `status` y € (dif <0.001) | Sí si status difiere o € > 0.01 |
| Food cost por receta | `cost / recipes.sale_price` hoy | canónico | Mismos 5 recetas extremas pasan a rangos razonables (<100%) | Sí si 5 recetas siguen >500% |

### 29.3 Tipos de divergencias

| Tipo | Ejemplo | Se espera? | Aceptable? | Bloqueante? |
|---|---|---|---|---|
| Normalización vocabulario | `u` → `ud` cambia display code pero no magnitud | Sí | Sí | No |
| Costo línea antes 0€ ahora MISSING_PRICE | Oreo Helado | Sí, es corrección | Sí | No (ESPERADO) |
| Stock antes −31,9 kg ahora 0 o ajustado | Limón reconciliado | Sí con C review | Sí post | No tras K8 |
| Precio Oreo antes 51,6€/ud ahora 2,15€/ud | Corrección per_pack | Sí | Sí | No (ESPERADO) |
| Diferencias numéricas > 0,01€ sin cambio de estado | | No | No | SÍ |
| Ambos productores TS↔SQL difieren status | | No | No | SÍ |

### 29.4 Duración shadow

**Mínimo 14 días hábiles consecutivos.** Criterio salida: 0 diff bloqueantes durante 5 días hábiles seguidos. Log de shadow: tabla `shadow_comparisons` con JSON diffs.

---

## 30. Transición (PROPUESTO)

### 30.1 Mecanismos elegidos (solo necesarios)

| Mecanismo | Se usa? | Justificación |
|---|---|---|
| Adapters de lectura | ✅ | Legacy components pueden seguir funcionando con wrapper que lee nuevo y adapta a interfaz vieja |
| Dual read | ✅ | Shadow validation (§29) |
| Dual write | ✅ | Durante K9-K11: producto actualizado → se escribe tanto en `ingredients` legacy cols como en tables nuevas |
| Backfill | ✅ | Fases K7, K8, K9, K10 |
| Shadow computation | ✅ | Motor canónico corre en paralelo sin ser SSOT |
| Feature flags | ✅ | 3 flags: `enable_canonical_units_read`, `enable_canonical_price_write`, `enable_canonical_stock_projection`, `enable_canonical_recipe_cost` |

No usamos:
- Big bang (riesgo alto sin entorno pruebas — ARQUITECTURA §11)
- Cut-over único (demasiados datos ambiguos C)

### 30.2 Secuencia de activación flags

1. `enable_canonical_units_read` = ON; `write` legacy. Lectura paralela. (K7)
2. `enable_canonical_price_write` = DUAL write; ambas columnas. (K9)
3. Shadow price OK 5 días → `enable_canonical_price_write` = CANONICAL SOLO; legacy.col `deprecated`.
4. `enable_canonical_stock_projection` = ON (view). Verificar vs legacy.col. (K10)
5. Shadow cost OK 5 días → `enable_canonical_recipe_cost` = ONLY V2 RPC/UI. (K11)
6. Todas OK 14 días → columnas deprecated RETIRAR opcionalmente (K12)

### 30.3 Rollback por flag

Cada flag se puede revertir instantáneamente sin pérdida de dato (dual write activo mientras haya flags parciales). Las tablas nuevas persisten. Las columnas legacy siguen pobladas hasta el último dual-write.

---

## 31. Invariantes (PROPUESTO — ampliada)

### 31.1 Invariantes de datos

1. **Toda cantidad tiene unidad referenciada por FK NOT NULL.** (Ningún `quantity` numérico solo.)
2. **Todo precio tiene unidad de referencia.** (`product_prices.reference_buy_unit_id` NOT NULL; albarán precio con billing_presentation.)
3. **Toda conversión tiene from y to distintos.** (No permitir identidades redundantes salvo tests.)
4. **Una presentación necesaria para normalizar debe tener contenido conocido.**
   Si `supplier_product_presentation.content_total_unit_id` IS NULL → estado `PRESENTATION_UNKNOWN`, no normalizar precio.
5. **Un precio de caja NUNCA se interpreta automáticamente como precio unitario.**
   El factor de conversión presentation→buy debe estar explícito y aprobado; sin él REQUIRES_REVIEW.
6. **Producto maestro independiente del proveedor.** `products.name` y `products.id` no dependen de supplier_name; relación N:M.
7. **Histórico inmutable.** Ningún UPDATE/DELETE en tablas `*_history`; RLS select-only para master; ningún writer humano directo.
8. **Coste de receta basado ÚNICAMENTE en `product_prices` (€/buy_unit) + `unit_conversions`.**
   Ninguna UI recalculará coste de línea con reglas propias (FRONTEND §).
9. **Frontend no redefine conversiones.** Lee estado del motor; no implementa `if (unit==='kg' && …)`.
10. **OCR NO es fuente de verdad.**
    OCR → `observed_*`; solo `verified_*` con confirmación de usuario o regla de confianza 1.0 + 3 apariciones iguales entra en maestro.
11. **Conversión desconocida produce estado explícito de error/ambigüedad.**
    Nunca `factor=1`, nunca 0€, nunca `kg` fallback. Valores explícitos: `INCOMPATIBLE_UNITS`, `CONVERSION_MISSING`, `AMBIGUOUS_MATCH`, `PRICE_DELTA_ALERT`, `PRESENTATION_UNKNOWN`.
12. **No existen dos implementaciones semánticamente distintas de la misma conversión.**
    TS `UnitConversionService` lee MISMA tabla `unit_conversions` que SQL `convert_unit_canonical`. Tests de paridad K7 bloquean promoción a feature flag ON.
13. **Stock no se escribe, se deriva.** `ingredients.stock_current` (legacy) nadie lo escribe tras K10; se compara con VIEW y alinea via ADJUSTMENT K8.
14. **Precio bloqueado permanece.** `locked_by_user_id` bloquea todo write automático; solo usuario master/manager unlock.
15. **Toda línea de receta con unidad incompatible NO PROPAGA 0 al total.** Total receta = Σ líneas OK + badge de líneas sin resolver; no las silencia.
16. **Movimiento stock sin `source_system` es inválido.** CHECK constraint.
17. **Un producto archivado no entra en nuevas líneas transaccionales** (albarán, receta, pedido). Líneas históricas preservan nombre snapshot.
18. **Solo un actual precio por producto+buy_unit.** Partial unique index `UNIQUE (product_id, reference_buy_unit_id) WHERE is_current = true`.
19. **Números de dinero usan `numeric` exacto en SQL y número Decimal/equivalente en TS.** (Ya es así.)
20. **La eliminación de un ingrediente es soft-delete (status=archived).** Nada se borra. Preservación histórica.

---

## 32. Tests (PROPUESTO — conceptuales por fase)

### 32.1 Tests de unidades y conversión

| T01 `ud` | 1 ud × factor=1 ud → 1 ud. Dimensión count. |
|---|---|
| T02 `kg ↔ g` | 1.5 kg → 1500 g, 750 g → 0.75 kg. Bidireccional. |
| T03 `l ↔ ml ↔ cl` | 1.5 l = 1500 ml = 150 cl. Triángulo cerrado. |
| T04 Conversión desconocida | `5 marcos → ? ud` → `CONVERSION_MISSING`. No fallback. |
| T05 `caja (contenido conocido)` | 1 coca-cola presentation(caja 24 ud) × 1 → 24 ud. scope_presentation. |
| T06 `pack sin contenido` | 1 pack (missing content) → estado `PRESENTATION_UNKNOWN`. No factor=1. |

### 32.2 Tests de precio

| T07 Precio caja → unitario | 20 €/caja, caja=24 ud → 0,833333 €/ud. Comparación exacta (numeric). |
|---|---|
| T08 Precio coca-Cola (caso real auditoría) | 51,6 €/caja 24 ud → 2,15 €/ud exacto. |
| T09 Nestea 6,95 € / 12 ud → 0,579167 €/ud | (HEREDADO auditoría §J casos reales). |
| T10 Leche pack 6 × 1 L = 9,60 € → 1,60 €/L | buy_unit = L. |
| T11 Oreo 51,60 €/caja 24 ud → 2,15 €/ud → food cost Oreo Helado 74%, no 1.957 %. | |
| T12 Precio sin unidad → `REQUIRES_REVIEW` | Dato OCR: solo «20 €» sin billing_presentation → estado, no 20 €/ud. |
| T13 Precio bloqueado | Línea albarán distinto valor; locked=true → no actualiza; status=LOCKED_PRICE_SKIPPED. |
| T14 Precio pack 0€ (Cava mix) | estado = `PRICE_MISSING`, no current_price=0. |

### 32.3 Flujos operacionales

| T15 Compra → recepción | Albarán verificado + recepción confirmada → 1 PURCHASE movement. Stock suma correctamente. |
|---|---|
| T16 Recepción → stock | 1 caja Harina 5 kg → stock += 5 kg. |
| T17 Stock → receta | Receta con 100 g harina; compra 5 kg → convert OK, coste línea OK. |
| T18 Proveedor → producto | Mapeo AMBIGUOUS (2 proveedor, score cercano) → no match automático; REQUIRES_REVIEW. |
| T19 Inventario → ajuste | Físico 5,0 kg vs sistema 4,8 kg → ADJUSTMENT +0,2 kg. |
| T20 Venta → stock | Ticket con 1 ración receta → SALE qty convertido a stock_unit_id correcto. |
| T21 Venta unidad receta incompatible | ud vs kg sin puente → `CONSUMPTION_FAILED`, no descuenta ciego, no 0. |
| T22 Receta → coste Oreo | Antes 51,6 €, tras migración 2,15 €. Food cost display actualizado. |

### 32.4 Casos ambiguos / data corrupta

| T23 Presentación ambigua | Frankfurt 16 ud × 12 ud (HEREDADO caso patológico) → estado `CONTENT_MISMATCH`, no auto-migrar. |
|---|---|
| T24 `u` legacy | Línea `unit='u'` → backfill → `ud`. |
| T25 `gr` legacy → `g`. | |
| T26 Precio sin unidad (€20 sin caja/pack/uds info) → REQUIRES_REVIEW. | |
| T27 Unidad textual extraña «banacot» → `PRESENTATION_UNKNOWN`, no `kg`. | |

### 32.5 Paridad TS ↔ SQL (K7)

Corpus 1000 líneas de receta reales (`recipe_ingredients` × ingredientes × precios actuales) calculadas por:
- `RecipeCostService.calcLine()` TS
- `fn_recipe_line_cost_v2()` SQL

Criterio aceptación:
- **Status field idéntico 100 %** (OK, MISSING, INCOMPATIBLE, AMBIGUOUS).
- Para líneas OK: |coste_TS − coste_SQL| < 0,001 €.
- Ambos difieren en < 10 líneas (0,1 %).

---

## 33. Plan K1-K12 (PROPUESTO)

K1-K10 del informe auditoría + K11 (flujos operativos) + K12 (limpieza y retiro).

### Fase K1 — Cerrar círculo documental

- **Objetivo:** Re-apuntar 5 citas de SSOT legacy a PRECIOS-Y-COMPRAS.md. Corregir `applyAlbaranPriceUpdatesAction` que no respeta `price_locked` (auditoría F6 punto 6).
- **Dependencias:** Ninguna. Código documental.
- **Datos afectados:** Ningún dato persistente cambia. Solo comentarios y 1 comprobación `if price_locked then skip`.
- **Validaciones:** Grep por citas legacy → 0. Tests unitarios aplicar actualizaciones precio con lock/no lock.
- **Riesgo:** Bajo.
- **Rollback:** Revert commit; sin impacto en datos.
- **Criterio aceptación:** 5 comentarios apuntando a PRECIOS-Y-COMPRAS.md; precio locked NO se actualiza.

### Fase K2 — Normalizar vocabulario de unidades en columnas texto legacy

- **Objetivo:** `u→ud`, `gr→g/kg`, `unitat→ud` en `ingredients.purchase_unit, unit_type, recipe_unit, unit, order_unit` y `recipe_ingredients.unit`.
- **Dependencias:** K1.
- **Cambios futuros:** Esta normalización es puente hacia FKs canónicas.
- **Datos afectados:** 226 ingredientes, 362 líneas receta. Script UPDATE transaccional con WHERE case.
- **Validaciones:** Reporte before/after. Conteo distribución `purchase_unit`: post no hay `u`/`gr`/`unitat` salvo que se decida retener.
- **Riesgo:** Bajo pero irreversible en si; snapshot pre-transacción.
- **Rollback:** Script UPDATE inverso basado en backup; o recuperación PITR Supabase.
- **Criterio aceptación:** 0 filas `purchase_unit IN ('u','unitat','gr')` en ingredients activos.

### Fase K3 — Determinismo selección de mapping (supplier_item_mappings)

- **Objetivo:** Añadir ORDER BY determinista (`is_verified DESC, last_seen_at DESC, id DESC`) en trigger/RPC y queries de selección mapping. Añadir unique UK si (supplier_id, supplier_item_name) es repetido → detectar duplicados.
- **Dependencias:** K2.
- **Validaciones:** Lista de mappings duplicados detectada; merge manual 10 si procede.
- **Riesgo:** Bajo.
- **Rollback:** Quitar ORDER BY → mismo comportamiento anterior.
- **Criterio aceptación:** Query `getBestMapping(supplier, item)` sin ORDER BY en código fuente (grep: 0 ocurrencias).

### Fase K4 — Coste BD: estado explícito por línea; alinear con TS

- **Objetivo:** `fn_recipe_line_cost_v2` JSON `{status, line_cost_eur, note}`. `get_recipe_cost_v2` JSON agregado. Deprecar old firmas; wrapper backward compatible emite `0` por ahora pero log warning.
- **Dependencias:** K1.
- **Validaciones:** Tests §32 T22, T7, T8, T11; paridad con TS recipe-cost.ts sobre 100 líneas.
- **Riesgo:** Medio; UI que consumía 0 debe manejar badge.
- **Rollback:** Old RPC sigue operativa durante K4-K11.
- **Criterio aceptación:** Divergencia TS↔SQL status = 0 en 100/100 líneas test.

### Fase K5 — Único camino a stock; retirar UPDATE directo copiloto

- **Objetivo:** (a) Nueva RPC `actualizar_stock_con_movimiento()` → INSERT `stock_movements` tipo ADJUSTMENT. (b) `REVOKE EXECUTE ON FUNCTION actualizar_stock FROM authenticated;` → solo master vía wrapper. (c) Añadir CHECK constraint a stock_movements: `source_system` enumeración NOT NULL.
- **Dependencias:** K3.
- **Datos afectados:** stock_movements nuevas filas; grants SQL; 1 check constraint.
- **Validaciones:** `actualizar_stock` llamada con rol manager → `permission denied`; `actualizar_stock_con_movimiento` → 1 fila en movements + projection suma.
- **Riesgo:** Medio (copiloto podría necesitar adaptación si llama RPC vieja).
- **Rollback:** GRANT de vuelta.
- **Criterio aceptación:** 0 llamadas RPC vieja en 7 días (log audit); todo cambio stock tiene movement_id asociado o trigger source.

### Fase K6 — Consolidar conversión y normalización: 1 implementación compartida

- **Objetivo:** Crear `src/lib/domain/units.ts` (normalize + convert canónico en TS) + SQL función `convert_unit_canonical`. Retirar 5 normalizeUnit locales → wrappers que llaman a la central.
- **Dependencias:** K4, K5.
- **Validaciones:** Unidad «u» → `ud` tanto en inventario como en ingredientes y mermas; tests K7 paridad 100% de 500 casos de conversión aleatoria.
- **Riesgo:** Medio.
- **Rollback:** Volver a locales si aparecen bugs (feature flag).
- **Criterio aceptación:** grep `function normalizeUnit` = 1. grep `convert_unit_canonical` wrappers que delegan.

### Fase K7 — Pruebas de paridad TS↔SQL sobre corpus reales

- **Objetivo:** 1000 líneas receta × 500 conversions × 100 precios actuales calculadas por ambos motores. Status y valor coinciden.
- **Dependencias:** K6.
- **Riesgo:** Bajo.
- **Rollback:** No hay, es solo lectura/comparación.
- **Criterio aceptación:** Paridad 100 % status; dif valor < 0.001 € en > 99,9 %.

### Fase K8 — Crear tablas canónicas (units, unit_dimensions, unit_conversions, products, product_presentations, supplier_products, supplier_product_presentations) + backfill desde datos legacy

- **Objetivo:** Esquema nuevo listo. Backfill clases A+B automático. Generar cola de revisión clase C.
- **Dependencias:** K7.
- **Datos afectados:** Nuevas tablas; 0 tablas legacy tocadas. Backfill dual write empieza aquí.
- **Validaciones:** 226 productos (1:1 ingredients), units activas ≥ 8, presentations creadas ≥ 120 (los que tenían pack info), 77 stock_neg → cola revisión.
- **Riesgo:** Medio.
- **Rollback:** DROP tablas nuevas; no afecta legacy.
- **Criterio aceptación:** `SELECT count(*) FROM products` = 226; `SELECT count(*) FROM products WHERE default_buy_unit_id IS NULL` = 0.

### Fase K9 — `product_prices` canónico + dual write precio

- **Objetivo:** Poblar `product_prices` desde `current_price` + history legacy sin `changed_by`. Activar dual write: `current_price` change → `product_prices` change + history trigger.
- **Dependencias:** K8.
- **Validaciones:** Suma precios actual legacy vs canónica coincide 226/226 dentro 0,001 €. Shadow price 5 días OK.
- **Riesgo:** Medio-Alto.
- **Rollback:** Desactivar flag `enable_canonical_price_write`.
- **Criterio aceptación:** 0 diff precio bloqueante. 5 albaranes nuevos procesados ambos caminos = OK.

### Fase K10 — Stock canónico: `v_current_stock` + reconciliación 77 negativos

- **Objetivo:** Backfill stock_movements con FKs `stock_unit_id` + `source_system`. Construir view. Reconciliar 77 ingredientes. Feature flag `enable_canonical_stock_projection`.
- **Dependencias:** K8, K5.
- **Validaciones:** 181.560 movimientos FK not null; reconciliación C completada (o en cola visible).
- **Riesgo:** Alto (stock es operación diaria).
- **Rollback:** Flag a legacy.col.
- **Criterio aceptación:** Post reconciliación, ingredientes con `stock_current < 0` = 0 O en cola explícita con asignación.

### Fase K11 — Flujos operativos (recepción explícita, recetas FK, inventario canónico, venta con convert)

- **Objetivo:** Recepción separada de inserción albarán. Recipe_lines FK. UI receta pinta estados. Venta deducción usa convert canónico; si falla → tabla errores.
- **Dependencias:** K9, K10, K4.
- **Validaciones:** 1 albarán real → recepción → 1 PURCHASE movement + price candidate correcto. 1 deducción venta OK + 1 caso INCOMPATIBLE va a errores no 0.
- **Riesgo:** Alto.
- **Rollback:** Feature flag por flujo.
- **Criterio aceptación:** Piloto 3 días con operación real (o shadow si no se atreven).

### Fase K12 — Retirada columnas deprecated y limpieza

- **Objetivo:** Retirar `ingredients.unit, base_unit, unit_type, waste_percentage, supplier_id text, recipes.articulo_id, current_price deprecated col, stock_current mutable col`. Marcar ingredients como `_deprecated_snapshot` si se renombra a products.
- **Dependencias:** Shadow 14 días 0 bloqueantes + K11.
- **Datos afectados:** Solo columnas deprecated DROP.
- **Validaciones:** Grep código por columnas = 0. 0 consumers.
- **Riesgo:** Bajo porque K1-K11 ya migraron.
- **Rollback:** Poco probable. Si es necesario, restaurar columnas como lectura con valores congelados.
- **Criterio aceptación:** Esquema validado `npm run validate:corpus` no muestra referencias rotas. Zero tests rotos (post D22 fijos).

### 33.1 Orden K original vs propuesto

- La auditoría propuso K10 «Retirar columnas muertas» como final. Se mantiene igual pero renumerado K12 por nuevas fases K11 (flujos) + K7 separado.
- K9 de auditoría era «Conectar pedido→stock opcional» → se fusiona en K11 (pedido/recepción) y marca opcional.
- Se añade K7 explícitamente porque la paridad TS↔SQL es el corazón del plan y no era una fase numerada separada en el informe. Justificación: sin K7, K6 no se valida.

---

## 34. Mapa de impacto (tabla concreta)

| Área | Archivo / tabla / proceso | Impacto | Dependencias | Cambio futuro | Fase |
|---|---|---|---|---|---|
| Productos (ingredientes) | `ingredients` tabla + `src/app/ingredients/page.tsx:23` + `IngredientEditModal.tsx:73` | Split 6 unit cols → 3 FK + products_presentations | FK units tables | products tabla canónica, ingredients deprecated | K2, K8, K12 |
| Proveedores | `suppliers` (18 filas), `supplier_item_mappings` (conversion_factor + tríada) | supplier_products N:M FK + supplier_product_presentations | K8 joins por nombre | mappings actuales → presentations | K8, K9 |
| Compras / Albaranes | `purchase_invoice_lines` (line_unit, mapped_ingredient_id) | split observed/verified; mapped_supplier_product_id FK | K9 supplier matching | OCR es observed, verify es usuario | K9, K11 |
| Pedidos | `purchase_orders`, `purchase_order_items.unit_price=0` (280 filas) | +presentation_id FK; estimated_price; reference a recepción | K8 | Pedidos deja de ser PDF suelto | K11 opcional |
| Albaranes escaneo | `src/app/dashboard/albaranes/actions.ts:3` (cita SSOT rota) | K1 re-apuntar; K6 nuevo matching service | K1, K6 | | K1, K6 |
| Recepción (implícita) | Trigger `handle_new_invoice_line` (`20260604140000:79-173`) | split: candidate price write + explicit reception PURCHASE movement | K9, K11 | trigger solo escribe candidates | K9, K11 |
| Stock | `ingredients.stock_current`; RPC `actualizar_stock` (`20260508153000:61-82`) UPDATE SIN RASTRO | view projection; RPC deprecated en favor de INSERT movement | K5, K10 | view es SSOT, nadie escribe valor | K5, K10, K12 |
| Movimientos | `stock_movements` (181.560), `update_ingredient_stock_trigger` (`20260417100000:5-16`) | añadir FK stock_unit_id + source_system enum CHECK; trigger actualiza view projection o se retira | FK units, enum movement_type ampliado | K10 view, trigger queda opcional | K5, K10, K12 |
| Inventario | `src/app/dashboard/inventory/InventoryClient.tsx:41` normalizeUnit local | Unidades desde servicio canónico; inventory_sessions + inventory_counts FK | K6, K10 | inventario deja touch stock_current directo | K6, K10 |
| Mermas | `WasteClient.tsx:36` normalizeWasteUnit propio; `stock_movements` tipo WASTE | Mismo servicio units; FK unit_id movement | K6 | | K6, K10 |
| Ventas (deducción stock) | `src/app/api/webhooks/bdp/ventas/route.ts` `process_ticket_stock_deduction` | convert canónico; si falla → `CONSUMPTION_FAILED` tabla, no deducir 0 | K11 | deducir ciego → deducir con convert o log error | K11 |
| Recetas | `recipes` tabla; `recipe_ingredients.unit` texto | FK unit_id canónico y product_id; `recipes.articulo_id` deprecated | K8, K11 | | K8, K11, K12 |
| Escandallos / coste | `fn_recipe_line_cost` SQL (`20260513121500:151-170`) return 0 + `src/lib/recipe-cost.ts:1-120` TS | `fn_recipe_line_cost_v2` JSON status; `RecipeCostService` TS tests paridad | K4, K7, K11 | 0€ silencioso → badge MISSING_PRICE | K4, K7, K11 |
| Precios | `ingredients.current_price`; `ingredient_price_history` (sin changed_by) | `product_prices` (is_current FK buy_unit) + `product_price_history` INSERT-only | K9 | | K9, K12 |
| SQL / BD | 72 tablas; migraciones `supabase/migrations/` ≥ 290; 107 funciones SQL | +12 tablas nuevas (§24); +5 RPC; +6 views; deprecated 5 cols 1 RPC | K8 | sin BD test | Todas K |
| Backend | `src/lib/recipe-cost.ts`, `src/lib/ingredient-pack-pricing.ts`, `src/lib/albaran-price-match.ts:91-105` canonicalPurchaseUnit | 5 services nuevos; 4 repos; unitNormalizer única | K6, K25 | | K6, K11 |
| Frontend | 5 normalizeUnit × páginas ingredientes/recetas/inventario/mermas/pedidos | `useUnits` hook único; UI badge estados; no interpreta; pinta | K6, §26 | | K6, K11 |
| IA / OCR | OCR pipeline → líneas albarán → trigger handle_new_invoice_line directo | Pipeline 7 pasos §27.1; observed vs verified; estados AMBIGUOUS REQUIRES_REVIEW | K9, K11 | OCR no escribe maestro directo | K9, K11 |
| Automatizaciones | Trigger SQL, RPC, webhook BDP, cron, copiloto IA | Matriz §28; retirar RPC actualizar_stock UPDATE sin rastro | K5 | | K5, K9 |
| Dashboards / Insights | `v_ingredient_price_variation` y queries coste receta | Apuntar a tablas canónicas + v_current_stock | K10, K11 | | K10, K12 |

---

## 35. Riesgos (PROPUESTO)

### 35.1 Riesgos altos (Riesgo ≥ 8/10)

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **Sin entorno de pruebas (ARQUITECTURA §11).** Todo script corre contra producción. | 10/10 | 9/10 | **Supabase PITR activo + dump pg_dump binario ANTES de cada K.** Runbooks rollback §36. Cada K reversible en <30 min. Piloto K2-K5 en horario bajo tránsito (04:00–06:00). |
| R2 | **77 stock negativo (HEREDADO auditoría E5):** reconciliación manual C grande. | 7/10 | 8/10 | Cola visible UI. No bloquea transición; stock canónico arranca reconciliado vs legacy columna. Feature flag por view. |
| R3 | **Caída food cost recetas extremas produce pánico operativo:** Oreo Helado 1.957 % → 74 %. Usuario confunde corrección con bug. | 8/10 | 7/10 | Comunicación previa K11 + reporte comparativo antes/after. Dashboard de 10 recetas con mayor delta food cost. Flag `enable_canonical_recipe_cost` OFF por defecto en cocina 7 días. |
| R4 | **Dual write asimétrico (K9, K11) produce desfase si un lado falla.** | 6/10 | 8/10 | Trigger de monitoreo; shadow_comparisons alerta diff > 0,01 € en 5 líneas. Reconciliación nocturna. Rollback por flag = legacy. |
| R5 | **Copiloto IA usa RPC deprecated actualizar_stock.** | 9/10 | 6/10 | K5 REVOKE EXECUTE → adaptar copiloto a RPC nueva ANTES o wrapper backend captura error. |

### 35.2 Riesgos medios (5–7/10)

- R6: 5 usuarios 5 normalizadores → retorno de implementación local en feature nuevo. Mitigación: lint rule + test unitario que falle si grep `function normalizeUnit` > 1.
- R7: Precios locked (ej. Cava) albarán cambia. Auditoría F6 dice que UI actual rompe locked. Mitigación K1 fix + trigger check constraint.
- R8: Divergencia TS↔SQL K7 no 100 %. Mitigación: no activar `enable_canonical_recipe_cost` hasta 0 status diff 1000 líneas.

### 35.3 Riesgos bajos (<5/10)

- R9: K12 drop column deprecated algo sigue referenciando → grep 0 + build fail.
- R10: Vocabulario `ud` vs `u` legacy K2 confunde usuario → changelog UI al entrar.

---

## 36. Rollback (PROPUESTO)

### 36.1 Por fase

Cada fase debe tener rollback documentado y ejecutable en <30 min. Principios: **nunca hay pérdida de histórico**, dual write activo mientras columnas legacy existan.

| Fase | Script rollback | Tiempo | Pérdida dato |
|---|---|---|---|
| K1 | `git revert` commit | <1 min | Ninguna |
| K2 | `pg_restore` snapshot pre-K2 o UPDATE inverso con CASE a valores antiguos | <10 min | Ninguna (reversible si snapshot) |
| K3 | Quitar ORDER BY de queries; drop UK | <5 min | Ninguna |
| K4 | Cambiar feature flag old RPC; drop fn_v2 si hace falta | <5 min | Ninguna |
| K5 | `GRANT EXECUTE ON actualizar_stock TO authenticated;`; drop nueva RPC | <3 min | Los INSERT movements hechos con la RPC nueva SIGUEN (correctos) |
| K6 | `enable_canonical_units_read = OFF`; wrappers vuelven a impl. local | <5 min | Ninguna |
| K7 | Es solo lectura. Sin rollback necesario. | — | Ninguna |
| K8 | `DROP SCHEMA canonical CASCADE;` o `DROP TABLE` tablas nuevas | <5 min | Backfill C/D se pierde (fue cola revisión); A/B reproducible |
| K9 | `enable_canonical_price_write = LEGACY_ONLY`; `DELETE FROM product_prices WHERE created_at > start_K9` (opcional, ya que dual write igualó legacy) | <10 min | Ninguna esencial; dual write mantiene legacy sincronizado |
| K10 | `enable_canonical_stock_projection = OFF`; código vuelve a `ingredients.stock_current` | <5 min | Los ADJUSTMENT de reconciliación siguen en stock_movements, no se borran |
| K11 | Feature flags por flujo a OFF | <10 min | Venta deducida por camino canónico no se deshace (fue correcta) |
| K12 | Restaurar columnas deprecated con snapshot; no se puede si se borró realmente | <20 min si snapshot | Solo si hubo consumers no detectados |

### 36.2 Plan de rollback mayor (catástrofe)

1. **Detener escrituras:** Poner Supabase en read-only 1 min o poner maintenance mode.
2. **Restaurar PITR:** 5 minutos atrás antes del script defectuoso.
3. **Correr dump binario cada 2 horas el día de ejecución de K alto riesgo.** Tiempo objetivo recuperación (RTO): <30 min. Punto objetivo recuperación (RPO): <5 min.

---

## 37. Criterios de aceptación (PROPUESTO)

Criterios agregados. Cada K tiene los suyos (§33). Son los GO/NO-GO antes de marcar la FASE K terminada.

### 37.1 Criterios transversales

- **C0 — Corpus íntegro:** `npm run validate:corpus` devuelve 0 errores en todo el corpus normativo.
- **C1 — No queda más de una implementación de `normalizeUnit`:** `grep -rn "export function normalizeUnit" src/ | wc -l` = 1.
- **C2 — No queda fallback silencioso kg/caja=1:** `grep -rn "return 'kg'" src/lib/albaran-price-match.ts` = 0; `grep -rn "factor.*=.*1 as any" src/` = 0.
- **C3 — Stock nunca se escribe por UPDATE directo:** `grep -rn "UPDATE ingredients SET stock_current" supabase/migrations src/` = 0 excepto trigger legacy deprecated.
- **C4 — RPC vieja `actualizar_stock` sin grant público:** `SELECT has_function_privilege('anon','actualizar_stock','EXECUTE')` = false; `authenticated` = false (solo master temporal).

### 37.2 SSOT alcanzado (meta principal del plan)

- **C5 — Verdades declaradas en §8 (SSOT) cumplidas 10/10.** Verificación manual por checklist + pruebas.
- **C6 — Precio unitario normalizado coherente en 5 casos reales auditoría:** Coca-Cola 0,8333; Nestea 0,5792; Oreo 2,15; Leche 1,60 €/L (dif < 0,001 €).
- **C7 — Recetas Oreo Helado, Pirulo, Frankfurt, Cava mix: food cost dentro rango plausible (5 %–75 %).**

### 37.3 Trazabilidad y datos corruptos

- **C8 — Histórico preservado:** `SELECT count(*) FROM ingredient_price_history` antes = después (con tolerancia +nuevos insertados, ningún DELETE).
- **C9 — Clasificación C visible:** Cola revisión UI muestra listado `requires_review` ≥ hallazgos auditoría (77 neg + 30 food cost extremo + 5 Cava/Fran…).
- **C10 — Ninguna conversión desconocida devuelve 0 o factor 1:** Tests T04, T06, T23, T27 pasan.

### 37.4 Shadow validation

- **C11 — Shadow validation 14 días consecutivos, 0 bloqueantes los últimos 5 días.**
- **C12 — Paridad TS↔SQL 1000 líneas (K7):** status 100 % match; valor 99,9 % < 0,001 €.

### 37.5 Operabilidad

- **C13 — 1 albarán real procesado de extremo a extremo (OCR → matching → recepción → stock → precio → coste receta) sin manual fixes.**
- **C14 — Rollback cada fase ejecutable y probado en staging (o al menos guión verificado).**

### 37.6 GO general para considerar K-FASE COMPLETADA

C0 ∧ C1 ∧ C2 ∧ C3 ∧ C5 ∧ C6 ∧ C8 ∧ C11 ∧ C12 ∧ C13 = TRUE.

---

_— Fin del documento. Fase K: Plan de Migración del Dominio Producto / Unidades / Cantidades. Fecha espiga: 10/08/2026. Documento SPIKE, no normativo (precedencia 0). Aprobación requerida antes de entrar en ejecución K1._