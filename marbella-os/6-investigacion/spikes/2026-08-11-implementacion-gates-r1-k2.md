---
documento: SPIKE-IMPLEMENTACION-GATES-R1-K2
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

# Implementación de gates R1 / Global K2 Write

> **MATERIAL NO NORMATIVO — SPIKE-IMPLEMENTACION-GATES-R1-K2**
>
> Registro del intento de implementación detenido antes de modificar código o SQL funcional. No ejecuta K2, K2b ni ninguna fase posterior.

## Estado

**Resultado: `BLOCKED — IMPLEMENTATION POINT MISSING`**

La decisión documental fija la ubicación del gate, pero el repositorio no contiene todavía el componente al que insertarlo.

## Evidencia

| Comprobación | Resultado |
|---|---|
| K2 Runner existente | no encontrado |
| Punto `K2b WRITE START` en `src/` | no encontrado |
| Función Global K2 Write Gate existente | no encontrada |
| Tests R1/Global Write existentes | no encontrados |
| `validacion-preimplementacion-gates-k2.md` | no existe |
| Freeze SQL existente | sí, infraestructura en `20260810191300_k2_domain_write_freeze.sql` |
| Funciones privadas de freeze | sí |
| Global gate implementado en freeze | no |

El grep del repositorio solo encuentra `R1-CLASSIFICATION`, `GLOBAL K2 WRITE GATE` y `K2 WRITE AUTHORIZED` en documentación. No existe un runner de aplicación que pueda reutilizarse.

## Por qué no se implementa

La decisión cerrada exige:

- reutilizar un K2 Runner autorizado;
- evaluar el gate inmediatamente antes de la transacción K2b;
- ligar la autorización a `run_id` y contexto transaccional;
- no crear un segundo sistema paralelo.

No existe ese runner ni existe una transacción K2b implementada. Crear ahora un runner, un endpoint, un servicio o una función SQL nueva sería inventar el punto de entrada prohibido por la petición. Reutilizar `private.k2_authorize_transaction(uuid)` como Global Write Gate también sería incorrecto: esa función solo establece autorización transaction-local después de comprobar el freeze; no evalúa R1, snapshot, dry-run, rollback, writers ni las condiciones globales.

El freeze existente permanece intacto y no se sustituye:

- `private.k2_acquire_domain_freeze` adquiere la ventana;
- `private.k2_authorize_transaction` liga el contexto al `run_id`;
- `private.k2_guard_protected_write` protege las tablas/columnas;
- ninguna de esas funciones es el Global K2 Write Gate.

## Alcance no modificado

- código: sin cambios realizados por esta tarea;
- SQL/migraciones: sin cambios;
- writers: sin cambios;
- datos: sin cambios;
- K2/K2b/K3/K12: no ejecutadas;
- freeze: `INACTIVE`.

Los cambios de código ajenos que estaban en el working tree no se tocaron.

## Contrato pendiente mínimo

Antes de implementar se necesita un documento de validación preimplementación que cierre, sin abrir arquitectura nueva:

1. el archivo/proceso concreto del K2 Runner;
2. el punto exacto de inicio de la transacción K2b;
3. la función o servicio que evalúa el preflight global;
4. la llamada de revalidación después de adquirir freeze;
5. la lista exacta de tests de gate sin ejecutar K2b;
6. el registro de razones `K2_WRITE_BLOCKED`;
7. el responsable operativo y credencial `service_role`;
8. el rollback de autorización y liberación del freeze.

Este contrato no puede deducirse como un archivo existente porque actualmente no hay implementación K2 Runner/K2b.

## Tests

No se implementaron tests de gates porque no existe código afectado. No se ejecutó la escritura funcional.

Validación documental ejecutada:

- `npm run validate:corpus`: PASS;
- estado de freeze: `INACTIVE`.

Los tests A-J del write-freeze siguen siendo infraestructura preexistente y no se alteraron ni se ejecutaron como parte de una escritura K2.

## Gate de implementación

```text
R1 GATE IMPLEMENTED = NO
GLOBAL K2 WRITE GATE IMPLEMENTED = NO
K2b WRITE START INTEGRATION = NOT AVAILABLE
IMPLEMENTATION = BLOCKED
K2 = NOT EXECUTED
```

La decisión documental sigue siendo correcta: el gate deberá ir inmediatamente antes de K2b. Lo que falta no es otra decisión de ubicación, sino el punto de implementación autorizado que la decisión exige y que el código no contiene.
