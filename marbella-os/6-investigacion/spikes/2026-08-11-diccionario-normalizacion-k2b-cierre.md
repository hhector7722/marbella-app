---
documento: SPIKE-DICCIONARIO-NORMALIZACION-K2B-CIERRE
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-11
caducidad: no aplica
supersede: SPIKE-DICCIONARIO-NORMALIZACION-K2B
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, DOMINIO-PRECIOS-Y-COMPRAS, ARQUITECTURA, PROTOCOLO-AGENTES
---

# Cierre del diccionario de normalización K2b

> **MATERIAL NO NORMATIVO — SPIKE-DICCIONARIO-NORMALIZACION-K2B-CIERRE**
>
> Cierre analítico del diccionario textual. No modifica el spike anterior porque los spikes son inmutables. No genera allowlist ni modifica datos.

**Freeze:** `INACTIVE`  
**Datos modificados:** `NO`  
**K2/K2b:** no ejecutadas.

## A. Objetivo

K2b solo puede cambiar un literal por otro cuando ambos representan la misma unidad semántica y no cambia cantidad, dimensión, precio, presentación ni identidad del producto.

```text
legacy literal → canonical literal
```

No se ejecutan conversiones `kg↔g`, `l↔ml↔cl`, bridges de pack ni conversiones de precio.

## B. Fuentes

- `2026-08-10-auditoria-dominio-producto-unidades.md`;
- `2026-08-10-plan-migracion-dominio-producto-unidades.md`;
- `2026-08-10-revision-critica-unidades-por-contexto.md`;
- `2026-08-10-cierre-decisiones-migracion.md`;
- `2026-08-11-definicion-scope-k2b.md`;
- `src/lib/recipe-cost.ts`;
- `src/lib/ingredient-pack-pricing.ts`;
- `src/lib/albaran-price-match.ts`;
- `supabase/migrations/20260415140000_ingredients_pack_pricing_equivalences.sql`;
- snapshot K2 y consulta read-only real de los seis campos.

## C. Los 12 valores reales

Frecuencia total de apariciones no nulas en los cinco campos de `ingredients` y `recipe_ingredients.unit`:

| Literal | Frecuencia | Columnas observadas | Significado/clasificación |
|---|---:|---|---|
| `ud` | 592 | purchase, unit_type, recipe, unit, order, recipe lines | CANONICAL, conteo |
| `kg` | 242 | purchase, unit_type, recipe, order, recipe lines | CANONICAL, masa |
| `g` | 192 | recipe, unit, recipe lines | CANONICAL, masa |
| `unidad` | 92 | order_unit | AMBIGUOUS contextual/pedido |
| `l` | 90 | purchase, unit_type, recipe, recipe lines | CANONICAL, volumen |
| `u` | 70 | purchase, unit_type, recipe lines | TEXT_ALIAS candidato a `ud` |
| `ml` | 68 | unit_type, unit, recipe lines | CANONICAL, volumen |
| `caja` | 59 | order_unit | PRESENTATION |
| `pack` | 51 | order_unit | PRESENTATION |
| `gr` | 22 | unit_type | AMBIGUOUS/DIMENSIONAL_VARIANT |
| `pieza` | 6 | order_unit | AMBIGUOUS/PRESENTATION |
| `unitat` | 1 | unit_type | TEXT_ALIAS candidato a `ud` |

El total de apariciones es 1.485; `order_unit` tiene 7 valores nulos. Literales OCR como `UNI`, `CJ`, `CA`, `Und`, `uni` y `unid` no son valores de estos seis campos y quedan fuera de K2b.

## D. Los 6 canónicos

| Canónico | Dimensión | Contextos válidos | Fuente |
|---|---|---|---|
| `ud` | count | compra, receta, stock/operación cuando es unidad física | `recipe-cost.ts`, `STANDARD_UNITS`, GLOSARIO |
| `kg` | mass | compra y receta | MODELO/plan K2 |
| `g` | mass | receta y representación de masa | `RECIPE_UNIT_OPTIONS`, `recipe-cost.ts` |
| `l` | volume | compra y receta | `recipe-cost.ts`, PRECIOS-Y-COMPRAS |
| `ml` | volume | receta y representación de volumen | `RECIPE_UNIT_OPTIONS`, `recipe-cost.ts` |
| `cl` | volume | receta y representación de volumen | `recipe-cost.ts`, código SQL |

El subconjunto canónico de compra es `kg`, `l`, `ud`. Los seis valores no son intercambiables: que pertenezcan al vocabulario no autoriza una conversión K2b.

## E. Los 2 aliases deterministas

### Alias 1: `u → ud`

- filas únicas: 40? No: afecta 39 filas/celdas de forma exclusiva y comparte una fila con `unitat`;
- celdas: 70;
- columnas: `ingredients.purchase_unit` 31, `ingredients.unit_type` 30, `recipe_ingredients.unit` 9;
- evidencia: plan K2, recipe-cost, SQL `normalize_pricing_unit`, datos reales;
- semántica: conteo de unidad a conteo de unidad;
- no cambia dimensión, cantidad, precio ni presentation.

### Alias 2: `unitat → ud`

- filas únicas: 1;
- celdas: 1;
- columna: `ingredients.unit_type`;
- producto real: `Maxibon jungly`;
- misma fila: `purchase_unit=u`, `recipe_unit=ud`, `unit=ud`;
- evidencia: plan K2 explicita `unitat→ud`; contexto de `unit_type` es el duplicado textual de la unidad de compra;
- no cambia dimensión, cantidad, precio ni presentation.

Relación exacta:

```text
2 aliases
→ 31 filas ingredients con purchase_unit u
→ 30 de esas filas también tienen unit_type u
→ 1 de esas filas tiene unit_type unitat
→ 9 filas recipe_ingredients con unit u
→ 40 filas únicas
→ 70 celdas u + 1 celda unitat = 71 celdas
```

## F. Los 3 literales ambiguos

| Literal | Frecuencia | Posibles significados | Motivo | Acción |
|---|---:|---|---|---|
| `gr` | 22 | gramos o duplicado textual de compra kg | aparece en `unit_type`, mientras `purchase_unit` es kg; no es alias universal | excluir K2b; regla de campo pendiente |
| `unidad` | 92 | unidad física o unidad operativa de pedido | todas las apariciones actuales están en `order_unit` | conservar como contexto de pedido |
| `pieza` | 6 | unidad física o presentation por pieza | aparece en `order_unit` | excluir; resolver como presentation/contexto |

`caja` y `pack` no son ambiguos en esta clasificación: son PRESENTATION y quedan fuera. `bolsa`, `saco` y `bote` aparecen en OCR/mappings, no como valores de los seis campos K2b.

## G. Los 40 casos candidatos

Los 40 casos son candidatos analíticos, no allowlist. Todos tienen decisión `K2B_DETERMINISTIC` para sus celdas `u/unitat`; sus `order_unit` no se toca.

### Ingredients: 31 filas, 62 celdas

| PK | Producto | Tabla | Columnas candidatas | Literal | Candidato | Evidencia | Decisión |
|---|---|---|---|---|---|---|---|
| `0fce07d0-7f1e-4cb6-b0ab-8d60b06d68f8` | Powerade | ingredients | purchase_unit, unit_type | u, u | ud, ud | misma fila recipe/unit=ud | K2B_DETERMINISTIC |
| `22b7a22b-2ef3-4433-8bc7-086b894439b2` | Maxibon jungly | ingredients | purchase_unit, unit_type | u, unitat | ud, ud | recipe/unit=ud; plan unitat→ud | K2B_DETERMINISTIC |
| `23195cc0-7c54-4aeb-8ef8-d44c83257f25` | Red bull | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `234f1233-f7fa-43ed-976b-c9aef6029c7c` | Film con soporte | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `2c2bcd41-cb58-419c-816f-4964b40a988b2` | Cubo | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `3161d801-c778-49c5-92b1-1671770468bb` | Bitter kas | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `381be8b7-eb35-4726-8bd0-5b79c01fede0` | Estrella damm | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `489d4104-7b77-4644-874c-f17a4b20fb68` | Tarrinas Plástico 165 ml | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `537b5e26-3938-4f1f-a862-f8191cdcd341` | Kinder Bueno | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `565591eb-8ed2-47a4-82b6-85ee10293219` | Coca cola zero | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `63208d3a-91bd-4e3f-ba74-9a971229ce9c` | Nestea | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `69bce9f5-d406-43eb-bf10-da81cd5943d1` | Cocktail | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `7c38b97d-914f-4506-a038-7155fce8ae3c` | Estropajo | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `83c2d9dd-fd24-4657-9f54-f1fe38d1e80f` | Triblis | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `888096ca-9379-49c8-a8ff-5c63f93dd9e3` | Voll damm | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `9ec81f74-2fc9-4c4b-b8b4-9df3ae783a8c` | Roll-drap Negro | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `a3f2f1c0-e667-4573-bc7b-ff887e67eeae` | Alhambra | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `a593e221-21c8-4820-b22c-a3aca7253629` | Guantes negros M | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `a8e4985d-4f8c-4e29-b04a-fff359897291` | Recogedor | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `b13b0416-4601-442b-8be8-e55004851e71` | Roll-drap | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `b48ea353-4f01-4b44-83c6-8deb22faf32f` | Film | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `ba1e1e0c-f17b-4c36-a466-6be70ddc6508` | Oreo | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `ca14ee93-b636-49fe-8faf-f5667082adc2` | Bolsas 18x20 | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `d3b90c3c-8c0b-407a-b674-5e4a451753d1` | Lavavajillas Máquina | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `d58e8291-2b2d-4479-a8c2-59b165a099bb` | Limpinox | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `dee2d9f2-8d11-457a-bf22-3afeb8b3ac71` | Mocho | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `e36f1d9f-42f9-485c-9ecf-8175b1b78dd9` | Agua 100cl | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `f06f6d44-d597-48fe-98ab-97ec53ea6dbe` | Damm free | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `f2bb4d7d-bf93-402e-855d-83daafbabb98` | Ruedas | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `fb318925-2b5b-4e92-8562-6d573c2b4ad5` | Nestea maracuyà | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |
| `fe056cd1-ea97-449c-918c-7d6e08b42622` | Juver piña | ingredients | purchase_unit, unit_type | u, u | ud, ud | recipe/unit=ud | K2B_DETERMINISTIC |

### Recipe lines: 9 filas, 9 celdas

| PK | Receta | Ingrediente | Tabla | Columna | Literal | Canónico | Decisión |
|---|---|---|---|---|---|---|---|
| `0ef829a6-ff48-4857-9cc5-eb509df6677e` | Roibos | Roibos | recipe_ingredients | unit | u | ud | K2B_DETERMINISTIC |
| `1851860b-c6ce-4666-8df0-f9911facb177` | Butifarra Blanca | Bolsas bocadillos | recipe_ingredients | unit | u | ud | K2B_DETERMINISTIC |
| `2203e3c3-e31f-49ae-adc9-90af90f39502` | Ración Pan | Bocata Mediterráneo | recipe_ingredients | unit | u | ud | K2B_DETERMINISTIC |
| `22197a98-760a-482b-9969-bb7b5f63d970` | Agua con gas Malavella | Agua con gas Malavella | recipe_ingredients | unit | u | ud | K2B_DETERMINISTIC |
| `31367ec7-0958-4a16-95c7-a8893cd83c73` | Pan con Tomate | Bocata Mediterráneo | recipe_ingredients | unit | u | ud | K2B_DETERMINISTIC |
| `46fa5522-bf88-456f-8232-7f65a4fba8c4` | Patatas Bravas | Pinchos madera 15cm | recipe_ingredients | unit | u | ud | K2B_DETERMINISTIC |
| `4e48e103-5304-4742-874e-1d83488a416f` | Agua con gas Malavella | Vasos 350ml | recipe_ingredients | unit | u | ud | K2B_DETERMINISTIC |
| `5f4b44fd-2284-4d70-96ec-ac26fda1745e` | Marrakesh | Marrakesh | recipe_ingredients | unit | u | ud | K2B_DETERMINISTIC |
| `c6075a31-68b2-49e3-b212-2621ab396e09` | Menta Poleo | Menta Poleo | recipe_ingredients | unit | u | ud | K2B_DETERMINISTIC |

## H. Las 71 celdas

```text
ingredients.purchase_unit: 31 celdas u→ud
ingredients.unit_type:     30 celdas u→ud + 1 celda unitat→ud
recipe_ingredients.unit:    9 celdas u→ud
TOTAL:                      71 celdas en 40 filas únicas
```

Ninguna de las 40 filas incluye `order_unit=unidad`, `caja`, `pack` o `pieza` en el cambio. Esas columnas se conservan.

## I. Contextos

| Alias | purchase | recipe | order | unit | unit_type | recipe_ingredients |
|---|---|---|---|---|---|---|
| `u→ud` | SAFE, 31 | NOT OBSERVED | NOT OBSERVED | NOT OBSERVED | SAFE, 30 | SAFE, 9 |
| `unitat→ud` | NOT OBSERVED | NOT OBSERVED | NOT OBSERVED | NOT OBSERVED | SAFE, 1 por plan y contexto de duplicado de compra | NOT OBSERVED |

Los campos `order_unit`, `unit` y `recipe_unit` no reciben cambios por estas 71 celdas. `order_unit=unidad` queda fuera por contexto.

## J. Packs, dimensiones y otros casos

- Presentación/pack: `caja` 59, `pack` 51, `pieza` 6 en `order_unit`; no se normalizan.
- Dimensionales: 148 casos de receta/compra; no se normalizan.
- Presentation/pack R1: 111 casos con señal dentro de los 216 mappings; los 216 mappings permanecen fuera de K2b.
- Ambiguos R1: 105 casos sin señal interpretable; no se normalizan.

## K. Diccionario canónico final

| Legacy literal | Canonical literal | Context | Deterministic | Evidence |
|---|---|---|---|---|
| `u` | `ud` | `ingredients.purchase_unit` | sí | 31 datos; plan K2; normalizadores |
| `u` | `ud` | `ingredients.unit_type` | sí | 30 datos; duplicado de compra |
| `u` | `ud` | `recipe_ingredients.unit` | sí | 9 datos; recipe-cost |
| `unitat` | `ud` | `ingredients.unit_type` | sí | 1 dato; plan K2 explicita alias |

Canónicos no transformables:

```text
ud, kg, g, l, ml, cl
```

Dimensionales excluidos:

```text
```

Presentations excluidas:

```text
caja, pack, pieza, bolsa, saco, bote y formatos OCR de contenido
```

## L. Tests semánticos

Para `u→ud`:

- ambos significan conteo en los campos observados;
- `recipe_unit`/`unit` ya son `ud` en las filas de ingredientes;
- no cambia cantidad, dimensión, precio ni presentation.

Para `unitat→ud`:

- la fila real `Maxibon jungly` tiene `purchase_unit=u`, `recipe_unit=ud`, `unit=ud`;
- el plan K2 declara `unitat→ud`;
- el cambio no toca cantidad, dimensión, precio ni presentation.

Para `gr`, `unidad` y `pieza`, el test semántico no demuestra una equivalencia global; permanecen excluidos.

## M. Gate K2b

```text
12 valores explicados = PASS
6 canónicos explicados = PASS
2 aliases observados = PASS
3 ambiguos identificados = PASS
40 filas explicadas = PASS
71 celdas explicadas = PASS
2 aliases → 40 filas = EXPLICADA
105 ambiguos reconciliados = PASS como R1 OUT/REVIEW
148 dimensionales excluidos = PASS
111 presentation/pack excluidos = PASS
contextos comprobados = PASS
diccionario canónico = READY para análisis
K2b normalization scope = READY para candidatos textuales
allowlist = NO GENERAR
```

La allowlist no se genera en este cierre. El diccionario y sus 40 filas/71 celdas son el input analítico; la siguiente tarea podrá producir la allowlist únicamente después de validar el alcance operativo y el mapa K2b.

## N. Estado final

```text
DATOS MODIFICADOS = NO
K2 = NO EJECUTADA
K2b = NO EJECUTADA
FREEZE = INACTIVE
CORPUS = PASS
ALLOWLIST = NO GENERADA
```
