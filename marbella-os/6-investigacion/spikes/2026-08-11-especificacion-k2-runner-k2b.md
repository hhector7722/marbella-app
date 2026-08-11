---
documento: SPIKE-ESPECIFICACION-K2-RUNNER-K2B
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

# Especificación K2 Runner y K2b

> **MATERIAL NO NORMATIVO — SPIKE-ESPECIFICACION-K2-RUNNER-K2B**
>
> Especificación técnica previa a implementación. No crea el runner, no ejecuta K2b, no modifica código/SQL funcional y no modifica datos.

**Freeze consultado:** `INACTIVE`  
**K2:** no ejecutada  
**K2b:** no ejecutada  
**Datos modificados:** `NO`

## A. Bloqueo original

El Global K2 Write Gate está definido documentalmente, pero no existe un punto real de ejecución donde insertarlo:

- no existe K2 Runner en `src/`;
- no existe K2b Runner;
- no existe `K2b WRITE START`;
- no existe `K2_WRITE_*`;
- no existe una transacción K2b implementada;
- no existen tests del runner.

No se crea un runner paralelo en esta tarea porque la especificación aún contiene decisiones técnicas no cerradas.

## B. Evidencia de ausencia

La búsqueda real del repositorio distingue:

| Elemento | Resultado |
|---|---|
| Referencias documentales K2/K2b | sí |
| `scripts/k2/compare-snapshot-rows.cjs` | sí, solo comparador read-only |
| `sql/diagnostics/k2/2026-08-10-k2-snapshot-37f7157a.json` | sí, snapshot histórico |
| `supabase/migrations/20260810191300_k2_domain_write_freeze.sql` | sí, infraestructura freeze |
| `private.k2_acquire_domain_freeze` | sí |
| `private.k2_authorize_transaction` | sí, solo autorización transaction-local |
| K2 Runner real | no |
| K2b write start real | no |
| función Global Write Gate | no |
| script npm K2 | no |
| Server Action K2 | no |
| job/cron K2 | no |
| test específico del runner | no |

El package actual no tiene dependencia `pg` ni script de ejecución K2. El comparador existente usa procesos `psql` independientes y no es una base reutilizable para una transacción K2b.

## C. Definición K2

Según el DAG aprobado, K2 es el tramo formado por:

- **K2a:** snapshot y clasificación read-only;
- **K2b:** transformación textual determinista de filas aprobadas.

K2 no incluye resolución de presentations, precios, mappings ambiguos, coste canónico ni eliminación legacy.

## D. Definición K2b

K2b es una escritura transaccional y protegida. Su objetivo documental es normalizar el vocabulario textual legacy antes de las fases canónicas.

### Alcance conocido

- tabla `public.ingredients`;
- columnas allowlist: `purchase_unit`, `unit_type`, `recipe_unit`, `unit`, `order_unit`;
- tabla `public.recipe_ingredients`;
- columna allowlist: `unit`;
- filas: únicamente las incluidas en el snapshot y aprobadas por el dry-run;
- exclusiones: precios, stock, presentations, mappings, recipe structure y código;
- 216 mappings ambiguos fuera de K2b;
- 14 líneas F fuera de K2b;
- 148 conversiones de contexto no son normalización textual K2b.

### Transformación conocida

El plan describe `u→ud`, `unitat→ud` y normalizaciones textuales de `gr`/`g`/`kg` según contexto. También exige que una unidad desconocida no se convierta por defecto.

### UNRESOLVED de K2b

No existe todavía un mapa row-by-row aprobado para todas las filas K2b que determine:

- qué 200 filas A exactas entran;
- qué valor `gr` recibe cada fila;
- qué columnas cambian en cada PK;
- qué propuesta `before → after` se consume por el runner;
- qué filas se dejan fuera por dependencia de presentación o revisión.

El snapshot K2 conserva valores actuales, pero no es por sí mismo el mapa de transformación. El dry-run conceptual anterior tampoco es un artefacto ejecutable completo de K2b.

**Estado:** `UNRESOLVED — mapa K2b por PK/columna pendiente`.

## E. Definición K2 Runner

El K2 Runner futuro será un proceso operativo server-side, no una ruta frontend:

```text
K2 Runner
  → preflight read-only
  → verificación snapshot/dry-run
  → Global K2 Write Preflight
  → BEGIN de la operación protegida
  → acquire freeze / revalidación / autorización
  → K2b allowlist
  → postconditions
  → COMMIT o ROLLBACK
  → release freeze
```

No existe todavía la implementación. El nombre lógico no autoriza crearla en esta tarea.

## F. Responsabilidades

El runner deberá:

- recibir un `run_id` único o generarlo antes de la ventana;
- cargar manifest, snapshot y dry-run aprobados;
- comprobar drift antes de escribir;
- comprobar la allowlist;
- rechazar cualquier ambiguo o F incluido accidentalmente;
- evaluar el Global Write Gate;
- adquirir el freeze oficial;
- revalidar snapshot bajo exclusión;
- llamar `private.k2_authorize_transaction(run_id)` dentro del contexto correcto;
- ejecutar solo el delta K2b aprobado;
- validar before/after y postconditions;
- hacer rollback por PK/columna ante error;
- liberar el freeze siempre por el mecanismo oficial.

## G. Inputs

Inputs previstos:

- `run_id` único;
- baseline manifest K2;
- snapshot K2 original;
- dry-run K2 por PK/columna;
- allowlist de tablas/columnas;
- mapa K2b row-by-row aprobado;
- estado R1 read-only;
- resultado de gates previos;
- configuración de modo `dry-run` o `write`.

### UNRESOLVED de inputs

No está definido el contrato de formato del mapa K2b que el runner debe consumir, ni el archivo/proceso que lo generará. El snapshot de 588 filas no sustituye ese mapa.

## H. Preflight

El preflight futuro debe ser read-only y devolver `PASS` o `BLOCKED` con razones:

1. corpus válido;
2. baseline y snapshot presentes e íntegros;
3. snapshot drift cero;
4. R1 classification PASS;
5. dry-run K2b completo;
6. allowlist sin cambios;
7. cero filas ambiguas/F en el delta;
8. rollback por PK preparado;
9. writers inventariados;
10. aprobación explícita de la ventana.

No se implementa este preflight ahora.

## I. Global Write Gate

El gate global se evalúa inmediatamente antes de la transacción de escritura K2b.

Debe producir exactamente:

```text
K2_WRITE_AUTHORIZED
```

o:

```text
K2_WRITE_BLOCKED
```

No transforma datos y no puede reutilizar `private.k2_authorize_transaction` como sustituto. Esta última solo comprueba freeze/run_id y establece contexto local.

## J. Transaction boundary

### Secuencia requerida

```text
preflight read-only
→ GLOBAL WRITE PREFLIGHT
→ abrir conexión transaccional
→ adquirir freeze oficial y mantenerlo durante la operación
→ revalidar snapshot bajo lock
→ GLOBAL WRITE REVALIDATION
→ private.k2_authorize_transaction(run_id)
→ K2b writes allowlist
→ postconditions
→ COMMIT o ROLLBACK
→ release freeze
```

### UNRESOLVED de boundary

La infraestructura actual usa `pg_advisory_xact_lock` dentro de las funciones de adquisición/liberación. No está definido todavía el canal de conexión que permita:

- mantener la misma transacción/lock desde acquire hasta K2b;
- ejecutar como `service_role` o procedimiento autorizado;
- hacer el `BEGIN` real y enviar todos los statements en una única sesión;
- liberar freeze y observar rollback ante pérdida de conexión.

El comparador actual abre procesos `psql` separados por consulta y no puede reutilizarse para esto.

**Estado:** `UNRESOLVED — canal de conexión transaccional y rol efectivo`.

## K. Write

El write futuro debe limitarse a:

- `public.ingredients` y sus cinco columnas allowlist;
- `public.recipe_ingredients.unit`;
- PKs presentes en el snapshot y mapa K2b aprobado;
- valores before/after que coincidan con la revalidación.

No se escriben mappings, presentations, precios, stock, nuevas tablas canónicas ni filas fuera del snapshot.

## L. Postconditions

Después de K2b y antes de commit:

- cada PK escrita tiene el after esperado;
- cada PK no incluida permanece igual;
- no hay unidades desconocidas en el delta;
- no hay factor implícito;
- el checksum post-write coincide con el mapa esperado;
- no cambia ninguna tabla fuera de allowlist;
- se puede producir el reporte before/after;
- el rollback por PK devolvería el checksum original.

### UNRESOLVED

No existe función o script postcondition que calcule y registre ese checksum transaccional. El algoritmo exacto debe definirse junto con el mapa K2b y el runner.

## M. Rollback

El diseño existente define:

- rollback dentro del mismo lock/freeze;
- restauración por PK/columna;
- checksum restaurado antes de liberar;
- conflicto si una fila difiere del before esperado;
- no `DROP`, `DELETE`, restore de tabla completa ni overwrite de escrituras posteriores;
- liberación oficial de freeze después del rollback.

**Rollback conceptual:** `SÍ`.  
**Rollback implementado en runner:** `NO`.

## N. Idempotencia

La normalización textual puede ser no-op al reintentar si el mapa se aplica contra el after ya existente. Sin embargo, el contrato ejecutable debe definir:

- si un `run_id` repetido se rechaza o devuelve resultado idempotente;
- si un run committed puede volver a ejecutarse;
- cómo se registra el estado del run;
- cómo se detecta un mapa usado con snapshot distinto.

La infraestructura de freeze impide dos operaciones simultáneas, pero no define por sí sola el registro de ejecución K2b.

**Estado:** `UNRESOLVED — política de reintento y registro de run`.

## O. Seguridad

Requisitos definidos:

- ejecución server-side con `service_role`/procedimiento autorizado;
- no frontend;
- no `anon`;
- no `authenticated`;
- no bypass público;
- freeze activo;
- `run_id` único y transaction-local;
- triggers de BD como defensa final;
- abortar ante cualquier precondición fallida.

La migración de freeze concede ejecución solo a `service_role` y mantiene privadas las funciones. No se modifican esos permisos.

## P. Ubicación en arquitectura

La ubicación más consistente con el repositorio es un proceso operativo en `scripts/k2/`, porque:

- ya existe `scripts/k2/compare-snapshot-rows.cjs`;
- K2 es una operación de datos contra PostgreSQL real;
- no existe una Server Action autorizada para migraciones;
- una ruta frontend no puede custodiar `service_role` ni una ventana transaccional de migración;
- el runner necesita una única conexión PostgreSQL.

### Ubicación propuesta, no creada

```text
scripts/k2/run-k2.cjs
scripts/k2/run-k2.test.cjs
```

Esto es una ubicación de implementación futura, no una afirmación de que los archivos existan. La dependencia de conexión/rol debe cerrarse antes de crear esos archivos.

## Q. Tests futuros

La especificación de tests es:

1. preflight FAIL: K2b no comienza;
2. Global Gate FAIL: K2b no comienza;
3. freeze INACTIVE: K2b no comienza;
4. service_role ausente: DENIED;
5. run_id inválido: DENIED;
6. R1 FAIL: K2b no comienza;
7. todos PASS: autorización obtenida sin ejecutar K2b real;
8. error durante K2b: rollback;
9. postcondition FAIL: rollback;
10. run_id reutilizado: DENIED o resultado idempotente según contrato aprobado.

También deben conservarse los tests de freeze A-J y añadir pruebas de concurrencia A-F definidas en el spike de desenclavamiento.

Estos tests no existen aún porque el runner no existe. No se ejecutan transacciones simuladas contra datos reales en esta tarea.

## R. Dependencias

Dependencias cerradas/reutilizables:

- infraestructura `private.k2_domain_freezes`;
- `private.k2_acquire_domain_freeze`;
- `private.k2_domain_freeze_status`;
- `private.k2_renew_domain_freeze`;
- `private.k2_release_domain_freeze`;
- `private.k2_authorize_transaction`;
- `private.k2_guard_protected_write`;
- snapshot y baseline K2;
- comparador read-only.

Dependencias no implementadas:

- K2 Runner;
- mapa K2b row-by-row;
- canal PostgreSQL transaccional con rol autorizado;
- registro de run/idempotencia;
- postconditions/checksum;
- tests del runner;
- comando npm o procedimiento de ejecución.

## S. Implementación necesaria

La implementación futura debe crear, en una tarea autorizada separada:

| Elemento | Ubicación propuesta | Estado |
|---|---|---|
| K2 Runner | `scripts/k2/run-k2.cjs` | UNRESOLVED hasta cerrar conexión/rol |
| Tests runner | `scripts/k2/run-k2.test.cjs` o suite equivalente | no existe |
| Mapa K2b | artefacto diagnóstico versionado por run | no definido |
| Global Gate | función de preflight dentro del runner, no bypass SQL | no existe |
| Boundary transaccional | una única sesión PostgreSQL | canal no definido |
| Postconditions | validación por PK/checksum | no existe |
| Idempotencia | estado/run registry o política explícita | no definido |

No se crea ninguno de estos elementos ahora.

## T. Riesgos

- Un runner sin sesión única podría liberar el advisory lock antes de K2b.
- Usar Data API/Supabase JS no garantiza una transacción multi-statement apropiada para este flujo.
- `service_role` de Data API no equivale automáticamente a un rol PostgreSQL con los privilegios esperados por `GRANT` SQL.
- Sin mapa K2b por PK se podría normalizar una fila B/F por error.
- Sin registro de run, un reintento podría aplicar un mapa obsoleto.
- El write-freeze protege el dominio, pero no sustituye el Global Write Gate ni sus postconditions.

## U. Gate de preparación

```text
K2 RUNNER EXISTENTE = NO
K2b WRITE START = NO
K2 RUNNER ESPECIFICADO = NO
TRANSACTION BOUNDARY = NO, canal/rol pendiente
ROLLBACK CONCEPTUAL = SÍ
IDEMPOTENCIA EJECUTABLE = NO
SEGURIDAD CONCEPTUAL = SÍ
TESTS ESPECIFICADOS = SÍ
IMPLEMENTACIÓN K2 RUNNER = NO
READY FOR K2 RUNNER IMPLEMENTATION = NO
K2 = NO EJECUTADA
K2b = NO EJECUTADA
FREEZE = INACTIVE
```

Las decisiones pendientes concretas son: canal PostgreSQL transaccional y rol efectivo, formato del mapa K2b por PK/columna, registro/idempotencia de run y algoritmo de postconditions/checksum. Hasta resolverlas, no se implementa ni se ejecuta el runner.
