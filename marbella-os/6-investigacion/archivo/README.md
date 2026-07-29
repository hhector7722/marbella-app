---
documento: ARCHIVO-INDICE
clase: vivo
estado: vigente
capa: investigacion
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
---

# Archivo

Material histórico. **No es norma, no se actualiza y no se corrige.**

## Contenido

| Documento | Qué es |
|---|---|
| [2026-07-29 · Estado del proyecto histórico](./2026-07-29-project-status-historico.md) | El documento que hacía de todo: bitácora, estado, registro de decisiones y contexto para modelos. Su descomposición es el motivo de que exista Marbella OS |
| [2026-07-24 · Snapshots de horas y arrastre](./2026-07-24-horas-snapshots-y-arrastre.md) | Descripción de la lógica de horas en base de datos, **desconectada** desde el 27 de julio de 2026. Contradice [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md) |
| [2026-07-24 · Migración de consumidores](./2026-07-24-migracion-consumidores-ssot.md) | Plan de migración completado. Todas las pantallas leen ya del productor único |
| [2026-05 · Migración de avatares](./2026-05-avatars-migracion.md) | Instrucciones de una migración puntual ya aplicada |

## Por qué se conserva

El documento histórico de estado contiene **la única traza de decisiones que nunca se registraron formalmente**. Sirve para reconstruir por qué algo es como es, cuando no hay otra fuente.

Su forma es un buen ejemplo de lo que no hay que repetir: bitácora inversa, líneas de cientos de palabras, cuatro responsabilidades en un archivo, y un mecanismo automático que lo copiaba a otro documento. Creció hasta ser imposible de leer y de mantener.

## Advertencia importante

**El documento de snapshots de horas describe un comportamiento que ya no existe.** Se conserva porque explica cómo funcionaba el sistema antes del cierre del dominio, pero **cualquier regla que contenga está derogada** por [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md).

Si un documento de archivo y un documento normativo se contradicen, gana el normativo sin discusión. Es lo que establece la [jerarquía de autoridad](../../CANON.md).

**Los enlaces internos de estos documentos no resuelven.** Apuntan a rutas que existían cuando se escribieron y que la reorganización cambió. No se corrigen: corregirlos implicaría editar material congelado, y un documento histórico corregido deja de ser histórico.
