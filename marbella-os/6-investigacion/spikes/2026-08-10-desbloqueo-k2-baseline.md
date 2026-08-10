---
documento: SPIKE-DESBLOQUEO-K2-BASELINE
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

# Desbloqueo operativo K2 — Baseline y cambios preexistentes

> **MATERIAL NO NORMATIVO — SPIKE-DESBLOQUEO-K2-BASELINE**
>
> Diagnóstico fechado el 2026-08-10. No ejecuta K2, no modifica código, no modifica BD y no crea snapshot operativo. Define cómo aislar K2 de un working tree con trabajo paralelo.

**Commit observado:** `b72e123d er`  
**K1:** PASS, según `2026-08-10-ejecucion-k1.md`  
**K2:** no ejecutada.

---

## 1. Estado K1

El registro de K1 declara como cambios de K1:

- `src/lib/ingredient-price-sync.ts`;
- `src/lib/ingredient-price-sync.test.ts`;
- `src/app/dashboard/albaranes-precios/actions.ts`;
- `src/lib/recipe-cost.ts`;
- `src/app/ingredients/page.tsx`;
- `src/app/dashboard/albaranes/actions.ts`;
- `src/components/ingredients/IngredientWizard.tsx`;
- `marbella-os/6-investigacion/spikes/2026-08-10-ejecucion-k1.md` como registro.

K1 regeneró los derivados del corpus:

- `marbella-os/.generated/CARGA-DE-CONTEXTO.md`;
- `marbella-os/.generated/AFIRMACIONES.md`;
- `marbella-os/.generated/GRAFO.md`;
- `marbella-os/.generated/OBSOLESCENCIA.md`;
- `marbella-os/.generated/PRECEDENCIA.json`.

De esos cinco, `AFIRMACIONES.md` no presenta diferencia actual respecto a su estado rastreado; que no aparezca en `git status` no significa que no se regenerase.

K1 ejecutó tests lock/no-lock 2/2, grep de las cinco citas legacy, lint de la librería/test y `npm run validate:corpus`. No ejecutó migraciones ni escrituras en BD.

---

## 2. Motivo exacto del bloqueo K2

K2 está definida como una normalización de datos sobre:

- `ingredients.purchase_unit`;
- `ingredients.unit_type`;
- `ingredients.recipe_unit`;
- `ingredients.unit`;
- `ingredients.order_unit`;
- `recipe_ingredients.unit`.

El plan afecta a 226 ingredientes y 362 líneas de receta, con snapshot y rollback por fila. El plan no exige un working tree limpio; exige un cambio transaccional limitado a esos datos y un reporte before/after.

El bloqueo se produjo porque el árbol actual contiene, además del delta K1, modificaciones y archivos no rastreados de otras áreas. Sin una allowlist, un rollback o una comprobación posterior podría tocar trabajo ajeno. No se ha hecho ninguna escritura de K2.

---

## 3. Estado Git observado en READ-ONLY

### 3.1 Resumen

- `HEAD` sigue en `b72e123d`; K1 no está representada por un commit propio.
- Hay 33 rutas modificadas rastreadas según `git diff --name-only`.
- Hay 12 rutas o archivos no rastreados según `git ls-files --others --exclude-standard`.
- No hay rutas modificadas bajo `supabase/migrations/`.
- Hay cuatro derivados `.generated` modificados actualmente; son artefactos generados, no fuentes.

El repositorio no permite demostrar solo con Git la autoría temporal de cada cambio no comprometido: no existe un commit o manifiesto pre-K1 que separe los deltas. Sí permite clasificar con certeza si una ruta pertenece o no al alcance de K1.

### 3.2 Inventario y clasificación

| Archivo o grupo | Estado | Origen respecto a K1 | Procedencia temporal | Acción para K2 |
|---|---|---|---|---|
| `src/lib/ingredient-price-sync.ts` | modificado | K1 | K1 documentada | Preservar; K2 no lo toca |
| `src/lib/ingredient-price-sync.test.ts` | no rastreado | K1 | K1 documentada | Preservar; K2 no lo toca |
| `src/app/dashboard/albaranes-precios/actions.ts` | modificado | K1 | K1 documentada | Preservar; K2 no lo toca |
| `src/lib/recipe-cost.ts` | modificado | K1 | K1 documentada | Preservar; K2 no lo toca |
| `src/app/ingredients/page.tsx` | modificado | K1 | K1 documentada | Preservar; K2 no lo toca |
| `src/app/dashboard/albaranes/actions.ts` | modificado | K1 | K1 documentada | Preservar; K2 no lo toca |
| `src/components/ingredients/IngredientWizard.tsx` | modificado | K1 | K1 documentada | Preservar; K2 no lo toca |
| `marbella-os/6-investigacion/spikes/2026-08-10-ejecucion-k1.md` | no rastreado | K1 | K1 documentada | Preservar |
| `.generated/CARGA-DE-CONTEXTO.md` | modificado | GENERATED/K1 | regenerado | No editar; regenerar solo si cambia el corpus |
| `.generated/GRAFO.md` | modificado | GENERATED/K1 | regenerado | No editar; regenerar solo si cambia el corpus |
| `.generated/OBSOLESCENCIA.md` | modificado | GENERATED/K1 | regenerado | No editar; regenerar solo si cambia el corpus |
| `.generated/PRECEDENCIA.json` | modificado | GENERATED/K1 | regenerado | No editar; regenerar solo si cambia el corpus |
| `src/app/actions/cash-closing-photos.ts` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/actions/labor-conditions.ts` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/actions/notifications.ts` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/actions/overtime.ts` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/dashboard/insights/InsightsClient.tsx` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/dashboard/sala/page.tsx` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/dashboard/ventas/page.tsx` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/globals.css` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/components/Navbar.tsx` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/components/dashboards/SubNavVentas.tsx` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/utils/supabase/client.ts` | modificado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/playground/**` | modificado/eliminado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/playground/studio/components/HojaContacto.tsx` | no rastreado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/playground/studio/components/RealAppView.tsx` | no rastreado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/playground/studio/components/RealInsightsView.tsx` | no rastreado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/playground/studio/components/SandboxView.tsx` | no rastreado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/app/playground/studio/screens/sandbox-screens.tsx` | no rastreado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/lib/sandbox/client.ts` | no rastreado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `src/lib/sandbox/server.ts` | no rastreado | AJENO | exacta: DESCONOCIDA | Preservar; excluir |
| `marbella-os/6-investigacion/spikes/2026-08-10-cierre-decisiones-migracion.md` | no rastreado | PREEXISTENTE/AJENO | documentada antes de K2; sin commit | Preservar; excluir |
| `marbella-os/6-investigacion/spikes/2026-08-10-plan-migracion-dominio-producto-unidades.md` | no rastreado | PREEXISTENTE/AJENO | documentada antes de K2; sin commit | Preservar; excluir |
| `marbella-os/6-investigacion/spikes/2026-08-10-resolucion-bloqueos-migracion.md` | no rastreado | PREEXISTENTE/AJENO | documentada antes de K2; sin commit | Preservar; excluir |
| `marbella-os/6-investigacion/spikes/2026-08-10-revision-critica-unidades-por-contexto.md` | no rastreado | PREEXISTENTE/AJENO | documentada antes de K2; sin commit | Preservar; excluir |
| `marbella-os/6-investigacion/spikes/2026-08-10-revision-final-consistencia-plan-migracion.md` | no rastreado | PREEXISTENTE/AJENO | documentada antes de K2; sin commit | Preservar; excluir |

### 3.3 Cambios imposibles de atribuir con certeza

Sí: Git no puede demostrar cuándo ni quién introdujo los cambios AJENO/DESCONOCIDO porque K1 no tiene un commit propio y el árbol se ha compartido con trabajo paralelo. La clasificación fiable es de **alcance**, no de autoría temporal:

- K1: coincide con el registro K1 y su diff esperado.
- GENERATED: son derivados del corpus.
- AJENO: no pertenece al alcance K1.
- DESCONOCIDO: procedencia temporal exacta de esos cambios AJENO.

No se revierte, mueve, limpia ni modifica ningún elemento AJENO/DESCONOCIDO.

---

## 4. Baseline correcto para K2

El baseline de K2 no es solo `HEAD`, porque `HEAD` no contiene K1 ni el trabajo paralelo legítimo.

```text
BASELINE_K2 =
HEAD b72e123d
+ delta K1 documentado
+ cambios preexistentes/ajenos preservados en el árbol actual
```

El baseline operativo se define por una **manifest de exclusión**, no por limpieza del working tree:

1. Manifestar la lista de rutas K1.
2. Manifestar el estado de todas las demás rutas actuales con path, estado y hash.
3. Guardar la identidad de `HEAD` y el momento del inicio de K2.
4. Declarar que K2 no puede modificar ninguna ruta del repositorio: K2 afecta únicamente a las filas/columnas de BD del plan.
5. Tras K2, comparar la lista de rutas: cualquier diferencia nueva en código, documentos o migraciones bloquea el gate.

El snapshot operativo de datos de K2 es independiente del snapshot Git. Debe contener el estado de las filas afectadas antes de normalizar, por clave primaria y columnas K2, junto con conteos y hash del conjunto. No se ha creado todavía.

---

## 5. ¿K2 necesita un working tree limpio?

**No.** K2, tal como está definida en el plan, es una normalización de datos sobre 226 ingredientes y 362 líneas de receta; no requiere modificar archivos del código ni el schema. Un working tree limpio no es una precondición semántica de una operación transaccional sobre esas columnas.

Lo que sí necesita K2:

- allowlist exacta de tablas/columnas;
- snapshot de datos antes de escribir;
- transacción única para la transformación;
- reporte before/after;
- bloqueo o coordinación de writers que puedan escribir esas mismas columnas durante la ventana;
- comprobación Git posterior de que no apareció ningún delta de código, migración o documento ajeno a la documentación de ejecución.

No se cambia el requisito de K2: se aplica de manera aislada al dominio de datos y no se interpreta como permiso para modificar el working tree.

---

## 6. Snapshot de K2: definición, no ejecución

No se ejecutó snapshot en esta tarea.

El snapshot que K2 deberá tomar contiene, como mínimo:

| Elemento | Contenido |
|---|---|
| Identidad | `HEAD`, timestamp local, id de ejecución K2 |
| `ingredients` | PK + `purchase_unit`, `unit_type`, `recipe_unit`, `unit`, `order_unit` y campos necesarios para rollback |
| `recipe_ingredients` | PK + `unit` y referencia de receta/ingrediente |
| Conteos | total de filas, distribución por cada columna antes |
| Ambigüedad | filas excluidas por `REQUIRES_REVIEW` y motivo |
| Integridad | hash del conjunto ordenado y reporte de valores antiguos/nuevos |
| Protección Git | manifest de paths actual, separando K1, generated y AJENO |

El snapshot no se guarda sobre rutas ajenas ni se usa para restaurar el working tree. Si se persiste como artefacto de ejecución, debe hacerlo el procedimiento autorizado de K2 fuera del código de aplicación y quedar referenciado en el registro K2.

---

## 7. Validación y rollback de K2 sin tocar cambios ajenos

### Allowlist de K2

K2 solo puede modificar:

- `ingredients.purchase_unit`;
- `ingredients.unit_type`;
- `ingredients.recipe_unit`;
- `ingredients.unit`;
- `ingredients.order_unit`;
- `recipe_ingredients.unit`.

No puede modificar código, migraciones, presentaciones, mappings, precios, stock, recetas estructurales ni ningún archivo del árbol.

### Validación

1. Comparar conteos before/after por columna.
2. Verificar que los cambios de `u`, `unitat`, `gr` y otros valores fueron únicamente los clasificados como deterministas.
3. Verificar que ningún valor ambiguo fue transformado automáticamente.
4. Verificar que `ingredients.purchase_unit` activo no conserva `u`, `unitat` o `gr` salvo filas explícitamente revisadas.
5. Verificar coherencia entre `purchase_unit`, `unit_type`, `unit`, `recipe_unit` y `recipe_ingredients.unit`.
6. Verificar que el working tree no tiene nuevas rutas modificadas respecto a la manifest pre-K2.
7. Ejecutar `npm run validate:corpus` solo si se modificó documentación del registro; no es una validación de datos de K2.

### Rollback

El rollback opera sobre el delta de K2:

1. identificar el `k2_run_id` y las PK afectadas;
2. comparar el valor actual con el valor escrito por K2;
3. revertir únicamente filas cuyo valor actual aún coincide con el valor K2;
4. si una fila cambió después de K2, detener rollback automático y pasarla a revisión;
5. nunca usar `git reset`, `git checkout`, `git clean`, `git stash` ni restaurar el working tree;
6. nunca restaurar tablas completas que contengan cambios ajenos.

Si el rollback fila a fila no es seguro, se usa el backup/PITR de la BD siguiendo el runbook de K2, pero se detiene antes de afectar escrituras posteriores. La restauración debe ser una operación de datos delimitada, no una limpieza del repositorio.

---

## 8. Condiciones para volver a ejecutar K2

K2 queda **operativamente desbloqueada**, pero no ejecutada. Se puede volver a intentar cuando se cumplan simultáneamente:

1. Se conserva la manifest de baseline actual.
2. Se confirma que los siete archivos K1 y su test siguen presentes sin cambios fuera del delta esperado.
3. Se excluyen explícitamente todos los paths AJENO/DESCONOCIDO de cualquier operación de K2.
4. Se toma y verifica el snapshot de las filas K2.
5. Se confirma que no hay writer concurrente activo sobre las columnas K2 durante la transacción.
6. Se genera primero un reporte dry-run con las filas deterministas y las filas `REQUIRES_REVIEW`.
7. Se dispone del rollback por PK y del `k2_run_id`.
8. Se comprueba que K2 no requiere migración ni modificación de código; si el procedimiento propone crear una migración, se detiene porque sería K3 o posterior.

La condición exacta para permitir la ejecución es:

```text
baseline manifestado
AND snapshot K2 verificado
AND allowlist K2 aprobada
AND dry-run revisado
AND rollback preparado
AND cero writers concurrentes sobre columnas K2
```

---

## 9. Veredicto

El working tree no está limpio, pero **K2 no necesita un working tree limpio**. Necesita aislamiento de datos y un baseline manifestado. Los cambios ajenos no se revierten ni se consideran fallo del producto.

```text
K2 DESBLOQUEADA
```

Esto significa que existe un procedimiento seguro y verificable para iniciar K2 posteriormente. **K2 no se ejecutó en esta tarea**, no se tomó snapshot y no se modificó ningún archivo, código, BD o dato.
