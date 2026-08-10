---
documento: SPIKE-AUDITORIA-DOMINIO-PRODUCTO-UNIDADES
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-10
caducidad: no aplica
supersede: —
---

# Auditoría arquitectónica — Dominio producto/unidad/cantidad/precio en Marbella OS

> **MATERIAL NO NORMATIVO — SPIKE-AUDITORIA-DOMINIO-PRODUCTO-UNIDADES**
>
> Esto es un análisis fechado el 2026-08-10, no una norma. **No autoriza ninguna decisión** y puede describir un sistema que ya no existe.
>
> La norma vigente vive en `marbella-os/`; la jerarquía que la ordena, en `marbella-os/CANON.md`. Ante cualquier discrepancia gana el documento normativo, sin discusión.

**Fecha:** 2026-08-10 · **Modo:** solo lectura (código + SELECT/RPC en BD real) · **Repo:** `marbella-app`
**Normativa aplicada:** `marbella-os/` (SSOT conceptual), CANON, GLOSARIO, MODELO-DE-DATOS, PRECIOS-Y-COMPRAS, ARQUITECTURA, DEUDA, MAPA-DE-CAPACIDADES, ESTADO.
**Convención de evidencia:** cada afirmación lleva `archivo:línea` o `tabla.columna` y la etiqueta **VERIFICADO** (código o datos reales) / **INFERIDO** (razonamiento) / **DESCONOCIDO**.

---

## A. Resumen ejecutivo

El dominio que va de *"un proveedor factura una caja"* a *"un escandallo dice que una ración cuesta X €"* está implementado en **4 capas** (BD triggers/RPCs, librerías TS, acciones de servidor, interfaz) con **7 vocabularios de unidades distintos, ~8 implementaciones de conversión, 5 copias del normalizador sintáctico y 6 columnas de unidad en `ingredients`**. No hay una fuente única de verdad de las unidades en los datos; sí la hay *declarada* en la norma (PRECIOS-Y-COMPRAS.md) pero el código no la cumple en varios puntos, y el documento normativo que el código cita (`context/INGREDIENTS_PRECIOS_Y_ALBARANES.md`) **ya no existe en el repositorio** (fue superseded, pero 5 ficheros de `src/` siguen citándolo como SSOT).

La cadena de consecuencias se observa en datos reales:
- **226 ingredientes**, con `purchase_unit` que mezcla `ud` (87), `kg` (79), `u` (31, no normalizado) y `l` (29). VERIFICADO
- **77 ingredientes con `stock_current` negativo** (Limón −31.889 ud → −31,9 kg; Vasos 350ml −22.392 ud), por la deducción por venta activa con unidades de receta. VERIFICADO
- **5 recetas con food cost >300 %** por precio erróneo de ingrediente (Oreo Helado 1.957 %, Pirulo 1.440 %, Tropical 1.200 %, Sangría de Cava 685 %). VERIFICADO
- **`ingredients.waste_percentage` es un campo muerto**: solo se persiste en formularios; no participa en coste ni stock. VERIFICADO
- **`get_recipe_cost` (BD) siempre devuelve 0 ante línea incompatible o sin precio**; el cliente TS sí distingue causa. Divergencia entre las dos implementaciones que la norma exige idénticas (invariante 6). VERIFICADO
- El **pedido a proveedor termina en un PDF/WhatsApp** y no escribe stock; el stock entra por el flujo paralelo de albaranes, sin conexión con `purchase_orders`. VERIFICADO

El defecto no es de código aislado sino de **ausencia de un modelo canónico de unidades compartido**. La migración propuesta en §K es la parte que el usuario pedirá después; este informe se limita a fijar el estado, las inconsistencias y el modelo canónico mínimo.

---

## B. El modelo real hoy

### B1. Tablas del dominio (esquema real vía PostgREST swagger, 97 tablas)

Tablas núcleo del dominio (todas en `public`):

| Tabla | Columnas relevantes | Notas |
|---|---|---|
| `ingredients` | 27 col: `unit_type, purchase_unit, current_price, waste_percentage, stock_current, supplier_id, unit, order_unit, recommended_stock, supplier_2, supplier_pricing_mode, pack_price, pack_units, pack_unit_size_qty, pack_unit_size_unit, inventory_visible, price_locked, base_unit, recipe_unit` | **6 columnas de unidad** |
| `supplier_item_mappings` | `supplier_id, supplier_item_name, ingredient_id, conversion_factor, last_known_price, line_billing_unit, line_content_qty, line_content_unit` | tríada de formato |
| `purchase_invoices` | `supplier_id, invoice_number, invoice_date, total_amount, status, source, content_sha256, duplicate_of_invoice_id, base_amount, tax_amount, tax_rate, ocr_error` | |
| `purchase_invoice_lines` | `original_name, quantity, unit_price, total_price, mapped_ingredient_id, status, line_unit, tax_rate, base_price` | `line_unit` del OCR |
| `purchase_invoice_attachments` | `file_path, content_sha256, page_order, ocr_status, ocr_error` | |
| `purchase_orders` | `order_number, supplier_id, order_date, expected_delivery_date, status, voice_transcription, total_amount, supplier_name, pdf_url, total_items` | 280 filas |
| `purchase_order_items` | `ingredient_id, quantity, unit, unit_price, line_total, ingredient_name` | `unit_price=0` en todos |
| `order_drafts` | `ingredient_id, quantity, unit, supplier_id` | realtime (migración vacía) |
| `stock_movements` | `movement_type, ingredient_id, supplier_id, quantity, unit, unit_price, total_amount, movement_date, reference_doc, original_description, notes, processed_by` | 181.560 movimientos |
| `recipes` | `servings, sale_price, sales_price_pavello, has_half_ration, sale_price_half, target_food_cost_pct, articulo_id, menu_category_id` | 158 filas |
| `recipe_ingredients` | `quantity_gross, quantity_net, unit, quantity_half, umb_multiplier` | 362 líneas |
| `map_tpv_receta` | `articulo_id, recipe_id, factor_porcion` | puente TPV |
| `suppliers` | `id(bigint), name, delivery_schedule, lead_time, reliability, phone, notes, email_domains` | 18 filas |
| `ingredient_price_history` | `old_price, new_price, changed_by, changed_at` | 1.162 filas, todas `changed_by=NULL` |
| `bdp_articulos` | `id(int), nombre, departamento_id, familia_id, coste, precio_base, envia_a_kds` | 194 filas, **0 con coste>0** (externa) |
| `event_products` | `product_id, name, price, category, is_active` | 54 filas (eventos) |

Tablas **sin tipar** en `src/types/supabase.ts` (al menos): el propio MODELO-DE-DATOS avisa de 15+ (D19). VERIFICADO

### B2. Las 6 columnas de unidad de `ingredients` (VERIFICADO en datos)

| Columna | Valores reales (226 ingr.) | Papel que se le asigna |
|---|---|---|
| `purchase_unit` | `ud` 87, `kg` 79, `u` 31, `l` 29 | unidad de compra/precio (SSOT nominal del precio) |
| `unit` | `ud` 118, `g` 79, `ml` 29 | unidad física "de stock" que usan los triggers de stock |
| `base_unit` | idéntica a `unit` (118/79/29) | duplicado de `unit` |
| `recipe_unit` | `ud` 117, `kg` 77, `g` 4, `l` 28 | unidad por defecto de la UI de receta (no entra en coste) |
| `order_unit` | `unidad` 92, `caja` 59, `pack` 51, `kg` 8, `pieza` 6, `ud` 3 | unidad del pedido a proveedor/PDF |
| `unit_type` | `ud` 87, `kg` 57, `gr` 22, `u` 30, `l` 26, `ml` 3, `unitat` 1 | columna sincronizada por trigger con `purchase_unit` (20260415140000:151-155), pero con valores legacy `gr/u/unitat` |

**Discrepancia real detectada:** `purchase_unit` y `unit_type` no coinciden en ~40 ingredientes (`purchase_unit=kg` → `unit_type=gr`; `purchase_unit=u` → `unit_type=u`; `purchase_unit=l` → `unit_type=ml`). El trigger normaliza solo en escritura; los datos legacy permanecen. VERIFICADO

**`ingredients.supplier_id` es texto sin FK y ninguna columna lo escribe**: el vínculo real ingrediente↔proveedor es por **nombre** (`ingredients.supplier`/`supplier_2` contra `suppliers.name`). VERIFICADO (`src/app/orders/new/page.tsx:147`).

---

## C. Fuente única de verdad: declarada vs. real

### C1. La norma (VERIFICADO, PRECIOS-Y-COMPRAS.md)
- §1: "Solo existe un precio de ingrediente: el precio actual, expresado en **euros por unidad de compra**". Invariante 1.
- §2: dos modos: `per_purchase_unit` (precio+unidad directos) y `per_pack` (**precio derivado por BD**).
- §2.1 "Unidad homogénea": si el proveedor cobra por unidad con contenido masa/volumen, la `purchase_unit` es litro/kilo, no unidad.
- §3: albarán cambia precio **solo con mapeo + factor válido**; precio fijo no cambia nunca; "manda el último proceso que escriba"; la actualización **solo cambia el importe**, nunca unidades ni modo.
- §5: conversión en recetas existe en cliente y BD y **deben coincidir** (invariante 6).
- §6: 6 invariantes (incl. coste cliente=BD).

### C2. Lo que cita el código (VERIFICADO)
5 ficheros de `src/` citan como SSOT `context/INGREDIENTS_PRECIOS_Y_ALBARANES.md`:
- `src/lib/ingredient-price-sync.ts:3`, `src/components/ingredients/IngredientWizard.tsx:1`, `src/lib/recipe-cost.ts:10`, `src/app/ingredients/page.tsx:2`, `src/app/dashboard/albaranes/actions.ts:3`.
- Ese fichero **ya no existe** en el repo (superseded por PRECIOS-Y-COMPRAS.md). **Citas rotas a un SSOT que no es el vigente.** VERIFICADO

### C3. Dónde está la fuente de verdad real por magnitud

| Magnitud | Productor actual | Implementación | ¿Único? |
|---|---|---|---|
| Precio actual `ingredients.current_price` | Albarán (trigger `handle_new_invoice_line`) + manual + pack (trigger `trg_ingredients_pack_pricing_sync`) | SQL | ❌ varios escritores; "manda el último" |
| Conversión receta→compra | TS `recipe-cost.ts` + BD `fn_recipe_line_cost`/`convert_pricing_qty` | doble (D21) | ❌ duplicación consciente, debe coincidir |
| Conversión albarán→compra | BD `invoice_line_price_to_purchase_unit` | SQL | ✅ (TS delega al RPC) |
| Conversión consumo staff→compra | BD `staff_consumption_qty_to_purchase_unit` | SQL | ✅ |
| Stock `stock_current` | Trigger `update_ingredient_stock_trigger` + RPC copiloto `actualizar_stock` | SQL | ❌ el copiloto escribe SIN rastro |
| Normalización sintáctica | 5 copias: `normalizeUnit`×3, `norm`, `canonicalPurchaseUnit` | TS | ❌ 5 implementaciones |

**Conclusión C:** la norma declara SSOT por magnitud, pero el código tiene múltiples productores en 4 de las 6 magnitudes. El caso más grave: `actualizar_stock` del copiloto modifica `stock_current` **sin crear movimiento** (viola la regla de MAPA-DE-CAPACIDADES "todo cambio de stock deja rastro").

---

## D. Duplicaciones y divergencias

### D1. Vocabularios de unidades (7 distintos) — VERIFICADO
1. Canónico compra/receta: `kg/g/l/ml/cl/ud` (`src/app/ingredients/page.tsx:18` `STANDARD_UNITS`; `src/lib/recipe-cost.ts:13` `MassVolumeUnit`).
2. Receta UI: `g/kg/ml/l/cl/ud` (`recipe-cost.ts:252-259` `RECIPE_UNIT_OPTIONS`).
3. Orden operativo (pedido): `pack/caja/ud/kg/pieza/l/g/ml/cl` (duplicada en `page.tsx:20` y `IngredientEditModal.tsx:41`).
4. Pedido UI: `pack/caja/unidad/kg/pieza/lt/otro...` (`OrderProductCard.tsx:33`).
5. Merma: `ud/kg/g/l/ml/pack/caja/pieza/bandeja/bolsa` (`WasteClient.tsx:22-34`).
6. Prompt IA importación recetas: `kg/g/l/ml/ud` (sin `cl`) (`recetas-import/actions.ts:89`).
7. Presets pack: `PACK_UNITS_PRESETS=[12,24]`, volúmenes 200-750 ml, 1-2 l (`IngredientExpressPricePanel.tsx:19-31`).

### D2. Normalizadores sintácticos duplicados (5) — VERIFICADO
- `normalizeUnit` `src/lib/recipe-cost.ts:19-28`
- `normalizeUnit` (local) `src/app/ingredients/page.tsx:23-32`
- `normalizeUnit` (local) `src/app/dashboard/inventory/InventoryClient.tsx:41-50`
- `normalizeWasteUnit` `WasteClient.tsx:36-54`
- `norm` `src/lib/ingredient-pack-pricing.ts:8-19`
- `canonicalPurchaseUnit` `src/lib/albaran-price-match.ts:91-105` → **devuelve `'kg'` ante cadena vacía o desconocida** (fallback silencioso peligroso).

### D3. Implementaciones de conversión (~8) — VERIFICADO
1. `convertToPurchaseUnitQuantity` `recipe-cost.ts:59-86` (masa/volumen, sin pack).
2. `convertToPurchaseUnitQuantityWithPackBridge` `recipe-cost.ts:132-167` (puente per_pack ud↔masa/vol).
3. `convertPricingQtyNumeric` `ingredient-pack-pricing.ts:170-192` + `convertPackUnitSizeToPurchaseUnit` `:38`.
4. SQL `convert_pricing_qty` (20260415140000; ampliado con `cl` en 20260513121500:36-50).
5. SQL `recipe_qty_to_purchase_unit_for_cost` (20260513121500:63-122).
6. SQL `invoice_line_price_to_purchase_unit` (20260515160700:11-36).
7. SQL `staff_consumption_qty_to_purchase_unit` (20260512200000:11-75).
8. SQL `normalize_pricing_unit` (20260415140000:25-47).
9. Conversión local de comparación `g→kg`, `ml→l` en `albaran-price-match.ts:110-122`.

**No localizada:** la definición de `canonicalPurchaseUnit` importada por `albaranes-precios/actions.ts:10` fuera de `albaran-price-match.ts` (la que se importa es `src/lib/albaran-price-match.ts:91`). `src/lib/actions/albaranes.ts:38` selecciona todas las columnas de unidad pero no las usa para precio en pedidos.

### D4. Duplicación consciente (D21)
El coste de receta existe en TS (`recipe-cost.ts`) y BD (`fn_recipe_line_cost` + `get_recipe_cost`). ARQUITECTURA §5 y PRECIOS-Y-COMPRAS §5 exigen **paridad**; DEUDA D21 dice que "nada lo comprueba". **Divergencia real detectada:** ante una línea con unidades incompatibles, la BD devuelve `0` (20260513121500:168-170) y el TS devuelve estado `incompatible_units` (recipe-cost.ts:202-204). En `recipes/[id]/page.tsx:580` manda la BD cuando responde → **una línea sin conversión se muestra como 0 € de coste**, contradiciendo el tratamiento del cliente (que la marcaría como "—"). VERIFICADO

---

## E. Conversión de unidades: cómo funciona cada cadena

### E1. Cadena de coste de receta (VERIFICADO)
```
recipe_ingredients(qty, unit) ──► convert_pricing_qty(qty, unit, purchase_unit) ──► current_price
                                     │ fallback per_pack: Puente A/B (ud↔masa/vol)
```
- TS: `recipe-cost.ts:132-167` directa → puente A (receta ud → compra g/kg/l: `qty × piece`) → puente B (receta masa/vol → compra ud: `qty / piece`).
- BD: idéntico en `recipe_qty_to_purchase_unit_for_cost` (20260513121500:63-122).
- `get_recipe_cost` (RPC) → `fn_recipe_line_cost` (9 args) → `converted NULL → RETURN 0`.
- `recipes/[id]/page.tsx:191` usa el RPC `get_recipe_cost`.

### E2. Cadena de precio desde albarán (VERIFICADO)
```
purchase_invoice_lines(unit_price, line_unit) ──► mapeo(supplier_item_mappings: conversion_factor + tríada)
   ──► invoice_line_price_to_purchase_unit(p_unit_price, tríada, ingredient.purchase_unit, fallback cf)
   ──► current_price (si difiere >1e-5 y no price_locked)
```
- Trigger `handle_new_invoice_line` (20260604140000:79-173) — vía automática; escribe precio y stock al mapear.
- **`line_unit` (OCR) NO participa en el precio**: el trigger y el RPC usan la tríada del mapeo o el fallback cf. VERIFICADO (20260515160700).

### E3. Cadena de stock (VERIFICADO)
Entradas: albarán → `PURCHASE` (quantity = línea × cf, unidad `ingredients.unit`). Salidas: venta → `SALE` (unidades × `factor_porcion` × `quantity_gross` × `umb_multiplier`, unidad `i.unit`), mermas/consumo → `WASTE`, recuento → `INVENTORY_COUNT`, rectificación → `ADJUSTMENT`. Trigger `update_ingredient_stock_trigger` (20260417100000:5-16): PURCHASE `+=ABS`, SALE/WASTE `−=ABS`, ADJUSTMENT/INVENTORY_COUNT `+=qty` (delta con signo).

**Ajuste SIN rastro:** RPC copiloto `actualizar_stock` (20260508153000:72-74) hace `UPDATE ingredients SET stock_current = stock_current + delta` **sin stock_movements**. Roles manager/admin/supervisor/chef. VERIFICADO

### E4. El stock negativo (VERIFICADO en datos)
- 77 ingredientes con `stock_current < 0`; totales por unidad: `ud` 40, `kg` 24, `l` 7, `u` 6.
- Ejemplos: Limón −31.888,85 (pu=kg, unit=g → −31,9 kg), Sal −20.362,29, Vasos 350ml −22.391,75 ud, Pinchos madera −3.436,5 ud.
- Causas probables (INFERIDO): (a) la venta descuenta con la unidad de receta/stock (`i.unit`) multiplicada por `quantity_gross` en la unidad de la línea, sin convertir a la unidad de stock del movimiento de entrada; (b) 176.780 movimientos SALE frente a 1.182 PURCHASE; (c) el consumo personal y las mermas también descuentan sobre un saldo que a menudo no se repone.

---

## F. Inconsistencias y defectos (ordenados por gravedad)

| # | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| F1 | Stock negativo masivo (77 ingredientes) por deducción por venta con unidades sin reconciliar | datos + 20260417120001:13,27 | CRÍTICA |
| F2 | `get_recipe_cost` devuelve 0 (no distingue causa) y el cliente muestra 0 € de coste en lugar de "—" | 20260513121500:168-170; page.tsx:580 | CRÍTICA (viola invariante 6) |
| F3 | `canonicalPurchaseUnit` mapea desconocido→`kg` silenciosamente | `albaran-price-match.ts:97` | ALTA |
| F4 | Ajuste de stock del copiloto sin rastro en `stock_movements` | 20260508153000:72-74 | ALTA (viola regla "todo cambio de stock deja rastro") |
| F5 | 6 columnas de unidad en `ingredients` con datos divergentes (`u` vs `ud`, `gr` vs `kg`) | datos + esquema | ALTA |
| F6 | 7 vocabularios + 5 normalizadores + ~8 conversiones sin SSOT compartido | §D | ALTA (raíz del problema) |
| F7 | SSOT citado por el código (`context/INGREDIENTS...`) ya no existe | 5 ficheros `src/` | ALTA (documental) |
| F8 | `waste_percentage` campo muerto | greps + datos (ninguno ≠ 0) | MEDIA |
| F9 | `get_recipe_cost` (SECURITY) vs `staff_consumption_*` divergen en fallo | 20260513121500 vs 20260512200000 | MEDIA |
| F10 | `ingredients.supplier_id` (text, sin FK) huérfana; vínculo por nombre | esquema + `orders/new/page.tsx:147` | MEDIA |
| F11 | `purchase_orders`/`order_drafts` sin conexión con stock; `unit_price=0` en items | `orders/new/page.tsx:224-250`; datos | MEDIA |
| F12 | Migración realtime de `order_drafts` vacía en disco ("!!") | `99990000000000_*.sql` | MEDIA |
| F13 | `voice_transcription` en `purchase_orders` es código muerto | types:2073-2074; sin escritores | BAJA |
| F14 | `recipes.articulo_id` nadie la escribe (SSOT es `map_tpv_receta`) | tipos:2210; sin escritores | BAJA |
| F15 | `bdp_articulos.coste`/`precio_base` sin datos (0/194) | datos | BAJA (externa) |
| F16 | 1.162 filas de `ingredient_price_history` todas con `changed_by=NULL` | datos | BAJA |
| F17 | `event_products.price` vs `v_digital_menu_items.precio` doble origen del precio de eventos | esquema | MEDIA (dominio eventos, fuera de alcance) |
| F18 | `get_recipe_cost` solo vs cliente: `recipes/[id]/page.tsx` mezcla ambos | §D4 | MEDIA |

---

## G. Casos reales (matriz de casos unidad/formato)

Matriz observada en datos reales (VERIFICADO):

| Caso | Ejemplo real | purchase_unit | Cómo se modela hoy | Problema |
|---|---|---|---|---|
| Precio por unidad suelta | Huevos, Damm | `ud` | per_purchase_unit directo | ok |
| Precio por unidad con texto `u` (legacy) | Estrella damm, Powerade | `u` (no normalizado) | per_purchase_unit con `u` | `u`≠`ud` en datos; los triggers normalizan solo al escribir |
| Precio por kilo | Patata, carne | `kg` | per_purchase_unit | ok |
| Precio por pack de unidades | Oreo sandwich (pack 1238,4 € / 24 ud) | `ud` | per_pack | **precio = 51,6 €/ud** → food cost 1.957 % |
| Precio por pack con contenido | Leche avena (pack 9,6 € / 6 ud × 1 l) | `l` | per_pack | `current_price=9,6` en vez de 1,6 €/l → desajuste |
| Precio por pack mixto | Frankfurt (pack 12,49 € / 16 ud × 12 ud) | `ud` | per_pack | 192 ud reales vs 16 → 0,065 €/ud |
| Precio por unidad con contenido vol | Vermut (3 € / 1 ud × 10 l) | `l` | per_pack homogéneo | ok (0,3 €/l) |
| Peso variable (piezas + kg) | (patrón documentado, no hay datos masivos) | `kg` | factor=1, cantidad=kilos | riesgo de introducir piezas |
| Bebida con contenido en ml | Colacao (8,34 € / 1 ud × 760 g) | `kg` | per_pack | 10,97 €/kg correcto |
| Ingrediente con `recipe_unit=kg` pero `base_unit=g` | 77 ingredientes | kg/g | default UI en kg | ok para UI, pero la línea de receta suele escribirse en g y eso es coherente |

**Caso estelar (VERIFICADO):** "Naranja Postre" (línea de albarán, up=1,7 €) mapeado a "Aquarius naranja". El mapping persiste en `supplier_item_mappings` (Ametller). El precio se revirtió a mano a 0,7 € el 2026-08-03, pero la causa raíz (mapeo automático sin validación) no se corrigió → puede repetirse.

**Datos de recetas patológicos (VERIFICADO):**
- Oreo Helado: venta 2,90 €, coste 51,60 € → **1.957 %**
- Pirulo Limón/Fresa: venta 1,80 €, coste 23,56 € → **1.440 %**
- Tropical: venta 1,80 €, coste 19,64 € → **1.200 %**
- Sangría de Cava: venta 22,00 €, coste 136,97 € → **685 %**
- Recetas con `sale_price=0` (no valorables): 39 de 158.

**Datos de unidades en `recipe_ingredients` (362 líneas):** `ud` 180, `g` 109, `ml` 36, `kg` 21, `l` 7, `u` 9 (no normalizado).

**Distribución `stock_movements` (181.560):** SALE 176.780, WASTE 3.440, PURCHASE 1.182, INVENTORY_COUNT 80, ADJUSTMENT 78.

---

## H. Modelo canónico propuesto (para la futura migración)

Principios del modelo canónico mínimo, derivados de la norma vigente:

1. **Una unidad canónica de compra por ingrediente**: `kg | l | ud` (masa/volumen/unidades). `g/ml/cl` son unidades de *receta* convertidas, no de compra. Invariante 1 (€/unidad de compra).
2. **Una sola familia de columnas de unidad** en `ingredients` en lugar de 6: `purchase_unit` (canónica) + `recipe_unit` (default UI) + `order_unit` (default pedido). `unit`, `base_unit`, `unit_type` deben **derivarse o retirarse**: `unit`≡`base_unit` (duplicado exacto en datos), `unit_type` es un duplicado de `purchase_unit` con valores legacy que hay que normalizar (`u`→`ud`, `gr`→`kg`).
3. **El formato del proveedor vive en `supplier_item_mappings`** (tríada `line_billing_unit + line_content_qty + line_content_unit`), no en `ingredients`. Ya es así; falta *obligarlo* (CHECK) y hacer determinista la selección del mapeo (ORDER BY; hoy sin él, 20260515160700).
4. **`current_price` siempre derivado**:
   - per_purchase_unit: introducido manualmente o por albarán con factor válido.
   - per_pack: solo por BD (trigger), nunca escrito a mano. Invariante 2.
5. **Una sola conversión canónica**: `convert(qty, from, to)` con dimensiones masa/volumen/contador, implementada en un único lugar por capa (TS y BD) con la **misma tabla de factores** y puentes per_pack. Eliminar los 5 normalizadores y 8 conversiones en favor de un normalizador + conversor compartidos.
6. **Los movimientos de stock son la única vía para cambiar `stock_current`** (regla de MAPA-DE-CAPACIDADES). Eliminar el `UPDATE` directo del copiloto.
7. **El coste de receta nunca devuelve 0 por fallo de conversión**: debe devolver estado explícito (ok | incompatible_units | missing_price) en ambos productores y hacerlos coincidir (invariante 6).
8. **Idioma**: unidades con un solo código normalizado (`ud`, no `u`/`un`/`unidad`; `kg`, no `gr`/`kilo`). El GLOSARIO y la norma lo exigen implícitamente; los datos lo incumplen.

---

## I. SSOT propuesto

| Concepto | Dueño | Productor único | Consumidores |
|---|---|---|---|
| Unidad de compra de un ingrediente | `ingredients.purchase_unit` (canónico) | formulario asistido | recetas, consumo, stock, albaranes |
| Formato del proveedor (caja/uds/contenido) | `supplier_item_mappings` (tríada + cf) | mapeo aprendido/confirmado | precio, stock |
| Precio actual | `ingredients.current_price` (€/unidad de compra) | albarán (con mapeo+factor) y manual, pack solo BD | recetas, mermas, consumo, escandallos |
| Conversión de unidades | 1 implementación TS + 1 SQL idénticas | — | todas las cadenas |
| Normalización sintáctica | 1 función compartida | — | todas las entradas de texto |
| Stock actual | `ingredients.stock_current` | trigger de `stock_movements` (único) | inventario, copiloto |
| Historial de precio | `ingredient_price_history` (con `changed_by`) | trigger/albarán/manual | auditoría |
| Ración y escandallo | `recipe_ingredients` (quantity_gross/half, unit) | ficha de receta | consumo, stock, coste |

**Regla transversal:** un cambio en la conversión o en el vocabulario de unidades debe tocar SOLO ese SSOT; los demás consumidores leen. Es la aplicación de PRINCIPIOS §3 (una magnitud, un productor).

---

## J. Impacto de no migrar (riesgo actual)

- **Económico directo**: food cost falsos (hasta 1.957 %) → decisiones de precio/carta equivocadas; consumo personal con importes erróneos (0 € donde debería ser "—").
- **Stock**: 77 ingredientes negativos hacen inusable el módulo de inventario como fuente de verdad; mermas y ajustes se acumulan sobre un saldo inconsistente.
- **Coste de cambio**: cada cambio de unidades requiere tocar ~8 implementaciones y 7 vocabularios → riesgo de divergencia permanente (D21) y defectos silenciosos (D19: sin tipos).
- **Conformidad con la norma**: el código incumple invariantes 2 y 6 de PRECIOS-Y-COMPRAS y la regla de rastro de stock de MAPA-DE-CAPACIDADES.

---

## K. Migración propuesta (a diseñar en la fase siguiente, no implementada aquí)

Fases sugeridas (orden propuesto; cada una es reversible y verificable):

1. **K1 — Cerrar el círculo documental**: re-apuntar las 5 citas de `src/` a PRECIOS-Y-COMPRAS.md.
2. **K2 — Normalizar datos de vocabulario**: en una transacción, `u`→`ud`, `gr`→`kg` en `ingredients.purchase_unit`/`unit_type`, `unitat`→`ud`, normalizar `unit` de `g/ml` según `purchase_unit`. Con backup y reporte de diffs.
3. **K3 — Deterministar la selección del mapeo**: añadir ORDER BY en el trigger/RPC de albarán para elegir mapeo estable.
4. **K4 — Convertir coste BD a estado explícito**: `fn_recipe_line_cost`/`get_recipe_cost` devuelven `null` o un jsonb con estado por línea; el cliente respeta el estado. Alinear con TS.
5. **K5 — Único camino a `stock_current`**: eliminar `actualizar_stock` del copiloto o reescribirlo para insertar `stock_movements`; añadir CHECK de `movement_type`.
6. **K6 — Consolidar conversión y normalización**: 1 normalizador + 1 conversor compartidos (TS) y su espejo SQL, con pruebas de paridad (K7).
7. **K7 — Pruebas de paridad**: comparar TS vs BD sobre un corpus de líneas reales; la divergencia bloquea.
8. **K8 — Reconciliar stock**: recalcular `stock_current` desde `stock_movements` (proyección), auditar los 77 negativos.
9. **K9 — Conectar pedido→stock** (opcional de producto): que `purchase_orders` alimente expectativa de recepción.
10. **K10 — Retirar columnas muertas** (`waste_percentage`, `base_unit`/`unit`/`unit_type` si derivadas, `supplier_id` huérfana) tras backfill y pruebas.

Toda migración con datos requiere: snapshot, script de validación previo/posterior, y ejecución en no productivo imposible (no hay entorno de pruebas — ARQUITECTURA §11). Se ejecuta contra BD real con backups.

---

## L. Riesgos de la migración y de los datos

- **Datos legacy irreparables**: `line_unit` OCR caótico (681 null, 44 `UNI`, 36 `caja`, 28 `CJ`, 27 `CAJA`, 19 `bolsa`, 15 `CA`, 8 `MAN`…) no es convertible; solo la tríada del mapeo es fiable para precio.
- **Sin entorno de pruebas** (ARQUITECTURA §11): cualquier script se prueba contra producción.
- **Historial sin autor**: `ingredient_price_history.changed_by` todo NULL → no se puede auditar quién cambió qué.
- **Doble productor del coste**: si K4 cambia BD y no TS, la divergencia empeora.
- **`order_drafts` realtime posiblemente roto** (migración vacía): el carrito de pedido podría no sincronizarse en vivo.
- **El fallback `unknown→kg`** de `canonicalPurchaseUnit` puede convertir una unidad desconocida en un precio de kg erróneo sin avisar.
- **Mañas en los números**: pack con `pack_unit_size_unit` en `cl` (Ketchup 500cl), `pack_unit_size_qty` decimales, packs `0 €` (Cava mix → current_price 0).

---

## M. Respuestas a las preguntas de cierre (15)

1. **¿Existe hoy una única fuente de verdad de las unidades?** No. La norma declara un SSOT conceptual (PRECIOS-Y-COMPRAS.md), pero los datos y el código tienen 7 vocabularios y 6 columnas de unidad en `ingredients`. VERIFICADO
2. **¿Qué unidades son canónicas en compra?** `kg | l | ud`. En receta: `g | kg | ml | cl | l | ud`. VERIFICADO (norma + código)
3. **¿Por qué hay `u` y `gr` en los datos?** Legacy de formularios anteriores; el trigger normaliza solo en escritura nueva (20260415140000:151-155), no sobre datos. VERIFICADO
4. **¿`base_unit` y `unit` son lo mismo?** En los datos, sí (misma distribución 118/79/29). Duplicado innecesario. VERIFICADO
5. **¿El albarán cambia precios sin validación humana?** Sí: el trigger `handle_new_invoice_line` escribe `current_price` automáticamente al insertar la línea mapeada, solo con `price_locked` + tolerancia 1e-5 como freno (FASE 1). VERIFICADO
6. **¿`applyAlbaranPriceUpdatesAction` respeta `price_locked`?** No. No lo comprueba ni escribe historial (FASE 1, `albaranes-precios/actions.ts`). VERIFICADO
7. **¿La venta descuenta stock?** Sí, vía webhook BDP→`process_ticket_stock_deduction` (SALE), con unidades de receta sin conversión a la de stock de entrada; idempotente por `TICKET-<n>`. VERIFICADO
8. **¿Por qué hay stock negativo?** Por la deducción por venta masiva (176.780 SALE) sobre saldos que raramente se reponen (1.182 PURCHASE) y con unidades no reconciliadas. INFERIDO (causa parcialmente verificada)
9. **¿El consumo personal descuenta stock?** Sí, como `WASTE` (reference STAFF-*). Si la conversión falla, no descuenta y queda en `staff_consumption_register_errors`. VERIFICADO
10. **¿El pedido a proveedor escribe stock?** No. Termina en PDF/WhatsApp; `purchase_order_items.unit_price=0`. El stock entra por albarán, sin conexión con `purchase_orders`. VERIFICADO
11. **¿`waste_percentage` se usa?** No. Campo muerto: solo formularios; ni coste ni stock lo leen. VERIFICADO
12. **¿`get_recipe_cost` distingue "sin precio" de "unidades incompatibles"?** No. Devuelve 0 en ambos casos (20260513121500:168-170); el TS sí los distingue (`recipe-cost.ts:202-209`). VERIFICADO
13. **¿El copiloto puede ajustar stock sin rastro?** Sí: `actualizar_stock` hace UPDATE directo de `stock_current`. VERIFICADO
14. **¿Dónde se elige `per_pack` vs `per_purchase_unit`?** En el asistente `IngredientWizard` y `IngredientEditModal` (`supplier_pricing_mode`), con previsualización de precio derivado. VERIFICADO
15. **¿Cuál es el mayor riesgo de la migración?** Reconciliar los 77 ingredientes con stock negativo y decidir el estado de las líneas de receta incompatibles antes de tocar la conversión; y la ausencia de entorno de pruebas que obliga a ejecutar contra producción. INFERIDO

---

## N. Archivos de referencia (evidencia completa)

- Informes de fase 1 y 2 en el historial de la sesión.
- `marbella-os/3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md` (norma vigente)
- `marbella-os/3-ingenieria/MODELO-DE-DATOS.md` (D19, D21, autoridad)
- Migraciones: `20260415140000`, `20260513121500`, `20260515160700`, `20260604140000`, `20260417100000`, `20260417120001`, `20260417180001`, `20260423120000`, `20260508153000`, `20260512200000`, `20260613140000`, `20260524150000`, `20260523120000`, `20260531100000`, `20260517140000`, `99990000000000`
- Código: `src/lib/recipe-cost.ts`, `src/lib/ingredient-pack-pricing.ts`, `src/lib/albaran-price-match.ts`, `src/lib/ingredient-price-sync.ts`, `src/app/dashboard/albaranes/actions.ts`, `src/app/dashboard/albaranes-precios/actions.ts`, `src/lib/actions/albaranes.ts`, `src/app/orders/new/page.tsx`, `src/components/orders/OrderProductCard.tsx`, `src/app/recipes/[id]/page.tsx`, `src/app/staff/actions.ts`, `src/app/api/webhooks/bdp/ventas/route.ts`, `src/app/dashboard/inventory/actions.ts`, `src/app/dashboard/inventory/waste/actions.ts`
- Datos reales (BD `feqjbwxkelpgzsdiphei`), scripts solo-lectura en `/tmp/opencode/`
