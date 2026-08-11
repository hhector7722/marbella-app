---
documento: SPIKE-DICCIONARIO-NORMALIZACION-K2B
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

# Diccionario de normalización textual K2b

> **MATERIAL NO NORMATIVO — SPIKE-DICCIONARIO-NORMALIZACION-K2B**
>
> Análisis read-only del vocabulario legacy. K2b solo podrá cambiar aliases textuales semánticamente equivalentes. No convierte cantidades, dimensiones, precios, packs ni presentations.

**Freeze:** `INACTIVE`  
**Datos modificados:** `NO`  
**Allowlist:** no generada.

## A. Objetivo

K2b debe realizar únicamente:

```text
literal legacy
→ alias textual inequívoco
→ literal canónico de la misma unidad semántica
```

No modifica la magnitud física. No cambia cantidades, precios, dimensiones, presentations ni identidad de producto.

Formalmente, para una entrada elegible:

```text
semantic_unit(before) = semantic_unit(after)
quantity(before)      = quantity(after)
price(before)         = price(after)
```

Las conversiones `kg↔g`, `l↔ml↔cl` y los puentes de pack pertenecen a motores/conversiones o presentations, no al diccionario textual K2b.

## B. Fuentes

Fuentes documentales:

- auditoría de unidades §H-K;
- plan de migración §22, §23 y §33 K2;
- revisión crítica por contexto;
- resolución de bloqueos;
- cierre de decisiones;
- MODELO-DE-DATOS y GLOSARIO;
- `2026-08-11-definicion-scope-k2b.md`.

Fuentes de código:

- `src/lib/recipe-cost.ts:19-32`;
- `src/lib/ingredient-pack-pricing.ts:8-18`;
- `src/lib/albaran-price-match.ts:90-105`;
- `src/app/ingredients/page.tsx:17-32`;
- `src/app/dashboard/inventory/InventoryClient.tsx:41-50`.

Fuentes SQL:

- `20260415140000_ingredients_pack_pricing_equivalences.sql:24-46` (`normalize_pricing_unit`);
- `convert_pricing_qty` y funciones de coste: conversiones, no diccionario K2b.

## C. Vocabulario real

Valores distintos no nulos observados en los seis campos K2b:

| Literal | Frecuencia total observada | Campos |
|---|---:|---|
| `kg` | 242 | purchase, unit_type, recipe, unit, recipe lines, order |
| `l` | 90 | purchase, unit_type, recipe, recipe lines, order |
| `u` | 70 | purchase, unit_type, recipe lines |
| `ud` | 387 | purchase, recipe, unit, order, recipe lines |
| `g` | 192 | unit, recipe, recipe lines |
| `ml` | 68 | unit_type, unit, recipe lines, order |
| `gr` | 22 | unit_type |
| `unitat` | 1 | unit_type |
| `unidad` | 92 | order_unit |
| `caja` | 59 | order_unit |
| `pack` | 51 | order_unit |
| `pieza` | 6 | order_unit |

Los conteos son por aparición en campo, no por producto único. `NULL` aparece en `order_unit` en 7 ingredientes y no es un literal que K2b pueda convertir.

Otros valores como `UNI`, `CJ`, `CA`, `Und`, `uni`, `unid`, `mililitro` o `litro` aparecen en normalizadores o texto OCR, pero no como valores distintos no nulos de esos seis campos según la consulta real. `purchase_invoice_lines.line_unit` es OCR observado y queda fuera de K2b.

## D. Valores canónicos

El vocabulario textual canónico de las unidades físicas/receta usado por el código y el modelo es:

```text
ud, kg, g, l, ml, cl
```

Subconjunto de compra canónica documentado por la auditoría:

```text
kg, l, ud
```

`g`, `ml` y `cl` siguen siendo unidades legítimas de receta o de una presentación/conversión, no aliases de `kg`/`l`.

El contexto `order_unit` no tiene un vocabulario puramente físico: incluye `caja` y `pack`. Por eso no se aplica el vocabulario físico global sin regla específica de campo.

**Valores canónicos físicos/receta:** 6.  
**Valores canónicos de compra:** 3.

## E. Aliases deterministas

Aliases respaldados por documentación, código y datos observados:

| Literal legacy | Canónico | Tipo | Observado en datos | K2b |
|---|---|---|---:|---|
| `u` | `ud` | TEXT_ALIAS | sí, 70 apariciones | candidato determinista en campos físicos/receta |
| `unitat` | `ud` | TEXT_ALIAS | sí, 1 aparición | candidato documentado para campo físico |
| `un` | `ud` | TEXT_ALIAS | no en seis campos | solo candidato si aparece en campo físico |
| `unidad` | `ud` | CONTEXTUAL_ALIAS | sí, solo `order_unit` | no automático en `order_unit` |
| `unidades` | `ud` | TEXT_ALIAS | no en seis campos | candidato en campo físico/receta |
| `uds` | `ud` | TEXT_ALIAS | no en seis campos | candidato en campo físico/receta |
| `kilo`, `kilos` | `kg` | DIMENSIONAL_VARIANT | no en seis campos | fuera de K2b; convertiría una variante de masa |
| `gr`, `gramo`, `gramos` | `g` o `kg` según contexto | DIMENSIONAL_VARIANT | `gr` sí, 22 | fuera de K2b hasta regla por campo aprobada |
| `lt`, `litro`, `litros` | `l` | DIMENSIONAL_VARIANT | no en seis campos | fuera de K2b |
| `mililitro`, `mililitros` | `ml` | DIMENSIONAL_VARIANT | no en seis campos | fuera de K2b |
| `centilitro`, `centilitros`, `cls` | `cl` | DIMENSIONAL_VARIANT | no en seis campos | fuera de K2b |

La única equivalencia textual inequívoca observada en los datos sin cambio de dimensión es `u→ud`. `unitat→ud` está documentado como alias, pero solo tiene una aparición en `unit_type` y requiere respetar el significado de ese campo.

## F. Tabla completa de aliases candidatos

| Literal | Canónico | Tipo | Determinista | Evidencia | K2b |
|---|---|---|---|---|---|
| `ud` | `ud` | CANONICAL | sí | datos/código | ya canónico |
| `u` | `ud` | TEXT_ALIAS | sí en físico/receta | plan K2, recipe-cost, SQL | sí, campo físico/receta |
| `unitat` | `ud` | TEXT_ALIAS | sí por plan, contexto a comprobar | 1 dato en unit_type | solo tras regla de campo |
| `un` | `ud` | TEXT_ALIAS | sí en código | recipe-cost/SQL | si aparece en campo permitido |
| `unidad` | `ud` | TEXT_ALIAS/CONTEXTUAL | no globalmente | 92 en order_unit | no en order_unit sin decisión |
| `unidades` | `ud` | TEXT_ALIAS | sí en algunos normalizadores | no observado en campos K2 | no hay fila actual |
| `uds` | `ud` | TEXT_ALIAS | parcial | canonicalPurchaseUnit | no hay fila actual |
| `UNI` | `ud` | OBSERVED_OCR | no | OCR, no campo K2 | no |
| `Und` | — | UNKNOWN | no | no reconocido ni observado en campos K2 | no |
| `uni` | — | UNKNOWN | no | no reconocido ni observado en campos K2 | no |
| `unid` | — | UNKNOWN | no | no reconocido ni observado en campos K2 | no |
| `kg` | `kg` | CANONICAL | sí | datos/código | ya canónico |
| `kilo`, `kilos` | `kg` | DIMENSIONAL_VARIANT | no como alias textual K2b | código | no |
| `g` | `g` | CANONICAL | sí | datos/código | ya canónico |
| `gr` | `g`/`kg` | DIMENSIONAL_VARIANT | no sin contexto | 22 `unit_type=gr` | no |
| `gramo`, `gramos`, `grs` | `g` | DIMENSIONAL_VARIANT | no como K2b | código | no |
| `l` | `l` | CANONICAL | sí | datos/código | ya canónico |
| `lt`, `litro`, `litros` | `l` | DIMENSIONAL_VARIANT | no como K2b | código/SQL | no |
| `ml` | `ml` | CANONICAL | sí | datos/código | ya canónico |
| `mililitro`, `mililitros` | `ml` | DIMENSIONAL_VARIANT | no como K2b | código/SQL | no |
| `cl` | `cl` | CANONICAL | sí en vocabulario | código | ya canónico |
| `centilitro`, `centilitros`, `cls` | `cl` | DIMENSIONAL_VARIANT | no como K2b | código | no |
| `caja` | — | PRESENTATION | sí, order_unit | plan/modelo | no |
| `pack` | — | PRESENTATION | sí, order_unit | plan/modelo | no |
| `bolsa` | — | PRESENTATION | OCR/mappings | auditoría | no |
| `saco` | — | PRESENTATION | vocabulario esperado, no campo K2 | auditoría | no |
| `bote` | —/`ud` según normalizador OCR | AMBIGUOUS | OCR/canonicalPurchaseUnit | no equivale siempre a unidad física | no |
| `pieza` | — | PRESENTATION/AMBIGUOUS | sí, order_unit | contexto de pedido | no |

## G. Casos ambiguos

No se normalizan automáticamente:

- `gr` en `unit_type`: puede representar gramos, pero el campo duplica compra y en datos la compra es kg;
- `unidad` en `order_unit`: puede ser etiqueta operativa de pedido, no unidad física canónica;
- `pieza` en `order_unit`: puede ser presentación por pieza;
- `bote`, `bolsa`, `saco`, `caja`, `pack`: presentación o contenedor;
- `UNI`, `Und`, `uni`, `unid` en OCR: observación no verificada;
- cualquier literal no reconocido por una fuente y sin evidencia de equivalencia.

## H. Packs y presentations excluidos

Quedan fuera de K2b:

```text
caja, pack, bolsa, saco, bote, pieza,
24x110, 20x90ml, C/1000, Pak 50 uds, Cj 20 Paks
```

Aunque contengan `uds`, describen composición comercial o texto OCR. Su destino es `product_presentations`/`supplier_product_presentations` en K3/K8b, no el diccionario textual.

## I. Dimensiones excluidas

Quedan fuera de K2b:

- `kg→g`;
- `g→kg`;
- `l→ml`;
- `ml→l`;
- `cl→ml/l`;
- `ud→volumen/masa` mediante pack;
- cualquier cambio de cantidad o factor.

Son conversiones dimensionales o de presentación y pertenecen a `unit_conversions`, motores de conversión y presentations futuras.

## J. Contextos

El mismo literal no se decide sin campo:

| Campo | Contexto | Regla K2b provisional |
|---|---|---|
| `purchase_unit` | unidad de compra | `u→ud` puede ser textual; `kg/g/l/ml` no se convierten |
| `unit_type` | duplicado legacy de compra | `u/unitat→ud` candidato; `gr` requiere regla explícita |
| `recipe_unit` | default de receta | aliases de conteo pueden ser textuales; dimensiones no |
| `unit` | base/stock legacy | `u→ud` solo si se demuestra mismo significado; no cambio dimensional |
| `order_unit` | pedido/presentación | `caja/pack/pieza` no se normalizan; `unidad` queda contextual |
| `recipe_ingredients.unit` | consumo de receta | `u→ud` es candidato textual; cantidades no cambian |

No está demostrado que un único diccionario pueda aplicarse indistintamente a los seis campos.

## K. Normalizadores actuales

| Literal/familia | SQL `normalize_pricing_unit` | `recipe-cost.ts` | `ingredient-pack-pricing.ts` | `canonicalPurchaseUnit` | K2b |
|---|---|---|---|---|---|
| `u/un/ud/unidad` | reconoce | reconoce `u/un/unidad` | reconoce `u/un/unidad` | reconoce | `u→ud` textual candidato |
| `unidades/uds` | reconoce `unidades` | no `unidades` | no | reconoce ambas | no hay fila K2 actual |
| `unitat` | no | no | no | no | plan lo propone; requiere regla |
| `lt/litro/litros` | reconoce | reconoce `lt/litro`, no todos los plurales | reconoce `lt/litro` | reconoce | dimensional, fuera |
| `ml/mililitro(s)` | reconoce | reconoce singular, no todos los plurales | solo `ml` | reconoce | dimensional, fuera |
| `cl/cls/centilitro(s)` | conserva `cl`, no todos como alias | reconoce | solo `cl` | reconoce | dimensional, fuera |
| `kg/kilo(s)` | reconoce | singular `kilo` | singular `kilo` | reconoce | dimensional, fuera |
| `g/gr/gramo(s)` | reconoce plurales | singular `gr/gramo` | `g/gr` | reconoce plurales | dimensional/contextual, fuera |
| `UNI/Und/uni/unid` | no | no | no | no | UNKNOWN/OCR, fuera |

## L. Drift detectado

Existe drift entre normalizadores:

- `unitat` está en datos y plan, pero no en los normalizadores actuales;
- plurales reconocidos por SQL/canonicalPurchaseUnit no están todos en recipe-cost/pack pricing;
- `canonicalPurchaseUnit` convierte `bote`/`pieza` a `ud`, aunque esos textos pueden ser presentation;
- `order_unit` usa `unidad` 92 veces, pero las listas de pedido usan `ud` y presentations separadas;
- `gr` se interpreta como `g` en unas funciones, mientras el modelo legacy lo usa como duplicado de compra `kg` en `unit_type`.

El drift es precisamente una razón para no convertir automáticamente esos literales en K2b sin contrato por campo.

## M. Diccionario canónico propuesto

El diccionario conceptual puede declararse así, sin implementarlo:

```text
CANONICAL_PHYSICAL_RECIPE = { ud, kg, g, l, ml, cl }
CANONICAL_PURCHASE = { ud, kg, l }
TEXT_ALIAS_SAFE_CANDIDATES = { u→ud, unitat→ud }
DIMENSIONAL_VARIANTS = { gr/g/kg, litro/l, mililitro/ml, cl/centilitro }
PRESENTATIONS = { caja, pack, bolsa, saco, bote, pieza }
UNKNOWN = { UNI, Und, uni, unid y cualquier no demostrado }
```

`TEXT_ALIAS_SAFE_CANDIDATES` no se convierte aún en allowlist: `unitat` necesita confirmación de campo y `u` debe evaluarse solo en campos donde la semántica es conteo.

## N. Reclasificación de los 216 casos

Los 216 casos son `supplier_item_mappings` sin contenido estructurado, no valores de unidad en los campos K2b. Conceptualmente quedan fuera de K2b:

| Clase | Casos | Motivo |
|---|---:|---|
| A. K2b TEXT NORMALIZATION | 0 | no son campos de unidad K2b |
| B. OUT — DIMENSIONAL CONVERSION | 0 como operación K2b | ningún mapping se convierte aquí |
| C. OUT — PRESENTATION/PACK | 111 con señal textual de pack/tamaño; 216 requieren presentation/mapping | proveedor/presentation pertenece a K3/K8b |
| D. OUT — PRICE | 0 como transformación K2b | precio pertenece a K9 |
| E. OUT — AMBIGUOUS | 105 sin señal interpretable | no hay contenido verificado |
| F. OUT — UNKNOWN | 0 separado; quedan dentro de E/R1 review | no se fuerza clasificación adicional |
| G. ALREADY CANONICAL | 0 como K2b | no son unidades K2b |
| **Total** | **216** | **todos OUT OF K2b** |

No se genera allowlist a partir de esta reclasificación.

## O. Invariantes

K2b solo podrá afirmar, para sus filas elegibles:

1. no cambia la cantidad física;
2. no cambia dimensión;
3. no cambia precio;
4. no cambia product identity;
5. `semantic_unit(before)=semantic_unit(after)`;
6. no convierte presentations ni mappings.

No puede afirmar que creó el SSOT canónico, que resolvió precio o que creó presentations; esas son fases posteriores.

## P. Tests

Tests conceptuales antes de allowlist:

- cada alias candidato tiene evidencia y campo permitido;
- `u→ud` no cambia cantidad ni dimensión;
- `unitat→ud` solo entra si el campo tiene semántica de conteo confirmada;
- `gr`, `kg`, `g`, `l`, `ml`, `cl` no se convierten en K2b;
- `caja`, `pack`, `pieza`, `bote`, `bolsa`, `saco` no entran;
- `recipe_ingredients.unit` cambia solo alias textual inequívoco;
- ninguna entrada de los 216 mappings entra;
- la clasificación conserva 216/216 casos.

## Q. Gate K2b

```text
VOCABULARIO CANÓNICO GENERAL = DOCUMENTADO
ALIASES OBSERVADOS = DOCUMENTADOS
DRIFT = DOCUMENTADO
PACKS/DIMENSIONES EXCLUIDOS = PASS
216 CASOS RECLASIFICADOS = SÍ
K2b TRANSFORMATION DICTIONARY = NOT READY
K2b NORMALIZATION SCOPE = NOT READY
ALLOWLIST = NO GENERAR
```

El gate no pasa porque `unit_type/gr`, `order_unit/unidad`, `unit`, `unitat` y el mapa por campo siguen necesitando una decisión semántica explícita. No se soluciona con una conversión matemática ni con el comportamiento más permisivo de un normalizador existente.

## R. Decisión final

```text
K2b SCOPE = BLOCKED
K2b OBJECTIVE = general, no ejecutable por fila
216 IN SCOPE = 0
216 OUT OF SCOPE = 216
ALLOWLIST = TODAVÍA NO GENERAR
DATOS MODIFICADOS = NO
K2 = NO EJECUTADA
K2b = NO EJECUTADA
FREEZE = INACTIVE
```

La decisión mínima pendiente es aprobar un diccionario por campo que determine, como mínimo, `unit_type=gr`, `order_unit=unidad`, `unitat` y la aplicación de aliases a `unit`/`recipe_ingredients.unit`. Después de esa decisión podrá producirse el dry-run row-by-row y, solo entonces, la allowlist.
