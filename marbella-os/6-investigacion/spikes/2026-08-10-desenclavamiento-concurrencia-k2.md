---
documento: SPIKE-DESENCLAVAMIENTO-CONCURRENCIA-K2
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

# Desenclavamiento de concurrencia K2

> **MATERIAL NO NORMATIVO — SPIKE-DESENCLAVAMIENTO-CONCURRENCIA-K2**
>
> Diseño de la exclusión de writers para K2. No implementa el lock, no modifica código, no modifica BD, no modifica datos y no ejecuta K2.

**Baseline:** `HEAD 37f7157a` + working tree capturado por `sql/diagnostics/k2/2026-08-10-k2-baseline-manifest-37f7157a.json`.  
**Snapshot:** `sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json`, verificado, 226 ingredientes y 362 líneas de receta.  
**Estado actual:** `K2 PREPARATION = BLOCKED` por writers capaces de escribir las columnas protegidas.

---

## 1. Writers detectados

K2 protege:

- `ingredients.purchase_unit`;
- `ingredients.unit_type`;
- `ingredients.recipe_unit`;
- `ingredients.unit`;
- `ingredients.order_unit`;
- `recipe_ingredients.unit`.

### Writers de aplicación

| Writer | Tipo | Tabla | Columnas | Puede ejecutarse durante K2 | Exclusión requerida |
|---|---|---|---|---|---|
| `src/app/ingredients/page.tsx:162-175` | Cliente Supabase | `ingredients` | `purchase_unit`, `unit_type`, `order_unit`, `recipe_unit` | Sí | Guard de BD |
| `src/components/ingredients/IngredientEditModal.tsx:329-362,394-412` | Cliente Supabase | `ingredients` | `purchase_unit`, `unit_type`, `order_unit`, `recipe_unit` | Sí | Guard de BD |
| `src/app/dashboard/albaranes-precios/actions.ts:294-314` | Server Action | `ingredients` | `purchase_unit`, `unit_type` | Sí | Guard de BD |
| `src/components/orders/OrderProductCard.tsx:97-105` | Cliente Supabase | `ingredients` | `order_unit` | Sí | Guard de BD |
| `src/app/recipes/[id]/page.tsx:1346` | Cliente Supabase | `recipe_ingredients` | `unit` | Sí | Guard de BD |
| `src/app/recipes/[id]/page.tsx:755-761` | Cliente Supabase | `recipe_ingredients` | `unit` en insert | Sí | Guard de BD |
| `src/app/recipes/import/page.tsx:95` | Importador | `recipe_ingredients` | `unit` en insert | Sí | Guard de BD |
| `src/app/dashboard/recetas-import/actions.ts:298` | Server Action/importador | `recipe_ingredients` | `unit` en insert | Sí | Guard de BD |
| `src/app/actions/import-legacy.ts:602-625` | Importador legacy | `recipe_ingredients` | `unit` en insert | Sí | Guard de BD |
| `src/app/dashboard/recetas-tpv/actions.ts:154-193` | Server Action | `recipe_ingredients` | `unit` en insert/update | Sí | Guard de BD |

### Writers de base de datos

| Writer | Tipo | Tabla/efecto | Columnas | Puede ejecutarse durante K2 | Exclusión requerida |
|---|---|---|---|---|---|
| `trg_ingredients_pack_pricing_sync` en `20260415140000_ingredients_pack_pricing_equivalences.sql:145-183` | Trigger | `ingredients` | `purchase_unit`, `unit_type` en INSERT/UPDATE | Sí, como efecto de una escritura | Guard de BD |
| funciones/triggers de albarán que modifican `ingredients` | Trigger/RPC | `ingredients` | Pueden activar normalización de unidad | Sí | Guard de BD |
| RPCs de importación/copiloto | RPC | `ingredients` | Dependiente de sus payloads | Potencial; debe bloquearse en BD | Guard de BD |

Las migraciones históricas que contienen `UPDATE` no son procesos concurrentes activos por sí mismas; no se cuentan como writers runtime. Los triggers y funciones instalados sí se cuentan como rutas activas.

### Writers no identificados

- No hay evidencia de un writer K2 en cron/n8n/OCR/IA que escriba directamente esas columnas, pero su ausencia no se puede demostrar solo con grep.
- El gate de writers exige revisar jobs y RPCs desplegados contra el esquema real antes de ejecutar.
- No se han desactivado writers ni se ha añadido ningún mecanismo en esta tarea.

```text
WRITERS CAPACES DE ESCRIBIR = N > 0
WRITERS ACTIVOS EN ESTE INSTANTE = DESCONOCIDO
```

No es válido convertir `DESCONOCIDO` en cero.

---

## 2. Alcance mínimo de protección

No se necesita bloquear toda la aplicación ni toda la BD.

El lock de dominio K2 debe proteger únicamente:

1. filas de `ingredients` incluidas en el snapshot K2;
2. columnas K2 de esas filas;
3. filas de `recipe_ingredients` incluidas en el snapshot K2;
4. columna `recipe_ingredients.unit` de esas filas;
5. triggers y funciones que puedan modificar esas columnas como efecto lateral.

No debe bloquear:

- playground o sandbox;
- dashboards ajenos;
- ventas, stock, precios o presentaciones que no escriban columnas K2;
- lectura normal de la aplicación.

### Mecanismos evaluados

| Mecanismo | Resultado |
|---|---|
| Lock global de aplicación | REJECTED: alcance excesivo y no necesario |
| Desactivar UI | REJECTED: APIs, RPCs, imports y clientes directos lo pueden saltar |
| Ventana manual sin guard BD | REJECTED: depende de que nadie escriba |
| Advisory lock aislado | REJECTED: solo protege procesos que intentan adquirirlo |
| Lock por fila sin protección de nuevos writers | REJECTED: no cubre todas las filas ni triggers |
| Write-freeze de dominio impuesto en BD | **ELEGIDO como prerrequisito** |

---

## 3. Estrategia elegida

```text
DECISIÓN:
write-freeze de dominio K2 impuesto en la base de datos,
con una función/RPC de migración que adquiere el lock y ejecuta K2.

NO:
advisory lock aislado.
NO:
ventana manual sin enforcement en BD.
NO:
bloqueo de toda la aplicación.
```

### Prerrequisito de infraestructura

Debe existir, antes de ejecutar K2:

1. estado de freeze de dominio K2 en una relación protegida de BD;
2. trigger/guard sobre `ingredients` y `recipe_ingredients` que rechace writes K2 mientras el freeze esté activo, salvo el contexto autorizado de migración;
3. función/RPC de migración que adquiera el lock, revalide snapshot, ejecute K2, valide y haga rollback si falla;
4. identidad de ejecución (`k2_run_id`) y propietario del lock;
5. timeout y estado de lock observable;
6. política para liberar el lock ante commit, rollback o pérdida de conexión.

Esto no se implementa aquí. Sin este prerrequisito no existe garantía real porque varios writers usan Supabase directamente.

### Por qué no basta un advisory lock

Un advisory lock solo bloquea otro proceso que solicite el mismo lock. Los writers actuales de `ingredients` y `recipe_ingredients` no pasan por un servicio común y algunos son clientes directos. Por tanto, podrían escribir sin solicitarlo.

El advisory lock solo puede formar parte del mecanismo elegido si el guard de BD es obligatorio para todos los writes y la función de migración usa el mismo dominio. Sin guard, no es una solución.

---

## 4. Secuencia de ejecución futura

```text
baseline manifestado
↓
snapshot verificado
↓
↓
revalidar snapshot contra filas actuales
↓
si hay diferencias: ABORTAR y liberar lock
↓
↓
K2 transaccional bajo lock
↓
validar before/after bajo lock
↓
si falla: rollback bajo lock
↓
commit y registrar gate
↓
liberar lock
```

El snapshot no debe convertirse en una ventana de carrera. Si se toma antes del lock, siempre se revalida después de obtenerlo. Una diferencia aborta; no se sobreescribe.

### Una transacción o batches

K2 debe ejecutarse en una única transacción mientras el volumen permita las 588 filas actuales. Si en el futuro se demuestra que requiere batches:

- el freeze debe sobrevivir entre batches;
- el lock no se libera entre batches;
- cada batch revalida y registra su delta;
- el rollback permanece dentro del mismo freeze.

No se permite `batch 1 → liberar lock → batch 2`.

---

## 5. Concurrencia y fallos

| Escenario | Comportamiento obligatorio |
|---|---|
| A. K2 tiene lock; writer intenta escribir | Guard BD rechaza la escritura con estado `K2_DOMAIN_LOCKED`; no espera indefinidamente ni modifica fila |
| B. Writer ya escribe; K2 solicita lock | Guard/lock de fila espera hasta terminar o aborta por timeout; K2 no modifica hasta revalidar snapshot |
| C. Dos K2 simultáneas | Una adquiere el lock; la otra recibe `K2_ALREADY_RUNNING` y no escribe |
| D. K2 pierde conexión | Transacción y lock transaccional se liberan; no queda freeze huérfano; si existe estado persistido, timeout lo marca expirado |
| E. K2 cae a mitad | Rollback dentro del lock; si la conexión no permite rollback, se usa snapshot/PITR delimitado y se revalida |
| F. Importador automático | Sus INSERT/UPDATE atraviesan el guard y son rechazados mientras el freeze está activo |
| G. Usuario desde frontend/API | La UI puede mostrar error, pero la garantía está en BD; no puede saltarse el guard |

### Lock y writers iniciados antes

Todo writer protegido debe adquirir el mismo guard de dominio o tocar una fila de control mediante el trigger. Si un writer ya tiene una transacción abierta, K2 espera o aborta; nunca asume que el snapshot sigue válido. Tras adquirir exclusión, revalida las PKs.

---

## 6. Revalidación del snapshot

La revalidación compara, por cada PK del snapshot:

- `ingredients.purchase_unit`, `unit_type`, `recipe_unit`, `unit`, `order_unit`;
- `recipe_ingredients.unit`;
- checksum de los valores protegidos.

Resultados:

- igual al snapshot: fila elegible;
- distinta antes de K2: `K2_SNAPSHOT_CONFLICT`, abortar toda la ejecución;
- PK desaparecida: abortar y revisar;
- fila nueva fuera del snapshot: no se toca; añadirla requiere nueva preparación.

No se permite que una fila modificada después del snapshot sea “normalizada” silenciosamente.

---

## 7. Rollback

```text
K2 bajo lock
↓
FAIL o validación negativa
↓
rollback por PK/columna bajo el mismo lock
↓
validar checksum restaurado
↓
commit del rollback
↓
liberar lock
```

Si alguna fila tiene una modificación posterior al valor escrito por K2, el rollback no la sobrescribe: crea conflicto y detiene el proceso. El lock solo se libera después de terminar rollback o de dejar un estado de incidente explícito.

No se utiliza `restore entire table`, `git reset`, `stash` ni rollback global.

---

## 8. Tests de exclusión definidos

No se ejecutan en esta tarea porque el mecanismo todavía no existe.

| Test | Preparación | Resultado esperado |
|---|---|---|
| A. K2 lock + writer | Adquirir freeze y lanzar cada writer real | Rechazo `K2_DOMAIN_LOCKED`; cero cambios |
| B. Writer antes + K2 | Mantener transacción writer abierta y solicitar K2 | Espera controlada o abort; nunca pisa; revalidación obliga |
| C. Dos K2 | Dos ejecuciones concurrentes | Solo una obtiene lock |
| D. Fallo K2 | Forzar error tras una fila | Rollback completo y lock liberado |
| E. Import automático | Ejecutar importador durante freeze | Rechazo en BD |
| F. Frontend | Intento directo desde cliente/API | Rechazo en BD, aunque no use UI |

Los tests deben ejecutarse contra una copia/entorno apropiado o con el procedimiento de seguridad aprobado; no se improvisan contra producción.

---

## 9. Gate de desbloqueo

K2 no se desbloquea hasta que exista y se pruebe:

1. guard de BD para las dos tablas y columnas K2;
2. punto de entrada único de migración;
3. lock adquirido durante snapshot revalidado, dry-run, K2 y rollback;
4. rechazo verificable para todos los writers listados;
5. comportamiento de pérdida de conexión;
6. test de dos K2 simultáneas;
7. snapshot actual y manifest `37f7157a` verificados;
8. allowlist sin cambios;
9. rollback por PK verificado;
10. prueba de cero cambios fuera de alcance.

Estado actual:

```text
K2 BLOCKED — INFRASTRUCTURE PREREQUISITE REQUIRED
```

El prerrequisito exacto a implementar en una tarea posterior es el write-freeze de dominio K2 impuesto por BD y su RPC transaccional. Esta tarea no lo implementa.

---

## 10. Respuestas

1. **Writers que pueden interferir:** ingredients UI/edit, albaranes-precios, pedido, receta detalle/importadores/TPV y trigger de normalización de ingredientes; no se identificó writer runtime de n8n/cron/OCR directo, pero su cero debe verificarse en el gate.
2. **Protección:** las cinco columnas K2 de `ingredients` y `recipe_ingredients.unit`, solo para las filas del snapshot.
3. **Punto común actual:** no existe un punto común suficiente.
4. **Mecanismo transaccional actual:** advisory lock aislado no basta; falta guard de BD obligatorio.
5. **Estrategia elegida:** write-freeze de dominio impuesto en BD + función/RPC transaccional de K2.
6. **Cómo se impide saltarlo:** trigger/guard en BD sobre todas las escrituras, no control de frontend.
7. **Writers automáticos:** atraviesan el guard y son rechazados durante el freeze.
8. **Si K2 falla:** rollback por PK bajo el lock; después se libera.
9. **Revalidación:** comparar snapshot por PK/columnas tras adquirir el lock; cualquier diferencia aborta.
10. **Prueba:** tests A-F de concurrencia definidos en §8, aún no ejecutados.
11. **Documento creado:** `marbella-os/6-investigacion/spikes/2026-08-10-desenclavamiento-concurrencia-k2.md`.
12. **K2 sigue bloqueada:** sí.
13. **Código modificado:** no.
14. **BD modificada:** no.
15. **Datos modificados:** no.
