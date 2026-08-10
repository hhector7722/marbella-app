---
documento: SPIKE-DRY-RUN-K2-UNIDADES
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-10
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA, DEUDA, PROTOCOLO-AGENTES
---

# Dry-run K2 — Unidades, presentaciones y recetas

> **MATERIAL NO NORMATIVO — SPIKE-DRY-RUN-K2-UNIDADES**
>
> Este documento registra una reanudación read-only de la preparación K2. No autoriza K2, no sustituye ninguna norma vigente y no contiene transformaciones de datos.

**Fecha de los artefactos:** 2026-08-10  
**Reanudación:** 2026-08-11  
**Base de datos:** Supabase real del proyecto `feqjbwxkelpgzsdiphei`  
**K2:** no ejecutada.

## A. Estado de reanudación

La ejecución se reanudó reconstruyendo el estado existente antes de ejecutar nuevas lecturas.

- `git status --short`: salida vacía en la reconstrucción inicial.
- `git diff --name-only`: salida vacía en la reconstrucción inicial.
- No se hizo `reset`, `checkout`, `clean`, `stash` ni reversión.
- No se adquirió el freeze durante este análisis.
- No se ejecutó ninguna operación de transformación.

Clasificación temporal de artefactos:

| Artefacto | Estado Git | Evidencia | Clasificación |
|---|---|---|---|
| `sql/diagnostics/k2/2026-08-10-k2-baseline-manifest-37f7157a.json` | rastreado | añadido en `10a2e59e`, 2026-08-10T19:04:25+02:00 | K2; origen de la ejecución preparatoria anterior |
| `sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json` | rastreado | añadido en `10a2e59e`, 2026-08-10T19:04:25+02:00 | K2; origen de la ejecución preparatoria anterior |
| `scripts/k2/compare-snapshot-rows.cjs` | rastreado | añadido en `cffcdce0`, 2026-08-10T23:44:37+02:00 | K2; comparador de la ejecución anterior |
| `marbella-os/6-investigacion/spikes/2026-08-10-dry-run-k2-unidades.md` | creado en esta reanudación | este fichero | generado durante esta ejecución |

No había cambios de working tree que clasificar como preexistentes en la reconstrucción inicial. Los artefactos K2 constan en commits, por lo que su procedencia exacta dentro de la sesión anterior no puede probarse más allá de ese historial.

Después de crear este informe aparecieron cuatro cambios ajenos en el working tree:

- `src/app/playground/studio/components/RealAppView.tsx`
- `src/app/playground/studio/design-context.test.ts`
- `src/app/playground/studio/screens/system.tsx`
- `src/lib/sandbox/client.ts`

No fueron editados por esta ejecución. Su origen temporal es desconocido; no pertenecen al alcance K2 y no se modifican.

## B. Estado Git

El estado previo a crear este informe era limpio. El informe y la regeneración necesaria de derivados son los cambios documentales de esta reanudación; los cuatro paths de código anteriores son ajenos y de origen temporal desconocido.

No se modificó ningún fichero de código, migración ni diagnóstico existente.

## C. Estado del freeze

Consulta ejecutada:

```sql
SELECT private.k2_domain_freeze_status();
```

Resultado inicial:

```json
{
  "active": false,
  "stored_active": false,
  "domain": "k2_units",
  "run_id": "60ed1f1a-0d6f-4d62-8413-b72dce96e851",
  "owner_id": null,
  "reason": "K2 dry-run revalidation by agent",
  "acquired_at": "2026-08-10T21:33:10.415172+00:00",
  "expires_at": "2026-08-10T21:43:00.303137+00:00",
  "released_at": "2026-08-10T21:43:00.303137+00:00"
}
```

**Freeze inicial: INACTIVE.** No hubo que liberarlo ni renovarlo.

## D. Baseline

No se sobrescribieron ni regeneraron los artefactos.

| Artefacto | Existe | Tamaño | SHA-256 del fichero | Fecha filesystem | Estructura |
|---|---:|---:|---|---|---|
| baseline manifest | sí | 21.089 bytes | `22085c39da3bd695655c1d7eaf3264a49236ea3a0b5900404a1ff668e6e9c33d` | 2026-08-10 18:59:46 +0200 | JSON válido; `K2_BASELINE_MANIFEST_RECONCILED` |
| snapshot | sí | 126.676 bytes | `f9b218f4ed0ee81e92eb75dc16ac4b2481f8ef885c8e7f57997f5084e023a0d9` | 2026-08-10 19:00:18 +0200 | JSON válido; `K2_DATA_SNAPSHOT` |

El manifest declara `HEAD=37f7157ae160dd34344fc1892136ee40e1921cc2`, allowlist de cinco columnas de `ingredients` y una de `recipe_ingredients`, y exclusión de precios, stock, presentaciones, mappings y código.

El snapshot declara:

- `ingredients`: 226 filas y columnas `id`, `purchase_unit`, `unit_type`, `recipe_unit`, `unit`, `order_unit`.
- `recipe_ingredients`: 362 filas y columnas `id`, `recipe_id`, `ingredient_id`, `unit`.
- checksum interno declarado: `80ff612d1cd2524ad09588e4c0e7e648242987839a5a95fcaf5c59eb4fb60ea3`.

La lectura actual devuelve también 226 ingredientes y 362 líneas de receta. El baseline y el snapshot quedan **verificados** como artefactos existentes, válidos y no modificados.

## E. Snapshot drift

Se reutilizó `scripts/k2/compare-snapshot-rows.cjs`. No se creó un comparador equivalente.

- El script lee el snapshot y consulta cada PK con `SELECT` contra `public.ingredients` y `public.recipe_ingredients`.
- No contiene `INSERT`, `UPDATE`, `DELETE` ni `UPSERT`.
- La primera invocación de esta reanudación agotó 120 segundos sin salida porque abre una conexión por fila; no produjo escritura.
- La segunda invocación, con el mismo script y 600 segundos de timeout, terminó correctamente.

Salida:

```json
{
  "ingredients": [],
  "recipe_ingredients": []
}
```

**SNAPSHOT DRIFT: NO.**  
**Número de diferencias: 0.**  
**Detalle: ninguno.**

El snapshot no bloquea por drift. El bloqueo posterior de este informe procede de ambigüedades y de invariantes del modelo legacy, no de cambios respecto al snapshot.

## F. Modelo canónico y modelo actual

Las tablas canónicas propuestas `units`, `unit_dimensions`, `unit_conversions`, `products`, `product_presentations`, `supplier_product_presentations`, `product_prices` y `v_current_stock` no existen en `public` en la BD real.

El modelo actual usa:

- `ingredients` como producto/ingrediente, precio, unidades, pack y stock mutable.
- `recipe_ingredients.unit` como unidad de receta.
- `purchase_invoice_lines.line_unit` como texto observado de albarán.
- `supplier_item_mappings` como mapeo de proveedor, factor y contenido opcional.
- `stock_movements.unit` y `ingredients.unit` para stock.
- `ingredients.current_price` como precio con unidad implícita en `ingredients.purchase_unit`.
- `ingredient_price_history` sin columna de unidad de referencia.

La separación producto/presentación/proveedor/precio/unidad de referencia, por tanto, está parcialmente representada y no es un modelo canónico con claves foráneas. `pack_*` vive en el ingrediente y no como presentación por proveedor.

El código sí contiene conversión dimensional y puente `per_pack` en `src/lib/recipe-cost.ts:55-167` y `src/lib/ingredient-pack-pricing.ts:37-90`. La función SQL equivalente existe en `20260513121500_recipe_cost_cl_and_pack_bridge.sql:63-173`, pero `fn_recipe_line_cost` devuelve `0` ante conversión nula.

## G. Unidades reales

Conteos read-only actuales:

| Columna | Valores y filas |
|---|---|
| `ingredients.purchase_unit` | `kg` 79, `l` 29, `u` 31, `ud` 87 |
| `ingredients.unit_type` | `gr` 22, `kg` 57, `l` 26, `ml` 3, `u` 30, `ud` 87, `unitat` 1 |
| `ingredients.recipe_unit` | `g` 4, `kg` 77, `l` 28, `ud` 117 |
| `ingredients.unit` | `g` 79, `ml` 29, `ud` 118 |
| `ingredients.order_unit` | `caja` 59, `kg` 8, `pack` 51, `pieza` 6, `ud` 3, `unidad` 92, `NULL` 7 |
| `recipe_ingredients.unit` | `g` 109, `kg` 21, `l` 7, `ml` 36, `u` 9, `ud` 180 |

Se observan aliases y vocabularios incompatibles entre contexto: `u`/`ud`, `gr`/`g`, `unitat`, `unidad`, `pieza`, `caja`, `pack`, además de unidades físicas `kg`, `g`, `l`, `ml` y `cl` en albaranes.

Al normalizar solo las cuatro columnas físicas de `ingredients` (`purchase_unit`, `unit_type`, `recipe_unit`, `unit`), 112 de 226 productos tienen más de una unidad normalizada. Parte de esas diferencias es contextual y válida, por ejemplo compra en `kg` y receta/stock en `g`; aun así demuestra que no se puede elegir una columna por frecuencia ni tratar todas las diferencias como alias.

## H. Presentaciones y packs

Hay 64 ingredientes con metadatos de pack; los 64 están en `per_pack` y tienen `pack_units > 0`, `pack_unit_size_qty > 0` y `pack_unit_size_unit` no nulo.

- 56 packs tienen precio derivable directamente en la misma unidad declarada.
- 7 requieren conversión dimensional entre unidad de tamaño y unidad de compra.
- 1 presenta discrepancia económica: `Leche avena`, `9,60 € / pack`, `6 × 1 L`, pero `current_price=9,60 €/L`; el valor derivado es `1,60 €/L`.
- No hay packs incompletos dentro de los 64 registros de catálogo; esto no resuelve las presentaciones ausentes en mappings y albaranes.

En `supplier_item_mappings` hay 366 filas: 150 tienen contenido (`line_content_qty` y `line_content_unit`) y 216 no lo tienen. Hay 15 mappings con unidad de facturación de packaging. Todos esos 15 tienen algún contenido, pero el contenido puede ser insuficiente o contradictorio con el texto: por ejemplo `SANT ANIOL PET 1 LITRO CAJA (15)` figura con `line_content_qty=1`, `line_content_unit=ud`.

En `purchase_invoice_lines` hay 1.293 líneas, 88 con unidad de packaging, 70 de ellas mapeadas, 18 sin mapping y 13 con total cero. `line_unit` es nulo en 681 líneas y tiene 44 valores distintos.

La evidencia real permite distinguir estos conceptos solo de forma incompleta:

| Concepto | Representación actual | Resultado |
|---|---|---|
| Producto | `ingredients.id/name` | existe, pero mezcla configuración y presentación |
| Presentación | `pack_*`, `order_unit` | existe parcialmente, a nivel de ingrediente |
| Presentación de proveedor | `supplier_item_mappings` y texto OCR | parcial; 216 mappings carecen de contenido |
| Precio | `current_price`, `pack_price`, `unit_price` | existe, con unidad explícita solo por convención |
| Unidad de referencia | `purchase_unit` | implícita, no FK ni snapshot histórico |

Una caja sin contenido probado no es una conversión. No se asigna cantidad por inferencia textual durante este dry-run.

## I. Coca-Cola

Productos encontrados: 2.

| Producto | Proveedor | Precio actual | Compra | Receta | Presentación en `ingredients` |
|---|---|---:|---|---|---|
| Coca cola | Santa Teresa | 0,60 | `ud` | `ud` | ninguna |
| Coca cola zero | Santa Teresa | 0,60 | `u` | `ud` | ninguna |

Los mappings de ambos productos no declaran `line_content_qty` ni `line_content_unit`.

En albaranes aparecen, entre otras, estas formas para Coca-Cola:

- `Coca cola`: 10 líneas sin `line_unit`, 2 `caja`, 2 `l` y 2 `ud` en la agregación consultada.
- `Coca cola zero`: 11 líneas sin `line_unit`, 1 `caja` y 4 `ud` en la agregación consultada.
- Una línea `Coca cola` del 2026-05-21 registra `10` unidades de línea, `14,4000` de precio unitario y `144,00` de total con `line_unit=caja`.
- El texto `COCA COLA LATA NACIONAL 33CL` prueba el tamaño de la lata, pero no prueba cuántas latas contiene la caja.

No existe evidencia suficiente para convertir el precio de caja a precio de unidad. El `0,60 €/ud` actual puede coincidir con otras líneas por lata, pero no demuestra la composición de la caja. **Clasificación: E/D; acción: bloquear y pedir presentación verificada al proveedor.** No se corrigió ningún precio.

## J. Aceite

El caso de aceite de oliva virgen extra está representado en el modelo legacy:

- compra: `purchase_unit=l`;
- receta: `recipe_ingredients.unit=ml`;
- precio actual: `30,99 €/l`;
- pack: `154,95 €`, `1 × 5 l`;
- recetas afectadas por este ingrediente: 9 líneas con `10 ml`.

La conversión conceptual es:

```text
10 ml → 0,010 l
0,010 l × 30,99 €/l = 0,3099 €
```

`convertToPurchaseUnitQuantity` implementa `ml→l` y `convertToPurchaseUnitQuantityWithPackBridge` mantiene el puente para packs. El caso no necesita crear otro producto. Es **B, determinable mediante conversión**, con evidencia alta para la unidad y el pack. Esto demuestra capacidad de representación, no autoriza ningún backfill.

Otros aceites observados: `Aceite de oliva suave` y `Aceite girasol` también compran en `l` y usan `ml` en el ingrediente, pero sus mappings y líneas de proveedor no tienen una evidencia homogénea de presentación.

## K. Casos críticos adicionales

| Caso | Evidencia real | Clasificación provisional | Acción |
|---|---|---|---|
| Leche avena | `6 × 1 L`, `9,60 €` de pack, `current_price=9,60 €/L` | D/E: precio requiere dato/verificación de proveedor | bloquear normalización; no copiar `current_price` |
| Leche entera | `72 × 1,5 L`, `132,24 €`, `current_price=1,224444 €/L` | B con revisión de mapping | comprobar que 72 y 1,5 L representan la misma presentación |
| Agua 100cl | compra `u`, pedido `caja`, texto `CAJA (15)`, mapping `1 ud` y precio conocido 0 | E | pedir contenido y precio verificado |
| Agua Sant Aniol 0,50 | mapping `caja`, `24 ud`, `10,909 €`; otras líneas tienen total cero | B/D según línea | conservar precio observado y verificar albarán |
| Cerveza/refrescos | unidades `ud/u` y albaranes con unidad nula, `ud`, `l` o packaging | E/D | no inferir caja, lata o botella |
| Productos por kg | 79 ingredientes compran en `kg`; recetas usan principalmente `g` | B dimensional | factor explícito `g↔kg` |
| Productos por caja/pack | `order_unit`: 59 `caja`, 51 `pack`; 64 packs de catálogo | C/B según evidencia | separar presentación de unidad física |
| Volumen | 29 ingredientes compran en `l`; `unit` contiene 29 `ml` | B dimensional | factor explícito `ml/cl/l` |
| Peso | `unit_type` contiene `gr`, `kg` y `g` | B dimensional/alias | normalizar solo con regla aprobada |
| Oreo sandwich | pack `24 × 1 ud`, `pack_price=1238,40`, `current_price=51,60`; albaranes también `43,86` | D/E | revisar albarán raíz; no dividir automáticamente |

## L. Recetas

La BD contiene 158 recetas, 125 con líneas y 362 `recipe_ingredients`. El clasificador read-only normaliza aliases sintácticos, conserva dimensiones y reconoce el puente `per_pack` solo cuando el tamaño está completo.

| Clase | Significado usado en este dry-run | Líneas | Recetas afectadas |
|---|---|---:|---:|
| A | unidad ya equivalente después del alias (`u`/`ud`, etc.) | 200 | 0 |
| B | conversión dimensional o puente de presentación determinista | 148 | 59 |
| C | requiere presentación, sin convertir automáticamente | 0 | 0 |
| D | requiere dato verificable del proveedor | 0 | 0 |
| E | ambiguo | 0 | 0 |
| F | dimensión incompatible o unidad no resoluble | 14 | 8 |

Las 14 líneas F se concentran en ingredientes como `Ajo`, `Apio`, `Arandanos`, `Cebolla seca`, `Frambuesas`, `Fresas`, `Juver naranja`, `Juver piña`, `Nestea`, `Powerade`, `Red bull`, `Trina naranja` y `Voll damm`. No tienen una conversión dimensional válida ni una presentación completa que sirva de puente.

Las 42 líneas de recetas que usan alguno de los productos críticos fueron inspeccionadas. Las recetas de aceite, leche, harina, agua, refrescos y helados muestran tanto conversiones válidas como casos que dependen de presentación o precio verificado.

**Recetas afectadas:** 59 recetas únicas con al menos una línea B o F. Esto no significa que se hayan modificado.

## M. Matriz de ambigüedades

La cifra de casos ambiguos operativa de este informe es el número de mappings de proveedor sin contenido explícito: **216**. No se cuentan como ambiguas todas las diferencias contextuales de unidad ni se fuerza una interpretación de `caja`, `pack` o `botella`.

| Producto | Situación | Datos disponibles | Conversión | Evidencia | Clasificación | Acción |
|---|---|---|---|---|---|---|
| Aceite oliva virgen extra | receta ml, compra l, pack 1×5 l | unidad, precio y tamaño | `ml→l` | ingrediente y recetas reales | B | permitir solo en motor canónico |
| Harina | receta g, compra kg | unidad y precio | `g→kg` | 2,99 €/kg real | B | factor explícito |
| Cava | receta ud, compra l, pack 1×750 ml | pack completo | `ud→0,75 l` | campos `pack_*` | B | conservar presentación |
| Coca cola | línea `caja`, producto por ud, mapping sin contenido | precio línea, texto lata 33 cl | desconocida | no hay ud/caja | E | pedir dato de proveedor |
| Leche avena | pack 6×1 L y current price incompatible | pack y precio actual | `9,60/6=1,60 €/l` propuesto | contradicción real | D/E | bloquear y verificar albarán |
| Agua 100cl | `CAJA (15)` frente a mapping 1 ud y precio 0 | texto y mapping | desconocida | datos contradictorios | E | revisión manual |
| Oreo sandwich | pack 24 ud y precios de 43,86/51,60 | pack, mapping y albaranes | no concluyente | precios contradictorios | D/E | revisar documento raíz |
| Ajo | receta l, compra kg | unidades incompatibles | ninguna | 1 línea F | F | no migrar automáticamente |

## N. Writers legacy

Se identificaron **13 rutas de writer** para las columnas de unidades protegidas, sin contar lectores ni migraciones históricas. El inventario no se elimina durante K2.

| Writer | Tabla/columna | Ruta | Fase de eliminación |
|---|---|---|---|
| Alta de ingrediente | `ingredients.purchase_unit`, `unit_type` | `src/app/ingredients/page.tsx:165-191` | K8b/K12 |
| Modal de alta | `ingredients.purchase_unit`, `unit_type` | `src/components/CreateIngredientModal.tsx:33-38` | K8b/K12 |
| Edición de ingrediente | `ingredients.purchase_unit`, `unit_type`, `recipe_unit`, `order_unit` | `src/components/ingredients/IngredientEditModal.tsx:329-411` | K8b/K12 |
| Wizard de ingredientes | mismas columnas y `pack_*` | `src/components/ingredients/IngredientWizard.tsx:704-740,858-877` | K8b/K12 |
| Revisión de precios con cambio de unidad | `ingredients.purchase_unit`, `unit_type`, `pack_*` | `src/app/dashboard/albaranes-precios/actions.ts:288-314` | K8b/K12 |
| Pedido de proveedor | `ingredients.order_unit` | `src/components/orders/OrderProductCard.tsx:94-105` | K8b/K12 |
| Trigger de pack | `ingredients.unit_type`, `base_unit`, `unit` a partir de `purchase_unit` | `trg_ingredients_pack_pricing_sync`, trigger instalado | K8a/K6/K12 |
| RPC de ingredientes | `ingredients.purchase_unit`, `unit_type` | `public.gestionar_ingredientes`, rama de alta | K8b/K12 |
| Alta de receta | `recipe_ingredients.unit` | `src/app/recipes/page.tsx:344-358` | K11/K12 |
| Edición de receta | `recipe_ingredients.unit` | `src/app/recipes/[id]/page.tsx:755-760,1346` | K11/K12 |
| Importador de recetas | `recipe_ingredients.unit` | `src/app/dashboard/recetas-import/actions.ts:264-298` | K11/K12 |
| Importador legacy | `recipe_ingredients.unit`, incluyendo delete/reinsert | `src/app/actions/import-legacy.ts:589-625` | K11/K12 |
| Recetas TPV | `recipe_ingredients.unit` | `src/app/dashboard/recetas-tpv/actions.ts:151-172` | K11/K12 |

Rutas relacionadas que no se cuentan en las 13 porque no escriben esas columnas, pero sí afectan al dominio: writers de `current_price` en `src/lib/actions/albaranes.ts`, `src/app/dashboard/albaranes/actions.ts`, triggers de albaranes, `stock_movements` y el RPC `actualizar_stock`. El trigger `update_ingredient_stock_trigger` y el RPC de stock siguen siendo writers legacy de stock.

## O. Invariantes

| # | Invariante | Resultado | Evidencia |
|---:|---|---|---|
| 1 | La identidad de producto no cambia por presentación | PASS | mismo `ingredients.id`; no se creó ningún producto |
| 2 | Una presentación puede tener N unidades | PASS parcial | 64 filas con `pack_units`; falta entidad de presentación canónica |
| 3 | Un precio tiene unidad de referencia explícita | FAIL | `current_price` depende implícitamente de `purchase_unit`; no hay FK ni referencia histórica |
| 4 | La receta puede usar unidad distinta del precio | PASS parcial | 148 líneas B y aceite `ml→l`; motor TS lo implementa |
| 5 | La compra puede usar caja | PASS parcial | 88 líneas de albarán con packaging; contenido no siempre probado |
| 6 | El stock puede usar unidad | PASS parcial | `stock_movements.unit` tiene 6 valores; no hay FK canónica |
| 7 | La conversión requiere dimensión compatible | PASS | TS devuelve `null`; SQL dimensional devuelve `NULL` |
| 8 | Caja sin contenido conocido no se convierte automáticamente | FAIL | `invoice_line_price_to_purchase_unit` usa `p_fallback_factor` y cae a factor 1 cuando falta contenido |
| 9 | Conversión desconocida no devuelve 0 | FAIL | `fn_recipe_line_cost` devuelve 0 cuando `converted IS NULL` |
| 10 | Coste desconocido no devuelve 0 | FAIL | RPC SQL y `recipeLineCost` exponen 0 como valor numérico; el análisis TS tiene estado aparte |
| 11 | Un proveedor puede tener presentación propia | BLOCKED | mappings modelan parte del caso; 216 de 366 no tienen contenido |
| 12 | El histórico conserva unidad y precio original | FAIL | `ingredient_price_history` no tiene unidad; 1.162 filas tienen `changed_by=NULL` |

**Resultado de invariantes: FAIL.**

## P. Dry-run conceptual

No se generó ningún `UPDATE`. Las siguientes filas son propuestas de clasificación, no cambios:

| Antes | Propuesto | Factor | Evidencia | Confianza | Acción |
|---|---|---:|---|---|---|
| Aceite EVOO, receta 10 ml, compra l, 30,99 €/l | receta `ml`, compra `l` | 0,001 | `pack 1×5 l`, recipe lines reales | alta | B; admitir conversión |
| Harina, receta 5 g, compra kg, 2,99 €/kg | receta `g`, compra `kg` | 0,001 | unidades y precio real | alta | B; admitir conversión |
| Cava, receta ud, compra l, pack 750 ml | ud puenteada a l | 0,75 l/ud | pack completo `1×750 ml` | alta | B; conservar presentación |
| Coca-Cola, línea caja, precio 14,40, producto ud | presentación proveedor desconocida | desconocido | `caja`, pero sin cantidad de caja | baja | E; bloquear |
| Leche avena, pack 9,60, 6×1 l, current 9,60 €/l | precio canónico candidato 1,60 €/l | 6 l/pack | contradicción entre pack y current | media | D/E; revisión, no escribir |
| Agua 100cl, caja (15), mapping 1 ud y precio 0 | presentación y precio sin determinar | desconocido | texto y mapping contradictorios | baja | E; revisión |
| Ajo, receta l, compra kg | sin conversión | — | dimensiones incompatibles | alta | F; no migrar |

## Q. Estadísticas

| Métrica | Resultado |
|---|---:|
| Filas del snapshot analizadas | 588 |
| Ingredientes analizados | 226 |
| Líneas de receta analizadas | 362 |
| Recetas totales / con líneas | 158 / 125 |
| Packs de ingrediente analizados | 64 |
| Mappings de proveedor | 366 |
| Mappings con contenido / sin contenido | 150 / 216 |
| Líneas de albarán | 1.293 |
| Líneas de packaging de albarán | 88 |
| Líneas de packaging sin mapping | 18 |
| Casos deterministas A | 200 líneas |
| Casos determinables por conversión/presentación B | 148 líneas |
| Casos ambiguos operativos | 216 mappings sin contenido |
| Casos no migrables F | 14 líneas |
| Recetas afectadas | 59 |
| Coca-Cola analizada | sí, 2 productos |
| Aceite analizado | sí |
| Writers legacy de columnas K2 identificados | 13 rutas |

## R. Bloqueos

El dry-run no puede pasar por estos bloqueos:

1. 216 mappings no contienen la composición o contenido de la presentación del proveedor.
2. Coca-Cola tiene líneas `caja` sin cantidad de caja demostrada y sin mapping de contenido.
3. `Leche avena` tiene una discrepancia de precio real de `9,60 €/L` frente a `1,60 €/L` derivable del pack.
4. Existen 14 líneas F sin conversión dimensional ni puente de presentación.
5. Hay writers legacy activos para las columnas protegidas.
6. El precio no conserva unidad de referencia como dato explícito e histórico.
7. El SQL de coste convierte fallos de conversión en `0`, contradiciendo el estado explícito requerido.
8. La función de precio de albarán permite fallback a factor 1 cuando falta contenido, riesgo directo de interpretar una caja como unidad.

No se actualizó el snapshot, no se corrigió ningún mapping, no se modificó ningún precio y no se alteró ninguna fila funcional.

## S. Gate

```text
SNAPSHOT DRIFT = 0
INVARIANTS = FAIL
DRY-RUN = BLOCKED
K2 = NOT EXECUTED
WRITE PHASE = NOT AUTHORIZED
```

El resultado no es `DRY-RUN PASS`. La fase de escritura no queda autorizada. Es necesario resolver los bloqueos, actualizar el diseño operativo si procede y repetir un gate read-only antes de cualquier transformación.

**Freeze final esperado:** `INACTIVE`.
