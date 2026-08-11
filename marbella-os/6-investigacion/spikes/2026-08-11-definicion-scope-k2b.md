---
documento: SPIKE-DEFINICION-SCOPE-K2B
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-11
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, ARQUITECTURA, PROTOCOLO-AGENTES
---

# Definición del scope K2b

> **MATERIAL NO NORMATIVO — SPIKE-DEFINICION-SCOPE-K2B**
>
> Reconstrucción del objetivo de K2b a partir de las fuentes existentes. No genera allowlist, no modifica datos y no ejecuta K2/K2b.

**Freeze:** `INACTIVE`  
**Datos modificados:** `NO`  
**Allowlist K2b:** todavía no generada.

## A. Estado

El corpus distingue K2a y K2b:

- K2a: snapshot y clasificación sin mutación;
- K2b: transformaciones deterministas aprobadas sobre el legacy textual.

El objetivo general de K2b existe, pero el contrato necesario para convertirlo en una allowlist por PK/columna/valor no está cerrado.

```text
K2b OBJECTIVE = definido a nivel general
K2b SCOPE = BLOCKED a nivel ejecutable
```

## B. K2

La definición más concreta está en `2026-08-10-plan-migracion-dominio-producto-unidades.md §33`:

```text
K2 = normalizar vocabulario de unidades en columnas de texto legacy
```

K2 no crea las tablas canónicas de unidades/presentations/precios. Es un puente previo hacia FKs y modelos posteriores.

El DAG cerrado es:

```text
K1 → K2a → K2b → K3 → K5 → K8a → K6 → K7 → K8b → K9 → K4 → K10 → K11 → K12
```

## C. K2b

La definición de K2b encontrada es:

```text
K2b = normalizar solo transformaciones textuales deterministas aprobadas
      y dejar un legacy textual coherente, reversible y verificable.
```

Esto se apoya en:

- `cierre-decisiones-migracion.md §8`: normalización textual, before/after y reversibilidad;
- `resolucion-bloqueos-migracion.md §2`: K2a clasifica y K2b transforma deterministas;
- `plan-migracion... §33`: `u→ud`, `gr→g/kg`, `unitat→ud` en campos legacy.

La definición no concreta todavía todos los valores objetivo por PK/columna. Por eso no puede producirse una allowlist segura.

## D. Legacy source

La fuente legacy candidata descrita por el plan es:

| Legacy | ¿Aparece en scope K2? | Destino conceptual | Regla disponible |
|---|---|---|---|
| `ingredients.purchase_unit` | sí | mismo campo legacy normalizado | `u→ud`; exactitud de otros aliases pendiente |
| `ingredients.unit_type` | sí | mismo campo legacy coherente | `u/unitat→ud`; `gr→g/kg` depende de contexto |
| `ingredients.recipe_unit` | sí en el plan | mismo campo legacy | aliases textuales; target por fila no materializado |
| `ingredients.unit` | sí en el plan | mismo campo legacy/base | normalizar solo si regla explícita; no convertir dimensión |
| `ingredients.order_unit` | sí en el plan | mismo campo contextual | `caja/pack` no son unidad física; regla exacta pendiente |
| `recipe_ingredients.unit` | sí en el plan | mismo campo legacy | `u→ud`; filas F quedan fuera |

La tabla `supplier_item_mappings` no es fuente de escritura K2b: pertenece a R1/K3/K8b y sus 216 casos están fuera de scope.

## E. Target model

K2b no puebla el modelo canónico futuro. La relación real es:

| Entidad destino | ¿K2b la modifica? | Fuente | Fase propietaria |
|---|---|---|---|
| `ingredients` legacy | sí, como puente textual | columnas legacy de unidades | K2b |
| `recipe_ingredients` legacy | sí, solo `unit` textual determinista | líneas legacy | K2b |
| `unit_dimensions` | no | modelo futuro | K8a |
| `units` | no | modelo futuro | K8a |
| `unit_conversions` | no | modelo futuro | K8a/K6 |
| `products` | no | split futuro de ingredients | K8b |
| `product_defaults` | no | configuración canónica | K8b |
| `product_presentations` | no | `pack_*`/contexto | K8b |
| `supplier_products` | no | mappings/proveedor | K8b |
| `supplier_product_presentations` | no | mapping verificado | K3/K8b |
| `product_prices` | no | precio normalizado | K9 |
| stock/modelo de movimientos | no | stock legacy | K5/K10 |

El hecho de que esas entidades existan en el modelo futuro no convierte a K2b en su backfill.

## F. Scope

K2b pretende migrar únicamente vocabulario textual legacy, no:

- productos;
- presentations;
- precios;
- supplier relations;
- stock;
- cantidades de receta;
- conversiones dimensionales;
- mappings ambiguos.

La transformación debe ser `text → text` dentro del mismo contexto, no `ml → l`, `kg → g` ni `caja → ud` por cálculo.

## G. Transformaciones definidas y no definidas

### Definidas de forma general

- `u→ud` cuando el campo representa unidad física/receta y el target está explícitamente determinado;
- `unitat→ud` como alias textual;
- conservación de `caja`, `pack` y otras presentaciones, sin convertirlas en unidades físicas;
- rechazo de unidades desconocidas;
- exclusión de filas ambiguas/F.

### No definidas de forma ejecutable

- `gr→g` frente a `gr→kg` por cada PK;
- si `unit_type` debe copiar `purchase_unit` o conservar una unidad de receta/base;
- si `unit` se normaliza a `g/ml/ud` o se deja como proyección legacy;
- si `order_unit=unidad` se transforma a `ud` o se conserva como contexto de pedido;
- qué 200 filas A exactas entran en K2b;
- qué columnas cambian en cada una;
- el `expected_value` de cada cambio.

No se resuelven estas cuestiones durante la ejecución. El plan general no sustituye el mapa row-by-row.

## H. Los 216 casos

Los 216 casos son mappings de proveedor sin contenido estructurado. Conceptualmente:

```text
IN SCOPE K2b = 0
OUT OF SCOPE K2b = 216
```

No se les asigna transformación, target ni expected value. Su destino pertenece a R1/K3/K8b.

La clasificación exhaustiva existente es:

```text
sql/diagnostics/k2/2026-08-11-k2b-allowlist-input-classification.json
```

Ese artefacto clasifica los 216 como `OUT_OF_SCOPE`; no es una allowlist K2b.

## I. Dependencias

| Fase | Produce | Consume K2b |
|---|---|---|
| K1 | contrato documental y condiciones previas | sí |
| R1 | clasificación de mappings ambiguos | no como escritura K2b |
| K2a | snapshot, clasificación y dry-run | sí; input directo |
| K2b | legacy textual coherente y mapa reversible | K3 |
| K3 | selección determinista de mappings | consume salida K2b |
| K5/K8a/K6/K7 | writers, schema y conversiones canónicas | no son input de la transformación textual K2b |
| K8b/K9 | presentations y precio canónico | posteriores |
| K12 | retirada legacy | posterior |

No hay circularidad en el DAG, pero sí una dependencia de información: K2b necesita un dry-run row-by-row que no existe todavía.

## J. Invariantes aplicables después de K2b

Solo estas invariantes son atribuibles directamente al puente textual K2b:

- no quedan aliases deterministas no normalizados en las filas incluidas;
- ninguna fila ambigua/F se transforma;
- no se modifica una tabla/columna fuera del scope;
- before/after es reversible por PK/columna;
- `caja/pack` no se convierte en unidad física;
- no se crea una segunda fuente de verdad.

Las siguientes son posteriores y no deben fingirse como resultado de K2b:

- `product_prices` con `reference_buy_unit_id`;
- presentations separadas;
- conversiones universales en `unit_conversions`;
- coste con estados;
- stock reconstruible;
- cero writers legacy.

## K. Resultado esperado

Contrato conceptual:

```text
ANTES:
  valor textual legacy de una fila incluida en K2a

TRANSFORMACIÓN:
  alias textual explícito, sin cálculo dimensional ni inferencia

DESPUÉS:
  valor textual canónico aprobado para esa PK y columna
  + mapa reversible
  + checksum expected
```

No se generan valores fila por fila en esta tarea porque las reglas `gr`, `unit_type`, `unit` y `order_unit` no están cerradas con evidencia suficiente.

## L. Bloqueos

K2b queda bloqueada por:

1. falta de mapa row-by-row para las 200 filas A declaradas por el dry-run;
2. ausencia de expected values por PK/columna;
3. regla `gr→g/kg` sin target por contexto documentado;
4. semántica no cerrada de `unit_type`, `unit` y `order_unit`;
5. ausencia de un artefacto dry-run K2b ejecutable, distinto del snapshot y del dry-run R1.

No se bloquea por los 216 mappings: esos están fuera de scope K2b.

## M. Decisión final

```text
K2 definida = SÍ
K2b objetivo general = SÍ
K2b scope ejecutable = NO
K2b source legacy candidato = ingredients.* + recipe_ingredients.unit
K2b target = mismos campos legacy como puente textual
K2b target model canónico = NO, pertenece a K8a/K8b/K9
216 casos IN SCOPE = 0
216 casos OUT OF SCOPE = 216
ALLOWLIST = TODAVÍA NO GENERAR
K2b SCOPE = BLOCKED
```

La decisión que falta es aprobar por campo y PK la transformación textual exacta y producir el dry-run K2b completo. Sin ella, una allowlist obligaría al runner a decidir durante la escritura.
