---
documento: SPIKE-IMPLEMENTACION-WRITE-FREEZE-K2
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

# Implementación del write-freeze de dominio K2

> **MATERIAL NO NORMATIVO — SPIKE-IMPLEMENTACION-WRITE-FREEZE-K2**
>
> Registro de infraestructura preparada para K2. No ejecuta K2, no transforma datos y no sustituye la auditoría de concurrencia.

## 1. Problema

K2 protege cinco columnas de `ingredients` y `recipe_ingredients.unit`, pero los writers actuales llegan por clientes directos, Server Actions, importadores y triggers. Un advisory lock aislado no los cubriría.

## 2. Arquitectura elegida

Se implementa como infraestructura de BD:

- estado privado `private.k2_domain_freezes`;
- activación, renovación, estado y liberación por funciones privadas;
- contexto transaccional local para la operación K2 autorizada;
- triggers de guard sobre los writes protegidos;
- advisory lock transaccional solo para serializar activación/liberación, no como única protección;
- TTL para que un proceso muerto no deje el dominio congelado indefinidamente.

No hay flag de frontend, bypass público ni bloqueo global de la aplicación.

## 3. Dominio protegido

| Tabla | Writes protegidos |
|---|---|
| `public.ingredients` | INSERT/DELETE y UPDATE de `purchase_unit`, `unit_type`, `recipe_unit`, `unit`, `order_unit` |
| `public.recipe_ingredients` | INSERT/DELETE y UPDATE de `unit` |

Las lecturas no se bloquean. Los writes de columnas no protegidas siguen fuera del freeze, salvo INSERT/DELETE de las tablas protegidas para impedir que aparezcan filas fuera del snapshot durante K2.

## 4. Writers cubiertos

El guard de BD cubre, sin depender del punto de entrada:

- ingredientes y edición;
- albaranes-precios;
- pedidos que actualizan `order_unit`;
- detalle/importación/TPV de recetas;
- importación legacy;
- trigger de normalización de ingredientes;
- cualquier API, RPC, job, n8n, OCR o IA que intente llegar a esos writes.

La matriz detallada está en `2026-08-10-desenclavamiento-concurrencia-k2.md`.

## 5. Activación y liberación

Funciones privadas creadas:

- `private.k2_acquire_domain_freeze(uuid, text, uuid, interval)`;
- `private.k2_domain_freeze_status()`;
- `private.k2_renew_domain_freeze(uuid, interval)`;
- `private.k2_release_domain_freeze(uuid)`;
- `private.k2_authorize_transaction(uuid)`.

El estado registra dominio, `run_id`, propietario opcional, motivo, adquisición, expiración, liberación y metadata. El TTL está limitado a una hora por llamada.

La operación K2 futura debe adquirir el freeze, autorizar la transacción, revalidar el snapshot, ejecutar, validar/rollback y liberar dentro de su procedimiento autorizado. El contexto de autorización es transaction-local y desaparece en commit/rollback.

## 6. Guard y bypass

El trigger `private.k2_guard_protected_write()` comprueba el freeze directamente en BD. Si está activo, solo permite una escritura cuyo contexto local tenga el mismo `run_id` y autorización transaccional.

El bypass:

- no está expuesto a `anon` ni `authenticated`;
- solo tiene ejecución para `service_role`/procedimiento autorizado;
- exige `run_id` activo y no expirado;
- no es reutilizable como writer normal;
- queda auditado en el estado del freeze.

Una simple bandera enviada por cliente no puede saltarlo.

## 7. Atomicidad y fallos

- Activación duplicada: `K2_DOMAIN_FREEZE_ACTIVE`.
- Dos K2 simultáneas: solo una adquiere el dominio.
- Pérdida de conexión: la transacción libera locks; el TTL permite recuperar un estado persistido expirado.
- Error K2: rollback antes de liberar.
- Writer previo en vuelo: el guard comparte la fila de control; la adquisición espera o aborta y después se revalida el snapshot.

## 8. Archivos creados

- `supabase/migrations/20260810191300_k2_domain_write_freeze.sql`;
- `sql/diagnostics/k2/2026-08-10-write-freeze-k2.test.sql`;
- este registro.

La migración crea únicamente infraestructura de freeze, guard, permisos y funciones. No actualiza filas de producto ni ejecuta la normalización K2.

## 9. Tests

El suite SQL define A-J:

- writer permitido con freeze OFF;
- rechazo de `purchase_unit`, `unit_type` y `recipe_ingredients.unit` con freeze ON;
- lecturas permitidas;
- operación autorizada permitida;
- run id inválido rechazado;
- doble K2 rechazada;
- rollback de transacción y estado seguro;
- writers automáticos cubiertos por los mismos triggers;
- privilegios públicos sin acceso a funciones de control.

No se han ejecutado porque la migración aún no está aplicada a la BD.

## 10. Limitación de aplicación

En el entorno actual:

- `supabase` CLI no está instalado;
- no existe `supabase/config.toml`;
- no existe `DATABASE_URL`, `POSTGRES_URL` ni `SUPABASE_DB_URL` en el entorno;
- solo están disponibles URL y claves de Data API, que no permiten aplicar DDL arbitrario.

Por esta razón no se ha aplicado la migración remota, no se han ejecutado tests SQL y no se puede afirmar que el guard esté activo en la BD real. No se improvisa un canal de aplicación.

## 11. Gate

| Criterio | Resultado |
|---|---|
| Migración de infraestructura escrita | PASS |
| Guard cubre tablas/columnas K2 | PASS documental |
| Bypass público inexistente | PASS por SQL diseñado |
| Suite A-J escrita | PASS |
| Migración aplicada en BD real | **FAIL: canal DB no disponible** |
| Tests SQL A-J ejecutados | **FAIL: migración no aplicada** |
| K2 ejecutada | NO |
| Datos K2 modificados | NO |

```text
K2 BLOCKED — INFRASTRUCTURE NOT APPLIED
```

Antes de desbloquear K2 se necesita aplicar esta migración por un canal PostgreSQL autorizado y ejecutar el suite SQL A-J contra la BD objetivo. No se debe ejecutar K2 antes de que ese gate sea PASS.
