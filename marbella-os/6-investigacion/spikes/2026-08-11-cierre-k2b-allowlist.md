---
documento: SPIKE-CIERRE-K2B-ALLOWLIST
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

# Cierre de allowlist K2b

> **MATERIAL NO NORMATIVO — SPIKE-CIERRE-K2B-ALLOWLIST**
>
> Clasificación read-only de alcance K2b. No implementa allowlist ejecutable, no modifica datos, no ejecuta K2b y no autoriza el Runner.

**Freeze:** `INACTIVE`  
**Datos modificados:** `NO`  
**K2:** no ejecutada  
**K2b:** no ejecutada.

## A. Definición

Una entrada K2b `WRITE-ELIGIBLE` debe identificar de forma inmutable:

```text
table + pk + column + before_value + expected_value
  + transformation_rule + evidence + source_snapshot + confidence
```

K2b no recalcula durante la escritura. Consume únicamente un artefacto aprobado de entradas esperadas.

## B. Scope

El scope aprobado de K2b es:

| Tabla | PK | Columnas |
|---|---|---|
| `public.ingredients` | `id` | `purchase_unit`, `unit_type`, `recipe_unit`, `unit`, `order_unit` |
| `public.recipe_ingredients` | `id` | `unit` |

K2b no toca `supplier_item_mappings`, precios, stock, presentations, recipe structure ni columnas fuera de la allowlist.

## C. Fuente

Fuentes disponibles:

- snapshot K2: `sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json`;
- baseline manifest: `sql/diagnostics/k2/2026-08-10-k2-baseline-manifest-37f7157a.json`;
- comparator: `scripts/k2/compare-snapshot-rows.cjs`;
- dry-run R1: `sql/diagnostics/k2/2026-08-11-fase-1-r1-ambiguous-mappings-dry-run.json`;
- clasificación de los 216 casos: `sql/diagnostics/k2/2026-08-11-k2b-allowlist-input-classification.json`.

El snapshot K2 contiene valores actuales, no valores objetivo. El dry-run R1 contiene decisiones de no conversión para mappings, no el mapa K2b de unidades.

## D. Los 216 casos

Los 216 casos de `supplier_item_mappings` fueron clasificados exhaustivamente en el artefacto `K2B_ALLOWLIST_INPUT_CLASSIFICATION`.

| Caso | PK | Producto | Tabla | Columna | Estado | Valor actual | Valor esperado | Regla | Evidencia |
|---|---|---|---|---|---|---|---|---|---|
| Cada uno de los 216 IDs del artefacto | `supplier_item_mappings.id` | incluido en `product` | `public.supplier_item_mappings` | `null` | `OUT_OF_SCOPE` | raw del mapping | `null` | R1 no es escritura K2b | dry-run R1 + snapshot R1 |

La tabla anterior representa los 216 registros de forma exhaustiva mediante el artefacto versionado, no mediante una copia divergente de 216 filas en este documento. Validación del artefacto:

```text
total = 216
write_eligible = 0
human_review = 0
blocked = 0
out_of_scope = 216
bad_rows = 0
```

La razón es de scope, no una conversión: R1 mappings se resuelve en K3/K8b. Ninguno de los 216 puede entrar en K2b.

## E. WRITE-ELIGIBLE

Para los 216 mappings:

```text
WRITE-ELIGIBLE = 0
```

No se incluye ninguna fila porque:

- pertenece a `supplier_item_mappings`, fuera del scope K2b;
- carece de contenido estructurado en los casos R1;
- no tiene columna K2b autorizada;
- no tiene `expected_value` K2b.

Para las tablas K2b (`ingredients` y `recipe_ingredients`) el dry-run histórico solo publica conteos agregados A/B/F. No existe un artefacto row-by-row aprobado con los 200 valores objetivo A.

Por tanto, la allowlist de escritura K2b no puede declararse completa.

## F. HUMAN_REVIEW

Los siete casos humanos previamente identificados pertenecen a las 14 líneas F de receta, no a los 216 mappings de este artefacto:

- dos líneas de `Ajo`;
- `Apio`;
- `Arandanos`;
- `Cebolla seca`;
- `Frambuesas`;
- `Fresas`.

No entran en K2b y deben seguir como `HUMAN_REVIEW`/legacy hasta que exista decisión de receta o evidencia de presentación. No se convierten ni se añaden a la allowlist.

## G. BLOCKED

Para los 216 mappings clasificados aquí:

```text
BLOCKED = 0
```

No se marca `BLOCKED` porque la clasificación operativa de R1 ya los separa correctamente como `OUT_OF_SCOPE`.

Para K2b global, las filas F y cualquier fila sin `expected_value` serían `BLOCKED`, no `WRITE-ELIGIBLE`.

## H. OUT_OF_SCOPE

Los 216 mappings son `OUT_OF_SCOPE` para K2b. Esta clasificación protege contra un error de alcance: K2b no debe usar el R1 dry-run como permiso para modificar mappings ni para resolver presentations.

También quedan fuera de la allowlist:

- las 148 diferencias de contexto que requieren conversión universal o presentation;
- las 14 líneas F;
- los siete casos humanos;
- precios, stock y presentations;
- toda fila no presente en el snapshot K2.

## I. Allowlist completa

La allowlist ejecutable K2b debería ser un artefacto distinto con entradas concretas por PK/columna. En el estado actual:

| Tabla | Entradas aprobadas |
|---|---:|
| `public.ingredients` | 0 disponibles en artefacto row-by-row |
| `public.recipe_ingredients` | 0 disponibles en artefacto row-by-row |
| `public.supplier_item_mappings` | 0, fuera de scope |

El dry-run previo informa 200 casos A, pero no entrega sus `expected_value` por PK y columna. No se recalculan aquí. Por ello:

```text
ALLOWLIST COMPLETA = NO
K2b ALLOWLIST = NOT READY
```

## J. Before/after

Para los 216 mappings R1, el before/after de clasificación es:

```text
BEFORE = raw mapping actual conservado en el artefacto
AFTER  = no write; OUT_OF_SCOPE
```

No se inventa `expected_value` porque no existe una transformación K2b para esas filas.

Para las filas K2b A, el before/after real sigue `UNRESOLVED` hasta que K2a produzca un mapa completo por PK/columna. Un conteo A no es un valor objetivo.

## K. Reglas

Reglas de inclusión futuras:

1. PK del snapshot presente;
2. columna dentro de allowlist;
3. before coincide con snapshot revalidado;
4. expected_value explícito;
5. regla textual determinista documentada;
6. evidencia y confidence presentes;
7. no es F, HUMAN_REVIEW, BLOCKED ni OUT_OF_SCOPE;
8. no hay cálculo de conversión durante K2b.

Si falla una regla, la entrada queda fuera de escritura.

## L. Drift protection

Antes de cualquier escritura futura, el runner deberá comprobar por entrada:

- PK existente;
- tabla y columna esperadas;
- before actual igual al before del artefacto;
- snapshot checksum vigente;
- expected_value igual al artefacto aprobado.

Una diferencia produce `K2_SNAPSHOT_CONFLICT` y aborta. K2b no sobreescribe cambios posteriores ni recalcula objetivos.

## M. Checksum

La allowlist futura tendrá un `expected_checksum` calculado sobre entradas ordenadas por:

```text
table + pk + column + canonical_json(before_value) + canonical_json(expected_value)
```

Con versión de formato explícita `k2b-map-v1` y SHA-256 del contenido UTF-8. El checksum del snapshot K2 existente permanece separado y no se sustituye.

Actualmente no puede calcularse un `expected_checksum` K2b válido porque faltan entradas `expected_value` por PK/columna.

## N. Counts

### Clasificación R1 consumida por este cierre

```text
expected_rows = 216
expected_tables = 1 (supplier_item_mappings, OUT_OF_SCOPE)
expected_columns = 0 K2b
write_eligible = 0
human_review = 0
blocked = 0
out_of_scope = 216
```

### Allowlist K2b real

```text
expected_rows = UNRESOLVED
expected_columns = UNRESOLVED
expected_tables = ingredients + recipe_ingredients, pendientes de mapa
expected_changes_by_table = UNRESOLVED
```

No se declaran ceros como resultado de una allowlist vacía completa: son ceros de entradas disponibles, no una aprobación de que K2b no tenga cambios.

## O. Source of truth

Para los 216 casos R1, el artefacto único de clasificación es:

```text
sql/diagnostics/k2/2026-08-11-k2b-allowlist-input-classification.json
```

Para la allowlist K2b de escritura todavía no existe source of truth porque no existe el mapa esperado por PK/columna. No se elige el snapshot actual como sustituto: contiene solo before.

## P. Validación cruzada

Resultados:

| Relación | Resultado |
|---|---|
| baseline → snapshot | PASS documental; snapshot asociado al manifest |
| snapshot → dry-run R1 | PASS, 216/216 |
| dry-run R1 → clasificación | PASS, 216/216 |
| `allowlist_R1 ⊆ dry-run_R1` | PASS, clasificación íntegra |
| `allowlist_R1 ∩ HUMAN_REVIEW` | PASS, vacío |
| `allowlist_R1 ∩ BLOCKED` | PASS, vacío |
| clasificación R1 → allowlist K2b | BLOCKED, distinto scope |
| K2 snapshot → expected K2b | NOT READY, mapa ausente |

La cadena no pierde los 216 casos, pero tampoco convierte una clasificación R1 en una allowlist K2b.

## Q. Rollback

No hay rollback de datos porque no hay allowlist WRITE-ELIGIBLE ni escritura. El snapshot R1 permite conservar el before de los 216 mappings, pero no habilita modificarlo.

El rollback futuro de K2b será por PK/columna y checksum, según la especificación del runner. No se prepara ni ejecuta aquí.

## R. Gate final

```text
216/216 casos clasificados = PASS
HUMAN_REVIEW excluidos = PASS
BLOCKED excluidos = PASS
OUT_OF_SCOPE excluidos = PASS
allowlist K2b completa = FAIL
expected_value por PK/columna K2b = FAIL
expected_checksum K2b = NOT READY
K2b ALLOWLIST = NOT READY
K2 Runner READY FOR IMPLEMENTATION = NO
DATOS MODIFICADOS = NO
K2 = NO EJECUTADA
K2b = NO EJECUTADA
FREEZE = INACTIVE
```

El único bloqueo restante es generar y aprobar el mapa row-by-row de las filas K2b deterministas, sin recalcular durante la escritura. No se inventan valores para cerrarlo.
