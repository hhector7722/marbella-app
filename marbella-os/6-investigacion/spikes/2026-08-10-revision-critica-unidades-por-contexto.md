---
documento: SPIKE-REVISION-CRITICA-UNIDADES-POR-CONTEXTO
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-10
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA, DEUDA, MAPA-DE-CAPACIDADES
---

# Revisión crítica — Unidades por contexto

> **MATERIAL NO NORMATIVO — SPIKE-REVISION-CRITICA-UNIDADES-POR-CONTEXTO**
>
> Esto es un análisis fechado el 2026-08-10, no una norma. **No autoriza ninguna decisión** ni modifica el sistema. Valida el modelo propuesto del plan de migración y anota correcciones.
>
> La norma vigente vive en `marbella-os/`; la jerarquía que la ordena, en `marbella-os/CANON.md`. Ante cualquier discrepancia gana el documento normativo, sin discusión.

**Fecha:** 2026-08-10 · **Modo:** solo lectura (código + SELECT/RPC en BD real) · **Repo:** `marbella-app`
**Convención de etiquetas:** VERIFICADO (código, migraciones o datos reales) · HEREDADO (del plan o la auditoría) · PROPUESTO (del modelo canónico) · EN ERRATA (corrección señalada al plan).

---

## 1. Veredicto ejecutivo

**Sí. El modelo canónico propuesto en `SPIKE-PLAN-MIGRACION-DOMINIO-PRODUCTO-UNIDADES` resuelve formal y correctamente la cuestión central: un mismo producto puede usar unidades distintas según el contexto, y la distinción entre Conversión universal (dimensional) y Composición de una presentación comercial está blindada en el diseño.**

La base lo permite:

- **`units` + `unit_dimensions`**: unidades físicas con dimensión (`mass`, `volume`, `count`). §10.1-10.2 del plan.
- **`unit_conversions`**: conversiones DIMENSIONALES exactas (`g↔kg`, `ml↔l`), sin scope → universales. §12.2, §12.4.
- **`product_presentations` / `supplier_product_presentations`**: la composición comercial (`1 caja = 24 ud`, `1 pack = 6×1 L`), con `contains_qty + contains_unit_id` y **scope**, jamás como regla global. §10.3, §11, §11.3.
- **`products.default_buy_unit_id / default_stock_unit_id / default_recipe_unit_id`**: el producto tiene 3 unidades canónicas independientes por contexto. §9.2.
- **Motor de coste canónico** (`RecipeCostService` TS ↔ `fn_recipe_line_cost_v2` SQL) que convierte `recipe_unit → buy_unit` vía `unit_conversions` y luego multiplica por `product_prices.price_eur €/buy_unit`. §21, §24.6.
- **`v_current_stock` proyección** de `stock_movements` (que llevan `stock_unit_id` FK). §17.

La distinción crítica (prohibida por el usuario) se mantiene: **«caja»/«pack»/«saco» NO entran en `units` como conversiones universales; son instancias de `product_presentations` (o `supplier_product_presentations`) que agrupan unidades atómicas.** §10.3 del plan es explícita al respecto y es el punto más fuerte del diseño.

Esta revisión aporta, además de la validación, **cuatro correcciones en forma** (§6) y una matriz de contextos operativa (§8) y tests (§9) que el plan no incluía con la precisión exigida.

---

## 2. Método

1. Lectura completa del plan canónico (`SPIKE-PLAN-MIGRACION-DOMINIO-PRODUCTO-UNIDADES`, 2026-08-10) y de la auditoría heredada (`SPIKE-AUDITORIA-DOMINIO-PRODUCTO-UNIDADES`) y de la norma vigente (`DOMINIO-PRECIOS-Y-COMPRAS`, `MODELO-DE-DATOS`, `DEUDA`, `GLOSARIO`).
2. Verificación read-only en el código y en la BD real (`feqjbwxkelpgzsdiphei`) en 2026-08-10:
   - La ausencia de las tablas canónicas propuestas.
   - El RPC real `get_recipe_cost(p_recipe_id, p_use_half_ration)` y `fn_recipe_line_cost`.
   - Los valores reales de `ingredients` para los casos (Oreo, Leche, Aceite, Harina, Colacao).
3. Mapeado de cada ejemplo del enunciado del usuario contra el modelo propuesto, citando `archivo:línea` o `plan §`.

---

## 3. Principios y cómo los resuelve el modelo (validación de la sección 6 del enunciado)

| # | Principio del enunciado | Resolución canónica |
|---|---|---|
| 1 | Unidad de compra puede distinta de stock/receta/venta | `products.default_buy_unit_id`, `default_stock_unit_id`, `default_recipe_unit_id` FK a `units`. §9.2, §9.5. |
| 2 | Unidad de recepción distinta de stock | Recepción `reception_lines.quantity_unit_id` → `stock_unit_id` via `convert()`. §15.4, §16.2. |
| 3 | Compra distinta de stock | `PURCHASE` movement: `convert(presentation_qty → stock_unit_id)`. §15.4. |
| 4 | Pedido distinto de recepción | `purchase_order_items.presentation_id` (compra cajas) ≠ `reception_lines` (confirmado ud). §15.2-15.3. |
| 5 | Presentación comercial ≠ unidad física | `product_presentations` (`contains_qty, contains_unit_id, presentation_kind`). §10.3, §11. |
| 6 | Toda conversión explícita | `unit_conversions(from_unit_id, to_unit_id, factor_numeric, ...)`. §12.2. |
| 7 | Nunca interpretar silenciosamente | Estado `CONVERSION_MISSING`/`INCOMPATIBLE_UNITS` (motor de coste §21.1). |
| 8 | Nunca factor=1 como fallback | §13.4 regla 2: sin factor válido → `PRICE_REVIEW_REQUIRED`. §27.2 `REQUIRES_REVIEW`. |
| 9 | Conversiones universales ≠ de presentación | `unit_conversions` universal (sin scope) vs `product_presentations.supplier_product_presentations` (con contenido). §12.2, §12.3, §10.3. |
| 10 | Todo precio tiene unidad | `product_prices.reference_buy_unit_id` FK NOT NULL. §13.2. |
| 11 | Receta conserva qty+unidad | `recipe_lines.quantity_qty + quantity_unit_id` FK. §20.1. |
| 12 | Coste convierte receta→buy | `line_cost = convert(recipe_qty, recipe_unit → buy_unit) × price_eur/buy_unit`. §21.1. |
| 13 | Stock convierte movimientos→stock_unit | `stock_movements.stock_unit_id`; `v_current_stock` agrupa por `stock_unit_id`. §17.1-17.2. |
| 14 | Conversión inexistente = estado explícito | §11.2 (tabla) y §31.1-20 (no devuelven 0/factor 1). |
| 15 | Unidad mostrada ≠ nueva verdad | §26.3 "UI pinta; no interpreta": badge de estado, nunca normaliza a kg por desconocida. |
| 16 | Histórico conserva precio+unidad | `product_price_history` INSERT-only con `reference_buy_unit_id` snapshot + preservación de `ingredient_price_history` legacy. §13.5, §23.3. |

---

## 4. Casos del enunciado validados contra el modelo (con datos reales comprobados)

> Nota de proceso: los valores reales usados para validar provienen de `ingredients` en la BD `feqjbwxkelpgzsdiphei`, leídos el 2026-08-10. Las tablas canónicas propuestas (`units`, `unit_conversions`, `product_presentations`, `products`, `product_prices`, `v_current_stock`) **no existen en la BD real** — son PROPUESTO del plan K8/K9. Verificado con `sb.from('units').select()` → "Could not find the table 'public.units'".

### 4.1 CASE Aceite (conversión universal) — TEST A

- **Producto:** Aceite de oliva virgen extra (`ingredients` real: `purchase_unit=l`, `current_price=30.99 €/l`, `pack_price=154.95`, `pack_units=1`, `pack_unit_size_qty=5`, `pack_unit_size_unit=l`, `mode=per_pack`, `unit=ml`).
- **¿Dónde se define L?** `products.default_buy_unit_id → units.code='l'` (PROPUESTO §9.2). Hoy lo define `ingredients.purchase_unit='l'` (columna legacy).
- **¿Dónde se define ml?** `units.code='ml'`, dimensión `volume`, `si_scale=0.001` (PROPUESTO §10.2). Hoy `recipe_lines.quantity_unit_id` apuntaría a `ml` (§20.1 migración de `recipe_ingredients.unit`).
- **¿Dónde está la conversión ml→L?** `unit_conversions(from='ml', to='l', factor=0.001)` universal (sin scope). PROPUESTO §12.2, §12.4. Es una conversión DIMENSIONAL, no de presentación.
- **¿Dónde se almacena €/L?** `product_prices.price_eur + reference_buy_unit_id='l'` (PROPUESTO §13.2); hoy `ingredients.current_price=30.99` (ya en €/L, el trigger la normalizó bien aquí: 154.95/5=30.99).
- **¿Dónde se almacena la unidad de la línea de receta?** `recipe_lines.quantity_unit_id` FK. §20.1.
- **¿Qué motor convierte?** `UnitConversionService` (TS) ↔ `convert_unit_canonical` (SQL), misma tabla. §25.1.
- **Resultado:** `10 ml → convert(10, ml→l)=0.010 L → 0.010 × 30.99 = 0.3099 €`. El comprador real paga 154.95 €/5L; una ración de 10 ml cuesta 0.31 €. ✓

### 4.2 CASE Harina (conversión universal) — TEST B

- **Producto:** Harina (`ingredients` real: `purchase_unit=kg`, `current_price=2.99 €/kg`, `unit=g`).
- **Conversión g↔kg:** `unit_conversions` universal, factor 0.001. §12.4.
- **Resultado:** `150 g → 0.150 kg → 0.150 × 2.99 = 0.4485 €` (ejemplo del enunciado usa 2.50 €/kg; con 2.99 real = 0.45 €). ✓

> **EN ERRATA 1 (modelo correcto, caso de prueba del plan con valor ilustrativo):** el enunciado y el plan §11.2.3 proponen Harina a 2.50 €/kg; el dato real es 2.99 €/kg. La mecánica es idéntica. La discrepancia del precio no afecta al modelo.

### 4.3 CASE Coca-Cola (composición de presentación) — TEST C

- **Producto maestro (PROPUESTO §11.2.1):** «Refresco de cola», `default_buy_unit_id=ud`, `stock_unit_id=ud`, `recipe_unit_id=ud`. Hoy no existe como producto maestro (no hay ingrediente «Coca-Cola» en `ingredients`; el patrón real se observa en **Oreo sandwich**: `purchase_unit=ud`, `pack_units=24`).
- **Presentación:** `product_presentations(kind='caja', contains_qty=24, contains_unit_id='ud')`. §11.2.1. Esta relación (caja↔24 ud) **no es universal**: vive en `supplier_product_presentations` de Coca-Cola, no en `unit_conversions`. §12.3.
- **Precio:** albarán `20 €/caja` → PRESENTATION PRICE §13.1; normalizado = `presentation_price / convert_qty(presentation_qty=1 caja → buy_unit=ud)` = `20 € / 24 ud = 0.833333 €/ud`. §12.3, §13.4.
- **Resultado:** `1 ud receta → 0.833333 €/ud × 1 ud = 0.833333 €`. ✓ La «caja» NO es una unidad física global; es una presentación concreta. §10.3.

**Caso real equivalente (VERIFICADO):** Oreo sandwich, `pack_price=1238.4, pack_units=24, current_price=51.6 €/ud`. El trigger ya normalizó 1238.4/24=51.6. Pero el valor 51.6 €/ud es un **precio de ingrediente erróneo** (no un fallo de normalización). Ver §6 (EN ERRATA 2).

### 4.4 CASE Leche (presentación + contenido volumen) — TEST D

- **Producto maestro:** Leche, `default_buy_unit_id='l'`. (Dato real `ingredients`: Leche avena `purchase_unit=l`, `pack_price=9.6`, `pack_units=6`, `pack_unit_size_qty=1`, `pack_unit_size_unit=l`, `current_price=9.6`.)
- **Presentación:** `Pack 6 × 1 L` → `product_presentations(kind='pack', contains_qty=6, contains_unit_id='ud')`; sabiendo 1 ud = 1 L, el contenido total en buy_unit = 6 L.
- **Precio:** `9.60 €/pack → 9.60 € / 6 L = 1.60 €/L`. §13.4.

> **EN ERRATA 2 (dato real verificado = 9.6 €/L, NO 1.6 €/L):** en `ingredients`, `Leche avena.current_price=9.6` y `purchase_unit=l`. El trigger **no dividió** 9.6 €/6 L; dejó 9.6 €/L. Verificado: `SELECT current_price FROM ingredients WHERE name ILIKE '%leche avena%'` → `9.6`, `pack_units=6`, `pack_unit_size_qty=1`, `pack_unit_size_unit='l'`. El modelo PROPUESTO (§13.4) sí normaliza a 1.60 €/L, pero la corrección implica **re-calcular/re-cargar** los precios históricos (K9 backfill con la regla correcta) y **no** asumir que `current_price` legacy está normalizado. Afecta K9 y §29.2 shadow (el diff 9.6 vs 1.6 es >0.01 € → bloqueante, correctamente).

### 4.5 CASE Compra → Stock — TEST E

- **Proveedor:** 1 caja = 24 ud. Compra 3 cajas.
- **Recepción:** 2 cajas + 5 ud.
- **Stock:** `2×24 + 5 = 53 ud`.
- Modelo: `purchase_order_items.presentation_id` (3 cajas, kind=caja, contiene 24 ud) → `reception_lines` permiten mezclar cajas y ud → `stock_movements` PURCHASE en `stock_unit_id='ud'` con `qty = convert(presentation_qty → ud)`. §15.4, §17.2. El usuario **no** escribe 77 ud; escribe 3 cajas y el sistema las expande. ✓

### 4.6 CASE Stock → Receta — TEST F

- **Stock:** 25 L. **Receta:** 10 ml. **Consumo:** `10 ml → convert(10, ml→l) = 0.010 L → movement −0.010 L` (NO −10 L). §19.2.
- El producto (`stock_unit_id='l'`) consume en su unidad de stock; la receta escribe en `ml` (`recipe_lines.quantity_unit_id='ml'`) y el motor convierte dimensional. ✓

### 4.7 CASE Inventario — TEST G

- **Stock:** 25 L. **Físico:** 24.7 L. **Ajuste:** −0.3 L → `movement ADJUSTMENT qty=−0.3, stock_unit_id='l'`. §17.3, §18.
- La UI puede renderizar `24.700 ml` como **representación** (frontend multiplica por 1000 para display) pero la proyección `v_current_stock` agrupa por `stock_unit_id='l'` real. La "24700 ml" no crea nueva verdad: §26.3. ✓

### 4.8 CASE Venta (cadena completa)

- **Venta:** 1 ración del plato que contiene 10 ml de aceite.
- `ticket_lines_marbella → map_tpv_receta.articulo_id → recipe_id`. §19.2.
- Para cada `recipe_line`: `convert(qty=10, recipe_unit='ml' → buy_unit='l') = 0.010 L` → **movement SALE en `stock_unit_id='l'`, qty=−0.010 L**. §19.2 paso 3-4.
- Si `buy_unit='ud'` y receta `ml` (sin puente presentación con contenido): `INCOMPATIBLE_UNITS` → tabla `CONSUMPTION_FAILED`, **no** descuenta ciego ni devuelve 0. §19.2, §32 T21. ✓

### 4.9 CASE Proveedores diferentes (mismo producto, distintas presentaciones)

- **Aceite de oliva (producto maestro único)**; proveedores A/B/C.
- Cada `supplier_product` tiene su `supplier_product_presentation` con `content_total_qty + content_total_unit_id` y `presented_price_eur` (ej. €/pack, €/caja, €/L). §11.3, §13.1.
- Normalización a €/L (buy_unit) para comparar: `presentation_price / convert_qty(presentation_qty → buy_unit='l')`. §13.4.
- Se preserva: proveedor, presentación, cantidad comprada, precio original. §13.1 taxonomía (PREMIUM PRESENTATION PRICE ≠ NORMALIZED). ✓

### 4.10 CASE Receta flexible (unidad editable, no doble verdad)

- `recipe_lines.quantity_unit_id` FK (ej. `ml` o `l`); `10 ml` y `0.01 l` se resuelven a la misma magnitud física porque ambas apuntan a unidades con conversión. §20.1, §21.1. La elección UI es decisión de uso, no fuente nueva. ✓

### 4.11 CASE Dimensionalidad (imposible g↔L sin relación)

- El CHECK de `unit_conversions` exige `from.dimension == to.dimension` salvo `scope_product_id` puente. §24.3. `kg↔l` → `CONVERSION_MISSING`. §32 T04.
- `1 botella = 750 ml` es `supplier_product_presentation(content_total_qty=750, content_unit_id='ml')`, **no** una conversión universal. §12.3 (scope_presentation). ✓

### 4.12 CASE Histórico (preservación)

- `purchase_invoice_lines.observed_*` conserva el OCR crudo; `verified_*` conserva precio+unidad de presentación (ej. `20 €/caja`). `product_price_history` preserva el normalized. §27.1, §13.1, §13.5. Nunca se sobreescribe: `ingredient_price_history` legacy se mantiene (§13.5). ✓

---

## 5. Tests de aceptación A–G (modelados contra el modelo canónico)

| Test | Escenario | Resolución en el modelo | Estado |
|---|---|---|---|
| **TEST A** `8 €/L + 10 ml = 0.08 €` | Aceite: buy `l`, receta `ml` | `convert(10, ml→l)=0.010; 0.010 × 8 = 0.08`. Conversión universal. §4.1, §12.4 | ✅ Modelo lo resuelve |
| **TEST B** `20 €/caja + 24 ud/caja + 1 ud = 0.833333 €` | Coca-Cola: presentación `caja 24 ud`, precio presentación, receta `ud` | `20 € / 24 = 0.833333 €/ud (normalized); receta 1 ud → buy_unit ud, sin conversión dimensional; line_cost=0.833333`. §4.3, §11.2.1, §13.4 | ✅ Modelo lo resuelve |
| **TEST C** `9.60 €/pack + 6×1L + 250 ml = 0.40 €` | Leche: presentación `pack 6×1 L`, receta `ml` | `9.60 / 6 L = 1.60 €/L; convert(250, ml→l)=0.25 L; 0.25 × 1.60 = 0.40 €`. §4.4, §12.3 | ✅ Modelo lo resuelve |
| **TEST D** `3 cajas + 24 ud/caja + 2 cajas + 5 ud = 53 ud` | Compra/recepción/stock | presentación `caja 24 ud`; recepción permite mezclar; `PURCHASE` en `stock_unit_id=ud`. §4.5, §15.4 | ✅ Modelo lo resuelve |
| **TEST E** `25 L stock + 10 ml consumo = 24.990 L` | Movimiento SALE | `convert(10,ml→l)=0.010 L`; `stock_unit_id=l`. §4.6, §19.2 | ✅ Modelo lo resuelve |
| **TEST F** `6×1L=48 €` y `12×500 ml=52 €` → €/L | Proveedores distintos | `48/6 L = 8 €/L`; `52 / (12×0.5 L)=52/6 L = 8.667 €/L`. §4.9 | ✅ Modelo lo resuelve |
| **TEST G** `kg → L` conversión inexistente | Dimensionalidad | `CONVERSION_MISSING` (CHECK dimension). §4.11, §32 T04/T06/T23/T27 | ✅ Modelo lo resuelve |

Los tests A–G del enunciado se validan contra el modelo propuesto del plan. El punto esencial (casos de prueba del plan): **A–G están respaldados por §11.2, §12.3, §13.4 y §29.2 del plan.**

---

## 6. Hallazgos críticos de la revisión (lo que el plan debe ajustar)

### 6.1 EN ERRATA 1 — El plan §21.3/T08/T11 razona mal el caso Oreo

El plan §21.3 afirma: *"precio actual Oreo = 51.6 €/ud en lugar de 51.6/24 = 2.15 €/ud"* y §32 **T08/T11** dice *"51,6 €/caja 24 ud → 2,15 €/ud"*.

**Dato real verificado (BD 2026-08-10):** `Oreo sandwich.current_price = 51.6`, `pack_price = 1238.4`, `pack_units = 24`. El `current_price` **ya está en €/ud** (1238.4/24 = 51.6). No es "precio por caja interpretado como unitario"; es **precio unitario 51,6 €/ud**, que es un valor absurdo para una unidad de Oreo (o bien el pack_price 1238.4 € correspondía a otra configuración).

- **Implicación:** dividir 51.6/24 (como propone el plan) produciría 2.15 €/ud, ¡pero 2.15 no es el precio correcto tampoco! El dato correcto requiere consultar el albarán de origen del pack (¿1238.4 es el pack de 24? ¿o es el pack_price de una presentación distinta?). La corrección real no es aritmética de normalización, es **re-asignar el precio maestro desde el albarán verificado** (§13.3 K9) o **ajuste manual con historia** (§13.5).
- **Acción al plan:** corregir §21.3, §32 (T08: cambiar a `51,6 €/ud (precio mal cargado) → re-intentar desde albarán; si no, ajuste manual registrado`; T11: `Oreo Helado coste = current_price mal cargado; food cost 1957% → tras corregir precio a ~2.15 €/ud la ración 1 ud ≈ 2.15 €/ración → food cost ~74%`). §32 T08/T11 → estado: revisar.
- **TEST nuevo propuesto:** *T28 Oreo precio mal cargado → no se normaliza por algoritmo; se marca `PRICE_ANOMALY_REVIEW`, el food cost display avisa y no se publica normalización automática.*

### 6.2 EN ERRATA 2 — Leche avena (9.6 €/L ≠ 1.6 €/L): la normalización legacy falló y el plan debe reforzar el backfill

Verificado: `current_price=9.6` (debierto ser 1.6 €/L). El modelo canónico normaliza bien (§13.4), pero el backfill de K9 debería incluir un **caso de prueba explícito de packs volumétricos** (no solo `unit_price=0`).
- **Acción al plan:** Añadir a §29.2 (shadow) una fila: `Precio Leche: legacy 9.6 €/L vs canónico 1.6 €/L → diff bloqueante; normalizar antes de K9`. Añadir T22 variante: *T22b Leche avena 9.6 €/pack 6×1L normalizado a 1.60 €/L*.
- **Riesgo:** si K9 backfill copia `current_price` como normalizado sin re-calcular packs, el error se congela. K9 debe derivar `product_prices` de `pack_price/pack_units` + contenido, no copiar `current_price`.

### 6.3 Hallazgo HCR1 — Aclarar el propietario único de la composición caja↔ud

El plan propone **dos** lugares donde podría vivir "1 caja = 24 ud":
- `unit_conversions` con `scope_presentation_id` (§12.2, ejemplo Coca-Cola "caja↔ud = 24").
- `supplier_product_presentations.content_total_qty/unit` (§11.3).

Esta duplicidad es un riesgo de divergencia (principio 12 del plan: "No existen dos implementaciones semánticamente distintas").

- **Resolución recomendada:** la composición `presentación → unidades atómicas` **solo vive en `product_presentations` / `supplier_product_presentations`** (contiene `contains_qty + contains_unit_id`, y `content_total_*` en buy_unit). `unit_conversions` queda **solo para conversiones DIMENSIONALES** (g↔kg, ml↔l) con scope=NULL o scope=producto(puente ud↔masa, §12.2 ejemplo ColaCao). Eliminar el ejemplo §12.2 "caja↔ud=24 vía scope_presentation_id" y reemplazarlo por: la conversión `presentation→buy` se deriva de la presentación, no de una `unit_conversion`.
- **Acción al plan:** §12.2 (eliminar ejemplo Coca-Cola de unit_conversions; pasarlo a §11.3), §12.3 (clarificar: la división €/caja→€/ud usa `content_total_qty`), §28.1 servicio `UnitConversionService` (solo dimensiones; la arithmetical precio-usa `ProductPriceService`).

### 6.4 Hallazgo HCR2 — "contenido por unidad" (1 botella = 1 L) no está modelado explícitamente

Caso Leche §11.2.2 y §4.4: la presentación es `Pack 6 × 1 L` con `contains_qty=6, contains_unit_id='ud'`, pero "1 ud = 1 L" debe venir de algún atributo. El plan lo deja como "conversión puente en producto" (ambigüedad).

- **Resolución recomendada:** añadir a `product_presentations` un atributo **`piece_volume_qty + piece_volume_unit_id`** (o mejor, vincular `contains_unit_id` a una unidad que ya sea `l`/`kg` cuando la presentación agrupa volumen/masa). Formalizar el invariante: **el contenido de una presentación se expresa en `contains_unit_id`, y el normalizado a `buy_unit` requiere una conversión dimensional explícita.**
- **Acción al plan:** §11.1 (añadir `piece_content_qty`/`piece_content_unit_id` opcional), §10.4 tabla de migración (caso Leche: `pack_unit_size_qty=1, pack_unit_size_unit='l'` → `piece_content_qty=1, piece_content_unit_id='l'`, presentación pack contiene 6 de esas).

---

## 7. Modelo validado (el diseño canónico que hay que construir)

```
[UNIT_DIMENSION] 1──N [UNIT]
     mass,g,kg         volume: ml,cl,l      count: ud
       │                    │
       └──N [UNIT_CONVERSION] (solo DIMENSIONAL, factor global)
              from_unit_id ──factor──► to_unit_id   (ej. ml→l = 0.001)

                       ┌─ scope_product_id (puente ud↔g/ud↔ml, ej. 1 ud ColaCao = 760 g)
                       └─ (NUNCA caja↔ud aquí)

[PRODUCT] 1──N [PRODUCT_PRESENTATION] 1──N [SUPPLIER_PRODUCT_PRESENTATION]
   buy_unit_id          (caja 24 ud)        (Carrefour: caja 24 ud, €/caja)

   precio maestro:  [PRODUCT_PRICE]  (price_eur, reference_buy_unit_id)
   histórico:       [PRODUCT_PRICE_HISTORY]  INSERT-only

[STOCK_MOVEMENT] ──► [v_current_stock]  (proyección, por stock_unit_id)

[RECIPE_LINE] ──convert(recipe_unit→buy_unit)──► [PRICE €/buy_unit] ──► coste línea
```

Puntos de inmovilidad (nada debe escribirse a mano):
1. Toda cantidad lleva `*_unit_id` FK (§31.1 inv.1).
2. `stock_current` es VIEW `v_current_stock`; trigger `update_ingredient_stock_trigger` se retira en K10 (§17.1, §24.5).
3. `actualizar_stock` RPC UPDATE directo se REVOKE en K5 (§28.1 R5, §24.6).
4. `canonicalPurchaseUnit` nunca devuelve `kg`; devuelve estado `unknown` → UI `REQUIRES_REVIEW` (§10.3, §27.2, §25.4).

---

## 8. Matriz de contextos (operativa, completa)

| Contexto | Ejemplo | Unidad típica | Fuente de verdad | Conversión necesaria | Universal o presentación |
|---|---|---|---|---|---|
| Proveedor (factura) | caja Coca-Cola | caja (presentación) | `supplier_product_presentations` | — | presentación |
| Pedido | 3 cajas | caja | `purchase_order_items.presentation_id` | presentación → ud (×24) | presentación |
| Compra (albarán) | 3 cajas + notas | caja | `purchase_invoice_lines` (observado/verificado) | presentación → buy_unit | presentación |
| Recepción | 2 cajas + 5 ud | caja/ud | `reception_lines` (mixto) | → stock_unit | presentación + dimensional |
| Stock | 53 ud | ud | `v_current_stock` (proyección) | — | — |
| Inventario | 52 ud | ud | `inventory_counts` | ↔ stock_unit | — |
| Receta | 10 ml | ml | `recipe_lines.quantity_unit_id` | ml→buy_unit (dimensional) | universal |
| Precio/maestro | 0.833333 €/ud | ud (buy_unit) | `product_prices.price_eur + reference_buy_unit_id` | presentation→buy_unit | presentación (una vez) |
| Coste/línea | 0.08 € | € | motor canónico (TS↔SQL) | convert(recipe→buy) × price | universal + presentación |
| Venta | 1 ración | ud (recipe) | `ticket_lines→recipe` | recipe→stock_unit | universal + puente |
| Consumo staff | 1 ración | ud/ml/g | `recipe_lines` | recipe→buy_unit | universal + presentación |

Esta matriz reemplaza parcialmente la tabla de impacto del plan §34 y la sección §8 (SSOT) de la auditoría; está alineada con los invariantes §31.

---

## 9. Invariantes ampliadas (validación del §22 del enunciado + modelo)

1. Una única fuente de verdad por concepto. — §8 SSOT del plan ✓
2. Una única semántica de dominio. — §7.1 Principios canónicos ✓
3. Conversiones deterministas. — §12 `unit_conversions` ✓
4. Trazabilidad completa. — §24 triggers + `source_system` ✓
5. Separar datos: maestros / transaccionales / históricos / derivados / observados. — §7.3, §27.1 ✓
6. Producto maestro independiente del proveedor. — §9.1 (UUID preservado), §31.1 inv.6 ✓
7. Presentación comercial separada de unidad física. — §10.3 (clauzo: caja/pack NO son unidades dimensionales) ✓
8. No confundir SSOT con «una única unidad para todo». — Este spike valida que NO se confunde: buy/stock/receta/venta pueden diferir. ✓ **CONCLUSIÓN CENTRAL**
9. Frontend no redefine reglas de dominio. — §26.3 ✓
10. SQL/BE/FE no mantienen conversiones divergentes. — §25.1 servicios + §32 T05 paridad ✓
11. IA/OCR = observado, no verdad maestra. — §27.1 ✓
12. No usar factor=1 si cambia significado. — §13.4, §27.2 ✓
13. No inventar conversiones ambiguas. — §13.4 (REQUIRES_REVIEW) ✓
14. Preservar histórico. — §13.5, §23.3 ✓
15. Extensible (no depender de cajas/Coca-Cola). — §10.3 scope por producto/presentación ✓
16. **Nueva:** una conversión dimensional solo entre unidades de la misma dimensión, salvo puente con scope_product. — §24.3 CHECK + §12.2 scope_product_id.
17. **Nueva:** una presentación sin contenido conocido no produce normalización de precio (solo review). — §12.4 inv.4, §27.2.
18. **Nueva:** el precio normalizado se expresa SIEMPRE en `reference_buy_unit_id`; el precio de albarán (presentación) se conserva como dato verificado, no se sobreescribe. — §13.1, §13.2.
19. **Nueva:** el coste de receta nunca devuelve 0/factor-1 por fallo; devuelve estado. — §21.1, §31.1 inv.15.
20. **Nueva:** el histórico de precio conserva `reference_buy_unit_id` snapshot (no se pierde la unidad original). — §13.5.

---

## 10. Cambios al plan propuestos

| # | Problema / gap | Parte del plan afectada | Fase K afectada | Criterio de aceptación nuevo |
|---|---|---|---|---|
| C1 | §21.3/T08/T11 razonean que `current_price 51.6 €/ud` es "precio por caja"; el dato real ya está por ud → error de modelo en la prueba | §21.3, §32 (T08, T11) | K9/K11 (shadow + UI) | T28 (nuevo): un precio mal cargado se marca `PRICE_ANOMALY_REVIEW`, no se normaliza por algoritmo; el food cost se recomputa contra el albarán raíz. |
| C2 | K9 copia `current_price` legacy como si estuviera normalizado; Leche avena 9.6 €/L ≠ 1.6 €/L (verificado) | §9 (K9), §23.2, §29.2 | K9 | T22b (nuevo): `9.60 €/pack 6×1 L → 1.60 €/L` con diff < 0.001 €; shadow bloqueante si persiste 9.6. |
| C3 | Doble lugar para "caja↔24 ud" (unit_conversions.scope_presentation vs supplier_product_presentations.content_total) | §12.2, §12.3, §28.1 | K6/K8 | C1-del-plan: `grep "scope_presentation_id" unit_conversions` = 0; la composición vive solo en presentations. Paridad: presentación única por (producto, kind, contains_qty, contains_unit). |
| C4 | "1 botella = 1 L" (contenido por unidad) no modelado | §11.1, §10.4 | K8 | Inv. nuevo: toda presentación con `contains_unit_id=ud` y producto de dimensión volume/mass exige `piece_content_qty/unit_id` NOT NULL; si falta → `PRESENTATION_UNKNOWN`. |
| C5 | Matriz de contextos inexistente como documento único | §8 (auditoría), §34 (plan) | — | Añadir §8.1 del plan (versión canónica) — matriz completa de contextos con unidad/FV/conversión. |
| C6 | `get_recipe_cost` BD no devuelve estado por línea (F2 real) | §4 (K4), §21, §24.6 | K4/K11 | K4 criterio: `fn_recipe_line_cost_v2` devuelve `{status, line_cost_eur, note}` por línea; TS↔SQL status=100 % (T21 variante). |
| C7 | `canonicalPurchaseUnit` fallback kg (F3) | §25.4, §27.2, K1/K6 | K1/K6 | C2 del plan: `grep "return 'kg'" src/lib/albaran-price-match.ts` = 0 (already listed); añadir: `canonicalPurchaseUnit(unknown) → {unknown}` bloquear K6. |
| C8 | `actualizar_stock` UPDATE sin rastro (F4) | §28.1, §24.6, K5 | K5 | C3/C4 del plan: `grep "UPDATE ingredients SET stock_current" = 0` excepto deprecated; `has_function_privilege('authenticated','actualizar_stock','EXECUTE')=false`. |
| C9 | Sin entorno de pruebas (R1) | §35.1, K1-K12 todas | todas | Pre-condición GO: cualquier K con backfill requiere snapshot + rollback en <30 min (ya está §36). Mantener. |
| C10 | K12 "retirar columnas deprecated" incluye `current_price` deprecated → `product_prices` | §24.2, §33 K12, §24.5 | K12 | C8 del plan: `SELECT count(*) FROM product_prices` > 0 y `sum(product_prices) ≈ sum(current_price legacy * normalized)` dentro 0.01 € antes de drop. |

---

## 11. Fases K afectadas por esta revisión

- **K4** (coste con estado): refuerzo C6 — la BD **debe** devolver estado por línea, no `total_cost` numérico (F2 verificado). No es solo UI: el cálculo con `total_cost` oculta líneas incompatibles.
- **K6** (consolidar conversión): refuerzo C3/C7 — `UnitConversionService`/`convert_unit_canonical` quedan SOLO para dimensiones; la composición de presentación se resuelve en `ProductPriceService`/`ReceptionService`. `canonicalPurchaseUnit` no devuelve `kg`.
- **K8** (crear tablas canónicas): refuerzo C4 — `product_presentations` añade `piece_content_qty/unit_id`; poblar desde `pack_unit_size_qty/unit` (ej. Leche: `1 × l` por unidad). Backfill Leche: 9.6 €/pack → 1.60 €/L (C2).
- **K9** (precios): refuerzo C2/C10 — backfill deriva `product_prices` de `pack_price/pack_units + presentación→buy`, NO copia `current_price`.
- **K10/K11** (stock/venta/consumo): refuerzo C8/C6 — `actualizar_stock` revocado; venta descuenta con convert canónico o va a `CONSUMPTION_FAILED`. §19.2.
- **K12** (retirada): refuerzo C10 — `current_price` legacy solo se retira tras C8.

Ninguna fase cambia de sentido; las correcciones son **precisión del diseño** y **tests añadidos**, no re-escritura. El modelo sigue siendo el propuesto en §7-§13.

---

## 12. Conclusión (respuesta a la cuestión validada)

1. **¿El modelo soporta unidades diferentes por contexto?** Sí. `products` tiene `default_buy_unit_id` (l), `default_stock_unit_id` (l/ud), `default_recipe_unit_id` (ml/g), y `recipe_lines`/`stock_movements`/`reception_lines` llevan su `*_unit_id` FK. Comprar en L, reponer en botellas (ud) y escribir la receta en ml es permitido.
2. **¿Receta en ml con compra en L?** Sí: conversión universal `ml→l`, `unit_conversions` sin scope.
3. **¿Compra en cajas y stock en unidades?** Sí: presentación `caja` (contains 24 ud) ≠ unidad física; `PURCHASE` movement en `stock_unit_id=ud`.
4. **¿Cada proveedor presentación diferente?** Sí: N:M `supplier_products × supplier_product_presentations`.
5. **¿Dónde vive cada conversión?** Universal → `unit_conversions` (dimensional); presentación → `supplier_product_presentations`/`product_presentations` (composición); puente producto → `unit_conversions.scope_product_id`.
6. **¿Conversión universal vs presentación?** Distinguidas: universal sólo entre mismas dimensiones con factor global; presentación es instancia por producto/proveedor con contenido. §10.3.
7. **¿Precio conserva unidad?** Sí: `product_prices.reference_buy_unit_id` FK NOT NULL; PRESENTATION PRICE conserva €/caja en `purchase_invoice_lines.verified_*`.
8. **¿Histórico conserva €/caja?** Sí: `observed_*`/`verified_*` preservan texto original; `product_price_history` preserva normalized + snapshot de unidad. §13.5.
9. **¿Cambios al plan?** C1-C10 (§10): corrección de casos de prueba (Oreo/Leche), unificación de composición-presentación, atributo `piece_content`, refuerzo de estado en coste.
10. **¿Fases afectadas?** K4, K6, K8, K9, K10/K11, K12 (precisión y tests nuevos; sin re-escritura).
11. **Ruta del documento:** `marbella-os/6-investigacion/spikes/2026-08-10-revision-critica-unidades-por-contexto.md`.
12. **¿Se modificó el sistema?** No. Solo inspección read-only + este documento.

---

## 13. Archivos de referencia (READ-ONLY, 2026-08-10)

- **Norma vigente:** `marbella-os/3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md` (invariantes 1-6, per_pack derivado, €/unidad compra), `MODELO-DE-DATOS.md` §4 (TS manda sobre SQL en coste → D21), `DEUDA.md` (D19, D21, D22), `GLOSARIO.md` §8 (ingrediente, albarán, mapeo, precio actual, precio bloqueado).
- **Plan revisado:** `marbella-os/6-investigacion/spikes/2026-08-10-plan-migracion-dominio-producto-unidades.md` (§7-13 modelo, §21-24 SQL, §31 invariantes, §32 tests, §33 K1-K12).
- **Auditoría heredada:** `marbella-os/6-investigacion/spikes/2026-08-10-auditoria-dominio-producto-unidades.md` (§F F1-F18, §G casos, §I SSOT).
- **Código real:** `src/lib/recipe-cost.ts:19-28,59-86,132-167,173-212,252-267` (normalizeUnit, convert, estados `incompatible_units`/`missing_price`), `src/lib/albaran-price-match.ts:91-105` (`canonicalPurchaseUnit` fallback `kg` línea 97/104), `src/app/recipes/[id]/page.tsx:191,576,580,588` (RPC `get_recipe_cost`, manda backendCost), `src/lib/ingredient-pack-pricing.ts:8-19,170-192`.
- **Migraciones reales:** `20260328100000_get_recipe_cost_rpc.sql` (RPC `get_recipe_cost UUID,BOOLEAN`, `fn_recipe_line_cost`; comentario "fuente de verdad", línea 96), `20260515160700_albaranes_strict_unit_conversion.sql` (tríada `line_billing_unit/line_content_qty/line_content_unit` + `conversion_factor`), `20260417100000_stock_movements_trigger.sql` (`update_ingredient_stock_trigger`), `20260508153000_copilot_rpcs.sql:72-74` (`actualizar_stock` UPDATE directo), `20260604140000_albaran_price_preserve_ingredient_config.sql` (trigger `handle_new_invoice_line`).
- **BD real (`feqjbwxkelpgzsdiphei`, 2026-08-10):** `ingredients` (226 filas; verificado `Aceite oliva current_price=30.99 €/l`, `Leche avena current_price=9.6 €/l pack 6×1L` — errata, `Oreo sandwich current_price=51.6 €/ud pack 1238.4/24`, `Harina 2.99 €/kg`, `Colacao 10.973684 €/kg`). Tablas canónicas propuestas (`units`/`unit_conversions`/`product_presentations`/`products`/`product_prices`/`v_current_stock`) **no existen** todavía.

> Este documento es no normativo (precedencia 0). Valida y refina el plan de migración; no lo sustituye. La ejecución de K1-K12 requiere un ADR si alguna decisión propuesta aquí cambia.
