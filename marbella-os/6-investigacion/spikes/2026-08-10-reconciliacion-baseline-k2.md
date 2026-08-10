---
documento: SPIKE-RECONCILIACION-BASELINE-K2
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

# Reconciliación del baseline K2

> **MATERIAL NO NORMATIVO — SPIKE-RECONCILIACION-BASELINE-K2**
>
> Diagnóstico y preparación fechados el 2026-08-10. No ejecuta K2, no modifica datos funcionales y no edita los spikes anteriores.

## 1. Baseline originalmente previsto

El baseline inicialmente declarado era:

```text
b72e123d er
+ delta K1
+ cambios paralelos legítimos
```

Ese baseline quedó superado por un commit paralelo posterior. No se ha reescrito ni revertido la historia.

## 2. Commit paralelo detectado

```text
b72e123d er
↓
37f7157a studio
↓
HEAD actual = 37f7157a
```

`37f7157a` contiene 49 paths y mezcla tres clases:

| Clase | Contenido |
|---|---|
| K1 | Los siete archivos de código/test de K1 y el registro de ejecución K1 |
| GENERATED | Derivados `.generated/` regenerados por el corpus |
| Paralelo/preexistente | Playground, sandbox, dashboards, acciones, estilos, cliente Supabase y spikes de diseño/auditoría |

El inventario completo, estado, clasificación y SHA-256 está en:

`sql/diagnostics/k2/2026-08-10-k2-baseline-manifest-37f7157a.json`

### Solapamiento con K1

El commit sí contiene K1. La lista coincide con el registro K1:

- `src/lib/ingredient-price-sync.ts`;
- `src/lib/ingredient-price-sync.test.ts`;
- `src/app/dashboard/albaranes-precios/actions.ts`;
- `src/lib/recipe-cost.ts`;
- `src/app/ingredients/page.tsx`;
- `src/app/dashboard/albaranes/actions.ts`;
- `src/components/ingredients/IngredientWizard.tsx`;
- `marbella-os/6-investigacion/spikes/2026-08-10-ejecucion-k1.md`.

Por tanto, K1 ya está incorporada a `37f7157a`; no hay delta K1 pendiente de aplicar al baseline operativo.

### Solapamiento con K2

No existe solapamiento directo con la allowlist de datos K2:

- el commit no modifica `supabase/migrations/`;
- no ejecuta ni contiene un UPDATE de producción;
- no modifica filas de `ingredients` ni `recipe_ingredients`;
- `k2_overlap_with_commit` del manifest es `[]`.

El commit contiene código que puede escribir esas columnas porque son writers actuales del sistema, pero eso es una condición de concurrencia, no una modificación K2 del commit.

## 3. Baseline operativo definitivo

```text
BASELINE_K2 =
HEAD 37f7157a
+ working tree legítimo capturado por el manifest
+ K1 ya incorporada en 37f7157a
```

La incorporación se decide porque `37f7157a` contiene K1 y trabajo paralelo, no cambia la allowlist K2 y es el estado real sobre el que se ejecutaría la fase. El baseline `b72e123d` queda registrado como referencia histórica, no como estado operativo actual.

## 4. Manifest y hashes

**Manifest nuevo:**

`sql/diagnostics/k2/2026-08-10-k2-baseline-manifest-37f7157a.json`

Incluye:

- baseline anterior `b72e123d`;
- commit `37f7157a`;
- HEAD actual;
- delta completo `b72e123d..37f7157a`;
- clasificación K1/GENERATED/paralelo;
- working tree posterior;
- paths K1 y paths excluidos;
- allowlist y exclusiones K2;
- SHA-256 del contenido real.

El manifest anterior no se sobrescribe:

`sql/diagnostics/k2/2026-08-10-k2-baseline-manifest.json`

Se conserva como evidencia de la captura rechazada para `b72e123d`.

## 5. Allowlist K2

| Tabla | Columnas | Operación |
|---|---|---|
| `ingredients` | `purchase_unit`, `unit_type`, `recipe_unit`, `unit`, `order_unit` | UPDATE transaccional solo de filas deterministas |
| `recipe_ingredients` | `unit` | UPDATE transaccional solo de filas deterministas |

K2 no puede modificar código, migrations, presentaciones, mappings, precios, stock, estructura de recetas ni ningún path Git.

No se detectó solapamiento del commit con esta allowlist.

## 6. Snapshot K2

**Snapshot creado:**

`sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json`

Contenido:

- `ingredients`: 226 filas, PK y cinco columnas K2;
- `recipe_ingredients`: 362 filas, PK, referencias y `unit`;
- baseline manifest asociado;
- timestamp;
- conteos;
- checksum SHA-256: `80ff612d1cd2524ad09588e4c0e7e648242987839a5a95fcaf5c59eb4fb60ea3`.

Verificación realizada:

- archivo legible y no vacío;
- tamaño: 126.676 bytes;
- conteos coinciden con las filas almacenadas;
- checksum recalculado coincide exactamente;
- ninguna escritura en BD.

El snapshot representa el estado PRE-K2. No contiene valores propuestos ni resultados de transformación.

## 7. Writers concurrentes

La inspección read-only identifica writers capaces de modificar columnas K2:

| Writer | Columnas | Tipo | Estado |
|---|---|---|---|
| `src/app/ingredients/page.tsx` | `purchase_unit`, `unit_type`, `recipe_unit`, `order_unit` | UI/cliente Supabase | Capaz de escribir |
| `src/components/ingredients/IngredientEditModal.tsx` | `purchase_unit`, `unit_type`, `recipe_unit`, `order_unit` | UI/cliente Supabase | Capaz de escribir |
| `src/app/dashboard/albaranes-precios/actions.ts` | `purchase_unit`, `unit_type` cuando `allowUnitChanges` | Server Action | Capaz de escribir |
| `src/components/orders/OrderProductCard.tsx` | `order_unit` | UI/cliente Supabase | Capaz de escribir |
| `src/app/recipes/[id]/page.tsx` | `recipe_ingredients.unit` | UI/cliente Supabase | Capaz de escribir |
| `src/app/recipes/import/page.tsx` | `recipe_ingredients.unit` vía insert | UI/importación | Capaz de escribir |
| `src/app/dashboard/recetas-import/actions.ts` | `recipe_ingredients.unit` vía insert | Server Action/importación | Capaz de escribir |
| `src/app/actions/import-legacy.ts` | `recipe_ingredients.unit` vía insert | Importación | Capaz de escribir |
| `src/app/dashboard/recetas-tpv/actions.ts` | `recipe_ingredients.unit` vía insert/update | Server Action | Capaz de escribir |
| Trigger de normalización de `ingredients` | `purchase_unit`, `unit_type` | Postgres trigger | Capaz de escribir |

No se puede demostrar desde el repositorio si hay una sesión activa exactamente en este instante. Sí se demuestra que existen writers operativos que podrían concurrir durante K2.

```text
WRITERS CONCURRENTES = N > 0 (capaces de escribir)
```

No se desactivaron ni modificaron. Por tanto, el gate de preparación sigue bloqueado hasta que el procedimiento K2 autorizado establezca una ventana sin escrituras o un mecanismo transaccional equivalente.

## 8. Rollback

El snapshot permite rollback por PK y columna, condicionado a comprobar que el valor no cambió después. No se permite restaurar la tabla completa ni tocar Git.

Estado:

- snapshot: PASS;
- rollback por delta: preparado documentalmente;
- prueba de rollback: no ejecutada, porque K2 no se ha ejecutado;
- conflicto posterior: debe detener el rollback de esa fila y pasarla a revisión.

## 9. Gate de preparación

| Condición | Resultado |
|---|---|
| Delta Git analizado | PASS |
| `37f7157a` clasificado | PASS |
| Sin solapamiento directo con K2 | PASS |
| Baseline real definido | PASS |
| Nuevo manifest y hashes | PASS |
| Allowlist | PASS |
| Snapshot creado y verificado | PASS |
| Rollback preparado | PASS documental |
| Writers concurrentes = 0 | **FAIL: N > 0 capaces** |
| Datos funcionales modificados | NO |
| K2 ejecutada | NO |

```text
K2 PREPARATION = BLOCKED
```

La causa restante no es el baseline: es la ausencia de una ventana/mecanismo de exclusión de writers K2. No se ejecutaron dry-run, UPDATE, migración ni K3.
