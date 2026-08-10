---
documento: SPIKE-EJECUCION-K1
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

# Ejecución K1 — Cerrar el círculo documental

> **MATERIAL NO NORMATIVO — SPIKE-EJECUCION-K1**
>
> Registro fechado de la ejecución de K1. No autoriza K2, no sustituye el plan inmutable y no contiene decisiones de fases posteriores.

**Fecha/hora de cierre:** 2026-08-10T18:30:37+02:00  
**Fase:** K1 — Cerrar círculo documental  
**Modo:** ejecución limitada al alcance K1; sin migraciones ni escrituras en BD.

## Objetivo

- Reapuntar cinco citas del SSOT legacy a `marbella-os/3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md`.
- Hacer que `applyAlbaranPriceUpdatesAction` respete `price_locked` en todos sus caminos, incluido `allowUnitChanges`.

## Acciones realizadas

1. Sustituidas las cinco referencias a `context/INGREDIENTS_PRECIOS_Y_ALBARANES.md`.
2. Añadido `price_locked` a la lectura de ingredientes de `applyAlbaranPriceUpdatesAction`.
3. Una línea con `price_locked=true` se rechaza antes de cualquier actualización de precio o configuración.
4. Añadida la función pura `isIngredientPriceLocked`.
5. Añadidos dos tests unitarios para lock/no-lock.

## Archivos modificados por K1

- `src/lib/ingredient-price-sync.ts`
- `src/lib/ingredient-price-sync.test.ts`
- `src/app/dashboard/albaranes-precios/actions.ts`
- `src/lib/recipe-cost.ts` (solo cita documental)
- `src/app/ingredients/page.tsx` (solo cita documental)
- `src/app/dashboard/albaranes/actions.ts` (solo cita documental)
- `src/components/ingredients/IngredientWizard.tsx` (solo cita documental)

## Migraciones ejecutadas

Ninguna.

No se ejecutaron `UPDATE`, `INSERT`, `DELETE`, RPCs de escritura ni operaciones sobre tablas. No se modificó la base de datos.

## Validaciones

| Validación | Resultado |
|---|---|
| Cinco citas `INGREDIENTS_PRECIOS_Y_ALBARANES` en `src/` | PASS: 0 coincidencias |
| Test lock/no-lock `ingredient-price-sync.test.ts` | PASS: 2/2 |
| ESLint de librería y test nuevos | PASS |
| `npm run validate:corpus` | PASS: 0 errores; 2 avisos preexistentes de `.cursor/rules/` |
| Migraciones modificadas | PASS: 0 |
| Datos/BD modificados | PASS: 0 |

## Incidencias

El archivo `src/app/dashboard/albaranes-precios/actions.ts` conserva dos errores de lint `no-explicit-any` preexistentes en las líneas 277 y 294. La ejecución de K1 no los introduce ni los corrige porque hacerlo sería refactor fuera de alcance. El lint global del conjunto de archivos arrastra además errores preexistentes en otros módulos.

## Rollback

**NO realizado.** K1 no modifica datos ni esquema. El rollback técnico consiste en revertir los cambios de los siete archivos de código de K1 y retirar este registro; no hay rollback de datos.

## Gate K1

**PASS.** Se cumplen los criterios de K1: cinco citas legacy eliminadas, el precio bloqueado no pasa por ninguna ruta de actualización y las pruebas específicas lock/no-lock pasan.

## Siguiente fase

**K2 está permitida por dependencia de K1.** Esta ejecución no adelanta ninguna operación de K2 ni de fases posteriores.
