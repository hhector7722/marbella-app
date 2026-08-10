---
documento: SPIKE-EJECUCION-K2-BLOQUEADA
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

# Ejecución K2 bloqueada — Precondiciones incompletas

> **MATERIAL NO NORMATIVO — SPIKE-EJECUCION-K2-BLOQUEADA**
>
> Registro de una tentativa detenida antes de cualquier snapshot, dry-run o escritura de K2. No modifica el sistema ni sustituye el desbloqueo K2.

**Fecha/hora:** 2026-08-10T18:51:10+02:00  
**Baseline declarado:** `HEAD b72e123d + delta K1 + cambios paralelos existentes`  
**K1:** PASS, registrado en `2026-08-10-ejecucion-k1.md`  
**K2:** no ejecutada.

## Precondiciones comprobadas

| Precondición | Resultado | Evidencia |
|---|---|---|
| K1 y gate K1 | PASS | Registro K1 |
| Definición K2 | PASS | Plan §33 K2: 226 ingredientes y 362 líneas |
| Allowlist K2 | PASS documental | Desbloqueo K2 §7: seis columnas permitidas |
| Rollback K2 | PASS documental | Desbloqueo K2 §7 |
| Manifest operativo de baseline | **FAIL** | No existe un manifest de paths/hashes para K2 |
| Hashes del manifest | **FAIL** | No hay manifest que verificar |
| Snapshot K2 de `ingredients`/`recipe_ingredients` | **FAIL** | El desbloqueo declara que no se creó |
| Dry-run | No ejecutado | Bloqueado por precondiciones anteriores |
| Writers concurrentes | No comprobado | No procede continuar sin snapshot/manifest |

`public/manifest.json` existe, pero es el manifest web y no es el manifest Git de baseline K2. Los archivos con `snapshot` encontrados pertenecen a otros dominios o migraciones y no son el snapshot de filas K2.

## Árbol y alcance

El working tree contiene el delta K1, derivados y numerosos cambios paralelos en acciones, dashboards, playground, sandbox y spikes no rastreados. No se ha limpiado, revertido, movido ni modificado ninguno.

La procedencia temporal exacta de los cambios no-K1 no puede demostrarse porque K1 no tiene commit propio. Su clasificación de alcance está documentada en `2026-08-10-desbloqueo-k2-baseline.md`.

## Acción tomada

**Detención inmediata.** No se ejecutó:

- snapshot;
- consulta de dry-run K2;
- `UPDATE` de ninguna tabla;
- transacción de normalización;
- migración SQL;
- RPC de escritura;
- rollback;
- K3.

## Condición de reintento

K2 solo puede reiniciarse cuando exista y se verifique un manifest que contenga:

- `HEAD` e identidad temporal;
- siete archivos/artefactos K1 y sus hashes;
- todos los paths paralelos excluidos;
- allowlist de seis columnas K2;
- snapshot por PK de `ingredients` y `recipe_ingredients`;
- conteos y hash del conjunto;
- rollback por delta preparado.

Hasta entonces el resultado es:

```text
K2 SIGUE BLOQUEADA
```

No se ha modificado código, SQL, BD, datos ni migraciones durante esta tentativa.
