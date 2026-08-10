---
documento: SPIKE-PREPARACION-K2
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

# Preparación K2 — Baseline no válido

> **MATERIAL NO NORMATIVO — SPIKE-PREPARACION-K2**
>
> Registro de preparación detenida antes del snapshot y de cualquier escritura funcional. No modifica el sistema ni autoriza K2.

**Fecha/hora:** 2026-08-10T18:54:36+02:00  
**Baseline solicitado:** `b72e123d er`  
**HEAD real al verificar:** `37f7157a studio`  
**K2:** no ejecutada.

## Resultado del gate de preparación

```text
K2 PREPARATION = BLOCKED
```

### Precondiciones

| Precondición | Resultado | Evidencia |
|---|---|---|
| K1 PASS | PASS | `2026-08-10-ejecucion-k1.md` |
| Allowlist K2 | PASS documental | Plan §33 K2 y desbloqueo §7 |
| Rollback definido | PASS documental | Desbloqueo K2 §7 |
| Manifest existe | PASS parcial | `sql/diagnostics/k2/2026-08-10-k2-baseline-manifest.json` |
| Manifest corresponde a baseline solicitado | **FAIL** | Contiene `HEAD=37f7157a`, no `b72e123d` |
| Hashes verificables | FAIL para baseline solicitado | Son hashes de la fotografía posterior al commit `studio` |
| Snapshot `ingredients`/`recipe_ingredients` | **NO CREADO** | Se detuvo antes |
| Writers concurrentes | **NO COMPROBADOS** | No procede continuar con baseline inválido |

## Discrepancia exacta

Durante la preparación apareció un commit externo:

```text
37f7157a studio
Author/Commit: 2026-08-10 18:51:27 +0200
```

Ese commit contiene cambios amplios de playground, sandbox, dashboards, acciones, documentación y derivados. No se revierte ni se modifica. El manifest fue creado después y registra `37f7157a` como `HEAD`, por lo que no puede servir como fotografía del baseline pedido `b72e123d + delta K1 + cambios paralelos preexistentes`.

Además, el manifest actual describe principalmente el working tree posterior al commit; no contiene un hash comparativo de cada delta K1 respecto a `b72e123d`. Por tanto, no se puede usar para demostrar que K2 preservará el baseline solicitado.

## Artefactos existentes

- Manifest creado: `sql/diagnostics/k2/2026-08-10-k2-baseline-manifest.json`.
- Snapshot K2: no existe.
- Dry-run K2: no ejecutado.
- Allowlist: documentada, no ejecutada.
- Rollback: documentado, no ejecutado.

El manifest no se borra ni se sobrescribe: queda como fotografía del `HEAD` posterior al commit externo, no como baseline autorizado para K2.

## Acción

Detención inmediata. No se ejecutaron:

- snapshot de datos;
- hash de filas K2;
- dry-run;
- `UPDATE`, `INSERT`, `DELETE` o RPC de escritura;
- migraciones;
- comprobación operativa de writers;
- K2 ni K3.

## Condición para continuar

La propiedad del proceso debe decidir primero cuál es el baseline autorizado:

```text
HEAD b72e123d + delta K1 + cambios paralelos
```

o el nuevo `HEAD 37f7157a studio` como baseline actual. No se puede elegir silenciosamente porque cambia la fotografía que K2 debe proteger. Después de esa decisión debe generarse un manifest nuevo desde el baseline elegido y verificarse antes de tomar el snapshot de datos.

Hasta entonces:

```text
K2 SIGUE BLOQUEADA
```

No se modificaron datos funcionales, código ni migraciones durante esta preparación. Solo se creó este registro y el manifest preparatorio descrito arriba; los derivados del corpus deben regenerarse por la nueva documentación.
