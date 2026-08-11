---
documento: SPIKE-DECISION-GLOBAL-WRITE-GATE-K2
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

# Decisión: ubicación del Global K2 Write Gate

> **MATERIAL NO NORMATIVO — SPIKE-DECISION-GLOBAL-WRITE-GATE-K2**
>
> Resolución documental de una contradicción entre spikes inmutables. No modifica código, SQL, triggers, writers, datos ni migraciones. No ejecuta K2, K2b, K3 ni K12.

**Freeze consultado:** `INACTIVE`  
**Datos modificados:** `NO`  
**Decisión:** el gate global se evalúa inmediatamente antes de la transacción de escritura K2b.

## A. Contradicción detectada

Dos documentos describían posiciones distintas:

1. `2026-08-10-cierre-decisiones-migracion.md §8` sitúa `K2b` antes de `K3` y define K2b como normalización textual con cambios, mapa reversible y snapshot por fila.
2. `2026-08-11-correccion-gates-r1-k2.md §J` dibuja el `GLOBAL K2 WRITE GATE` después de K12.

La segunda posición permitiría que una escritura K2b ocurriera antes de evaluar el gate global. Esa secuencia no es segura y contradice la regla de que un gate que protege una escritura debe precederla.

## B. Fuentes

| Fuente | Hecho relevante | Autoridad operativa |
|---|---|---|
| `2026-08-10-cierre-decisiones-migracion.md §8` | DAG `K1 → K2a → K2b → K3 ... K12`; K2b cambia normalización textual | plan de fases cerrado |
| `2026-08-10-resolucion-bloqueos-migracion.md §2` | K2a es preflight; K2b transforma solo deterministas; rollback por snapshot/mapa | contrato de fases |
| `2026-08-11-plan-desbloqueo-k2.md §K/L` | R1 precede K2a; R9 controla writers antes de K2b; dry-run y autorización son distintos | plan de desbloqueo |
| `2026-08-11-correccion-gates-r1-k2.md §I/J` | separa clasificación R1 de autorización global, pero coloca el write gate demasiado tarde | documento contradictorio que se reconcilia aquí |
| `2026-08-10-implementacion-write-freeze-k2.md §5-7` | el runner debe adquirir freeze, autorizar transacción, revalidar snapshot, ejecutar y liberar | mecanismo de seguridad |
| `20260810191300_k2_domain_write_freeze.sql` | funciones oficiales y contexto transaccional `run_id` | infraestructura instalada |

## C. Precedencia

Los documentos de investigación citados son `clase: inmutable`, `estado: archivado`, `normativo: false`, `precedencia: 0`. Ninguno gana por fecha: `CANON §6` impide elegir silenciosamente entre documentos de igual precedencia.

No se modifica ningún spike histórico. Este documento reconcilia la contradicción para el plan operativo; no convierte un análisis en norma de producto ni sustituye un ADR si una futura decisión cambia la arquitectura normativa.

La posición se decide por una regla ya contenida en el contrato de K2b: si K2b cambia datos, el gate que protege esa escritura debe ejecutarse antes de K2b.

## D. Definición de K2

En el DAG cerrado, K2 es el tramo operativo compuesto por:

- `K2a`: preflight, snapshot y clasificación read-only;
- `K2b`: transformación textual determinista de las filas aprobadas.

K2 no es una única operación indiferenciada. La salida read-only de K2a no autoriza por sí sola la escritura K2b.

## E. Definición de K2b

`K2b` **sí escribe datos**.

Evidencia:

- `cierre-decisiones-migracion.md §8`: “Normalización textual” con cambios y rollback por snapshot por fila;
- `resolucion-bloqueos-migracion.md §2`: “Transformaciones deterministas” y “legacy textual coherente”;
- `plan-desbloqueo-k2.md §K`: K2b se distingue del dry-run y R9 debe controlar writers antes de cualquier escritura K2b;
- allowlist K2: columnas de `ingredients` y `recipe_ingredients.unit`.

K2b no resuelve presentations, no corrige precios, no selecciona mappings ambiguos y no toca las 14 líneas F. Solo podría escribir el delta textual determinista aprobado, por PK y columna, dentro de su allowlist.

## F. DAG actual reconstruido

El DAG aprobado es:

```text
K1
  ↓
K2a — snapshot y clasificación, read-only
  ↓
K2b — normalización textual determinista, escritura protegida
  ↓
K3 — selección determinista de mappings
  ↓
K5 — writer único de stock
  ↓
K8a — estructura canónica
  ↓
K6 — conversiones
  ↓
K7 — paridad
  ↓
K8b — backfill canónico y presentations
  ↓
K9 — precio maestro
  ↓
K4 — coste con estados
  ↓
K10 — stock reconstruible
  ↓
K11 — flujos canónicos
  ↓
K12 — retirada legacy
```

`R1-CLASSIFICATION PASS` es una precondición read-only de K2a. No es una fase que escriba ni mueve K2b después de K12.

## G. Análisis de alternativas

### Posición A: gate antes de K2b

```text
R1 PASS → K2a PASS → GLOBAL WRITE PREFLIGHT
→ acquire freeze → revalidar gate/snapshot
→ K2b WRITE → validar/commit o rollback → release freeze
→ K3
```

Garantiza que ninguna escritura protegida comienza sin pasar el gate. Es compatible con el write-freeze, el rollback por fila y el DAG aprobado. Los writers legacy quedan bloqueados durante la ventana.

### Posición B: gate después de K12

```text
K2b WRITE → K3 → ... → K12 → GLOBAL WRITE GATE
```

No es válida: K2b ya habría escrito antes de que el gate comprobara snapshot, writers, rollback e invariantes. El freeze no corrige un gate que llega tarde; solo impide writers no autorizados, no sustituye la autorización de la operación K2b.

### Decisión

Se adopta la posición A. La posición B queda descartada por permitir escritura anterior al gate.

## H. Decisión

El `GLOBAL K2 WRITE GATE` se evalúa en dos momentos de una única operación K2b:

1. **Preflight global**, después de K2a y antes de adquirir la ventana de escritura. Comprueba todas las condiciones conocidas, dry-run, snapshot, alcance, rollback, writers y aprobación.
2. **Revalidación transaccional**, después de adquirir el write-freeze y antes del primer `UPDATE` de K2b. Comprueba que el freeze pertenece al `run_id`, que el snapshot sigue sin drift y que el gate sigue PASS.

Solo la segunda evaluación produce `K2_WRITE_AUTHORIZED` dentro del contexto transaccional. Si falla, no se ejecuta K2b y se libera el freeze por el mecanismo oficial.

## I. Ubicación definitiva del gate

```text
R1-CLASSIFICATION PASS
  ↓
K2a PASS / dry-run K2a
  ↓
GLOBAL K2 WRITE PREFLIGHT
  ↓
private.k2_acquire_domain_freeze(...)
  ↓
snapshot revalidation + GLOBAL K2 WRITE REVALIDATION
  ↓
private.k2_authorize_transaction(run_id)
  ↓
K2b WRITE
  ↓
validate / commit o rollback
  ↓
private.k2_release_domain_freeze(run_id)
  ↓
K3
```

La posición canónica es **inmediatamente antes de la transacción de escritura K2b**, no después de K12.

## J. Responsable

El responsable lógico es el **K2 Runner autorizado**, un proceso server-side/operativo que aún no está implementado.

Contrato de responsabilidad:

- identidad: `service_role` o procedimiento server-side equivalente;
- no es frontend, `anon`, `authenticated`, job sin autorización ni RPC público;
- evalúa el preflight y la revalidación;
- genera un `run_id` único;
- adquiere y libera el freeze mediante funciones oficiales;
- llama `private.k2_authorize_transaction(run_id)` dentro de la transacción;
- ejecuta solo K2b allowlist si el gate pasa;
- valida, confirma o revierte;
- deja el freeze `INACTIVE` al terminar.

No existe todavía un archivo o función de aplicación que implemente este runner. Esa implementación queda para una tarea posterior; la responsabilidad y el contrato quedan definidos aquí sin inventar un nombre de archivo actual.

## K. Contrato del gate

### Inputs

- `R1-CLASSIFICATION PASS`;
- resultado K2a y dry-run por PK/columna;
- baseline y snapshot K2;
- `snapshot drift = 0`;
- allowlist exacta de tablas/columnas;
- clasificación sin ambiguos seleccionados;
- 14 F fuera del delta o resueltas con evidencia;
- writers controlados;
- invariantes aplicables y gates de fases previas;
- rollback por PK preparado;
- operador y aprobación explícita;
- estado de write-freeze y `run_id`.

### Outputs

```text
K2_WRITE_AUTHORIZED
```

solo dentro de una transacción con freeze activo y autorización transaction-local, o:

```text
K2_WRITE_BLOCKED
```

sin ejecutar ningún DML K2.

El resultado es determinista: el gate no transforma, no elige mappings y no inventa datos.

## L. Relación con write-freeze

El gate y el freeze son complementarios:

| Mecanismo | Función |
|---|---|
| Global K2 Write Gate | decide si la operación cumple precondiciones de seguridad, datos, alcance y rollback |
| `k2_acquire_domain_freeze` | cierra el dominio a writers concurrentes y entrega `run_id` |
| `k2_authorize_transaction` | establece el contexto transaction-local autorizado |
| `k2_guard_protected_write` | rechaza writes protegidos sin contexto autorizado |

No existe `K2_WRITE_AUTHORIZED` efectivo si el freeze no está activo y el `run_id` no está autorizado. Un PASS de preflight con freeze `INACTIVE` solo significa “listo para abrir la ventana”; no significa que se pueda escribir.

## M. Relación con K2b

K2b es la escritura protegida. La secuencia exacta es:

```text
K2a read-only PASS
→ Global Write Preflight PASS
→ acquire freeze
→ revalidate snapshot/gate
→ authorize transaction
→ K2b UPDATE allowlist
→ validate
→ commit o rollback
→ release freeze
```

No se escribe antes del gate ni se mueve K2b después de K3/K12. El gate protege la escritura real en su posición natural.

## N. Relación con K3

K3 comienza solo después de terminar K2b y validar su resultado. K3 resuelve selección determinista de mappings; no participa en la autorización de la escritura textual K2b.

Los mappings ambiguos de R1 permanecen fuera de K2b. K3/K8b gestionan su destino canónico y cola de revisión posteriormente.

## O. Criterios PASS

### Global Write Preflight PASS

- R1 y K2a PASS;
- dry-run completo por PK/columna;
- cero drift en snapshot inmediato;
- cero ambiguos seleccionados;
- alcance limitado a allowlist;
- rollback exacto preparado;
- writers inventariados y controlables;
- condiciones globales aplicables PASS;
- operador y aprobación presentes.

### K2 Write Revalidation PASS

- freeze activo para `k2_units`;
- `run_id` propio y no expirado;
- `k2_authorize_transaction(run_id)` válido;
- snapshot sigue sin drift;
- preflight no ha caducado;
- ningún writer concurrente no autorizado;
- transacción preparada para commit/rollback.

## P. Criterios BLOCKED

El gate devuelve `K2_WRITE_BLOCKED` si ocurre cualquiera:

- K2b no está definida como allowlist concreta;
- existe drift;
- aparece una fila ambigua en el delta;
- falta snapshot o rollback;
- writer sin control;
- invariante aplicable FAIL;
- freeze `INACTIVE` al intentar escribir;
- `run_id` inválido/expirado/no propio;
- falta aprobación explícita;
- cualquier input crítico está ausente.

## Q. Rollback

El rollback de K2b es transaction-local y por PK/columna:

- snapshot por fila intacto;
- no se usa `DROP` ni `DELETE` como rollback;
- error antes de commit: rollback transaccional;
- error después de una validación parcial: rollback por delta preparado antes del commit, según runbook autorizado;
- el freeze se libera por `private.k2_release_domain_freeze(run_id)`;
- el estado final obligatorio es `INACTIVE`.

No se implementa ni prueba el runner en este documento.

## R. DAG definitivo

```text
K1
  ↓
R1-CLASSIFICATION PASS
  ↓
K2a — snapshot/clasificación read-only
  ↓
GLOBAL K2 WRITE PREFLIGHT
  ↓
WRITE-FREEZE + REVALIDATION + AUTHORIZATION
  ↓
K2b — escritura textual determinista
  ↓
VALIDATE / COMMIT o ROLLBACK / RELEASE FREEZE
  ↓
K3
  ↓
K5
  ↓
K8a
  ↓
K6
  ↓
K7
  ↓
K8b
  ↓
K9
  ↓
K4
  ↓
K10
  ↓
K11
  ↓
K12
```

`K2 WRITE AUTHORIZED` se produce únicamente entre K2a y K2b, dentro de la ventana protegida. K12 conserva su gate final de legacy; no es el lugar del gate de escritura K2b.

## S. Impacto en documentos posteriores

No se editan spikes inmutables. Este documento debe usarse como reconciliación de la contradicción antes de implementar el runner.

Impacto previsto para una tarea posterior, sin ejecutarlo ahora:

- el plan operativo debe referenciar esta posición única;
- la validación preimplementación debe fijar el archivo/proceso del K2 Runner;
- los tests deben comprobar preflight, freeze, revalidación, autorización, rollback y release;
- K3 sigue dependiendo de K2b validada;
- K12 mantiene su condición independiente de cero readers/writers, histórico, shadow, stock y rollback window.

## Estado final

```text
CONTRADICCIÓN RESUELTA = SÍ
POSICIÓN GLOBAL WRITE GATE = INMEDIATAMENTE ANTES DE K2b WRITE
K2b ESCRIBE = SÍ
K2 WRITE AUTHORIZED = NO, implementación aún no ejecutada
DATOS MODIFICADOS = NO
K2 = NO EJECUTADA
K2b = NO EJECUTADA
K3 = NO EJECUTADA
K12 = NO EJECUTADA
FREEZE = INACTIVE
```
