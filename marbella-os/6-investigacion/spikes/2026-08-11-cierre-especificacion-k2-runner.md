---
documento: SPIKE-CIERRE-ESPECIFICACION-K2-RUNNER
clase: inmutable
estado: archivado
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-11
caducidad: no aplica
supersede: —
depende_de: CANON, GLOSARIO, MODELO-DE-DATOS, ARQUITECTURA, SEGURIDAD, PROTOCOLO-AGENTES
---

# Cierre de especificación K2 Runner / K2b

> **MATERIAL NO NORMATIVO — SPIKE-CIERRE-ESPECIFICACION-K2-RUNNER**
>
> Cierre técnico previo a implementación. No crea runner, tabla, migración ni tests ejecutables; no modifica datos y no ejecuta K2b.

**Freeze:** `INACTIVE`  
**Datos modificados:** `NO`  
**K2:** no ejecutada  
**K2b:** no ejecutada.

## A. Estado

El repositorio contiene infraestructura de freeze, snapshots y comparación read-only, pero no contiene K2 Runner, K2b ni registro de ejecuciones.

El cierre documental puede fijar el contrato de canal, transacción, seguridad, reintentos, postconditions, checksum, registry y concurrencia. No puede inventar el mapa de transformación que K2b debe escribir.

**Resultado:** `NOT READY FOR K2 RUNNER IMPLEMENTATION`.

## B. K2b scope

K2 es el tramo `K2a + K2b` del DAG:

- `K2a`: snapshot y clasificación read-only;
- `K2b`: normalización textual determinista y reversible.

K2b solo puede afectar:

| Tabla | PK | Columnas allowlist |
|---|---|---|
| `public.ingredients` | `id` | `purchase_unit`, `unit_type`, `recipe_unit`, `unit`, `order_unit` |
| `public.recipe_ingredients` | `id` | `unit` |

Quedan fuera precios, stock, mappings, presentations, recipe structure, nuevas tablas canónicas, 216 mappings ambiguos, 14 líneas F y 148 conversiones de contexto.

## C. Allowlist y mapa K2b

La allowlist de tablas/columnas está definida. El **mapa exhaustivo de escritura no está definido**.

Los artefactos actuales contienen:

- snapshot K2: 226 ingredientes y 362 líneas, con valores actuales;
- manifest y allowlist;
- comparador read-only;
- clasificación agregada A/B/F del dry-run.

No contienen, por cada PK y columna:

```text
PK → columna → valor actual → valor objetivo → regla → evidencia → writer
```

El plan menciona `u→ud`, `unitat→ud` y `gr→g/kg`, pero no entrega una tabla ejecutable que determine cada valor objetivo. En particular, `gr→g/kg` depende del contexto y `order_unit` puede representar presentación (`caja`, `pack`) en vez de unidad física.

**K2b allowlist: NOT READY.**  
No se puede escribir K2b sin este mapa. El snapshot actual no se transforma en mapa por inferencia.

## D. Canal PostgreSQL

La opción técnicamente compatible con el repositorio es:

```text
script operativo en scripts/k2
→ una conexión PostgreSQL directa al pooler
→ una única sesión psql/libpq
→ SET ROLE service_role
→ BEGIN ... COMMIT/ROLLBACK
```

Evidencia read-only actual:

- `current_user=postgres`;
- existe el rol `service_role`;
- `postgres` puede asumir `service_role`;
- `service_role` tiene `EXECUTE` sobre las funciones privadas K2;
- no existe dependencia `pg` en `package.json`;
- `scripts/k2/compare-snapshot-rows.cjs` ya usa `psql` y la URL pooler.

### Decisión

El futuro runner usará una conexión PostgreSQL directa en `scripts/k2`, con una sola sesión y rol efectivo `service_role`. No usará Supabase Data API, PostgREST, Server Action ni varias llamadas HTTP para simular una transacción.

No se crea el script todavía.

## E. Transaction boundary

La operación futura tendrá dos momentos, sin TOCTOU:

### Preflight

Read-only fuera de la ventana de escritura:

```text
R1 PASS
→ snapshot/dry-run
→ Global Write Preflight
```

### Transacción protegida

Una única sesión PostgreSQL:

```sql
BEGIN;
SET LOCAL ROLE service_role;

SELECT private.k2_acquire_domain_freeze(run_id, ...);
-- lock y estado del freeze permanecen en esta transacción

-- revalidar snapshot bajo el lock
-- Global Write Revalidation
SELECT private.k2_authorize_transaction(run_id);

-- K2b allowlist, solo con mapa aprobado
-- postconditions y checksum

COMMIT;
```

Ante cualquier fallo:

```sql
ROLLBACK;
```

Después de un commit, la liberación del freeze se ejecuta por la función oficial en una transacción de control separada. Si la adquisición se revierte, no se debe ejecutar una liberación ficticia; el estado transaccional y el TTL deben quedar comprobados.

La condición global se evalúa dos veces: preflight antes de abrir la ventana y revalidación dentro de la transacción, inmediatamente antes del primer write K2b. Así se evita que un PASS antiguo se use después de cambiar snapshot, freeze o writers.

## F. Authorization

La autorización utiliza exclusivamente:

- `private.k2_acquire_domain_freeze`;
- `private.k2_authorize_transaction`;
- `private.k2_guard_protected_write`;
- `private.k2_release_domain_freeze`.

`k2_authorize_transaction` no es el Global Write Gate. Solo valida freeze/run_id y establece contexto transaction-local.

Requisitos:

- rol efectivo `service_role`;
- `anon` y `authenticated` sin ejecución;
- `run_id` único;
- freeze activo y no expirado;
- autorización válida solo en la transacción actual.

## G. Idempotency

La unidad de idempotencia es `run_id` + checksum del mapa K2b + snapshot checksum.

- Un mapa ya `COMMITTED` no se vuelve a escribir: devuelve éxito idempotente sin DML.
- Un mapa con snapshot distinto se rechaza.
- Un `run_id` no se reutiliza después de `WRITING`, `COMMITTED`, `ROLLED_BACK` o `FAILED` definitivo.
- Un reintento operativo genera un nuevo `run_id` después de confirmar el estado anterior.
- Las filas que ya tienen el valor objetivo se validan como no-op solo si el snapshot y el mapa coinciden.

## H. Retry policy

| Estado anterior | Retry permitido | Acción |
|---|---|---|
| `CREATED` | sí | repetir preflight |
| `PREFLIGHT` | sí | repetir preflight con snapshot vigente |
| `AUTHORIZED` | no inmediato | comprobar transacción/rollback y cerrar run |
| `WRITING` | no automático | consultar conexión/estado; nunca aplicar segundo run a ciegas |
| `COMMITTED` | no escritura | devolver éxito idempotente |
| `ROLLED_BACK` | sí con nuevo run_id | repetir solo tras nuevo preflight |
| `FAILED` | depende de causa | nuevo run_id después de incidente resuelto |

Estados mínimos del registry:

```text
CREATED → PREFLIGHT → AUTHORIZED → WRITING → COMMITTED
                                      └────→ ROLLED_BACK
                                      └────→ FAILED
```

## I. Postconditions

Antes de `COMMIT`, el runner debe comparar `EXPECTED RESULT` y `ACTUAL RESULT`:

- número esperado de cambios;
- número real de cambios;
- conjunto exacto de PKs;
- conjunto exacto de columnas;
- valor final por PK/columna;
- checksum esperado y actual;
- ausencia de DML fuera de allowlist;
- snapshot restaurable.

Si cualquier comparación falla, el resultado es `K2_WRITE_BLOCKED` y se ejecuta rollback. No existe estado “parece correcto”.

## J. Checksum

Se usarán dos hashes distintos:

1. `snapshot_checksum`: checksum del snapshot K2 existente, que no se modifica.
2. `k2b_map_checksum`: SHA-256 de una representación canónica del mapa aprobado.

Formato canónico propuesto para cada entrada:

```text
k2b-map-v1\n
table\tpk\tcolumn\tjson_scalar(before)\tjson_scalar(after)\n
```

Las líneas se ordenan por `table`, PK textual y `column`. Se hashea el UTF-8 de la concatenación completa. El mismo algoritmo se aplica al resultado actual dentro de la transacción.

Este checksum solo puede implementarse cuando exista el mapa completo por PK/columna. No se ejecuta ni se genera aquí.

## K. Execution registry

`private.k2_domain_freezes` no basta como histórico: conserva estado de freeze, pero no expected/actual checksum, filas, postconditions ni estado completo de ejecución.

El contrato requiere una única tabla privada futura:

```text
private.k2_execution_runs
```

Campos mínimos:

| Campo | Propósito |
|---|---|
| `run_id uuid primary key` | identidad de ejecución |
| `operation text` | `k2b` |
| `status text` | máquina de estados |
| `actor text` | runner/service_role |
| `snapshot_ref text` | snapshot usado |
| `snapshot_checksum text` | integridad de entrada |
| `dry_run_ref text` | propuesta aprobada |
| `expected_checksum text` | resultado esperado |
| `actual_checksum text` | resultado observado |
| `expected_rows integer` | cardinalidad esperada |
| `changed_rows integer` | cardinalidad real |
| `error_code text` | fallo determinista |
| `error_detail jsonb` | diagnóstico |
| `created_at/acquired_at/finished_at timestamptz` | auditoría temporal |
| `committed_at/rolled_back_at timestamptz` | resultado |

La tabla debe vivir en `private`, con acceso revocado a `PUBLIC`, `anon` y `authenticated`, y writer único del runner. No se crea en esta tarea.

## L. Concurrency

Se reutiliza el mecanismo existente:

- advisory lock de `private.k2_acquire_domain_freeze` para una K2 simultánea;
- fila `private.k2_domain_freezes` protegida;
- triggers `private.k2_guard_protected_write` para writers;
- `run_id` propio y TTL;
- revalidación de snapshot tras adquirir el lock.

No se crea otro lock paralelo. Dos runners no pueden tener una ventana activa simultáneamente. Un writer iniciado antes termina o aborta; K2 no pisa sin revalidar.

## M. Rollback

Rollback dentro de la misma transacción y lock:

1. error o postcondition FAIL;
2. `ROLLBACK` transaccional;
3. validar que no hay delta persistido;
4. registrar `ROLLED_BACK`;
5. liberar freeze por función oficial cuando corresponda.

Si una fila difiere del before esperado, se produce conflicto y no se restaura silenciosamente una escritura posterior.

## N. Security

- PostgreSQL directo, no Data API para la transacción;
- `SET ROLE service_role` verificado como capacidad disponible en la sesión actual;
- `anon`/`authenticated` sin `EXECUTE` de funciones privadas;
- no frontend ni Server Action;
- freeze obligatorio;
- autorización transaction-local;
- triggers de BD como defensa final;
- no bypass de Global Write Gate.

## O. Failure matrix

| Situación | Resultado |
|---|---|
| R1 FAIL | `K2_WRITE_BLOCKED`; no BEGIN de operación K2b |
| Snapshot drift | abortar antes de write |
| Mapa ausente/incompleto | `K2_WRITE_BLOCKED` |
| Freeze INACTIVE | no autorizar |
| run_id inválido | `K2_FREEZE_NOT_AUTHORIZED` |
| service_role no efectivo | DENIED |
| writer concurrente | rechazo del trigger o abort controlado |
| postcondition FAIL | rollback |
| commit desconocido | no reintentar; resolver estado del run |
| run COMMITTED repetido | éxito idempotente sin DML |

## P. Test contract

Tests futuros, sin ejecutar K2b real:

1. preflight FAIL no inicia K2b;
2. gate global FAIL no inicia K2b;
3. freeze INACTIVE bloquea;
4. service_role ausente deniega;
5. run_id inválido deniega;
6. R1 FAIL bloquea;
7. todos PASS produce autorización en fixture sin DML funcional;
8. error durante write produce rollback;
9. postcondition FAIL produce rollback;
10. run_id reutilizado se deniega o devuelve éxito idempotente según estado;
11. dos runners simultáneos: uno solo adquiere freeze;
12. todos los writers A-J mantienen semántica.

## Q. Implementation contract

La implementación futura deberá crear, en una tarea separada:

- `scripts/k2/run-k2.cjs` como runner operativo;
- `scripts/k2/run-k2.test.cjs` o suite equivalente;
- mapa K2b versionado por run;
- registry `private.k2_execution_runs` mediante migración de infraestructura;
- checksum/postconditions;
- conexión PostgreSQL única mediante `psql`/libpq con rol efectivo `service_role`;
- comando de ejecución explícito que no sea frontend.

No se crea ninguno ahora.

## R. Final decision

Decisiones cerradas:

- canal: PostgreSQL directo en una única sesión;
- rol: `service_role` efectivo;
- boundary: una transacción desde acquire/revalidación hasta K2b/postconditions;
- TOCTOU: preflight más revalidación bajo lock;
- retry: máquina de estados con run_id único;
- rollback: transaccional bajo lock;
- checksum: snapshot existente más hash canónico del mapa;
- registry: `private.k2_execution_runs` como única fuente de estado histórico;
- concurrencia: infraestructura `private.k2_*` existente.

Decisiones abiertas que impiden READY:

1. mapa exhaustivo K2b por PK/columna/valor objetivo;
2. confirmación del contrato exacto de conexión `psql`/libpq dentro del runner;
3. creación futura de registry y postconditions en una migración de infraestructura.

La primera es una decisión de datos/dry-run; no se puede inventar desde el snapshot.

## S. Gate READY FOR IMPLEMENTATION

```text
K2b allowlist = NOT READY
PostgreSQL channel = DECIDED
Transaction boundary = DECIDED
TOCTOU = RESOLVED
Idempotency = DECIDED
Retry policy = DECIDED
Rollback = DECIDED
Postconditions = DECIDED
Checksum = DECIDED
Execution registry = DECIDED (table not created)
Concurrency = DECIDED
Security = DECIDED
Tests = DECIDED
K2 Runner READY FOR IMPLEMENTATION = NO
K2 = NO EJECUTADA
K2b = NO EJECUTADA
Freeze = INACTIVE
```

Mientras el mapa row-by-row no exista y no esté aprobado, implementar el runner permitiría decidir durante la escritura qué filas/valores tocar. Eso está prohibido por el contrato de K2b.
