---
documento: SPIKES-INDICE
clase: vivo
estado: vigente
capa: investigacion
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
---

# Exploraciones e informes

Trabajos acotados en el tiempo: auditorías, validaciones y planes de una tarea concreta. **Congelados en su fecha y sin valor normativo.**

## Contenido

| Documento | Qué fue | Qué queda de él |
|---|---|---|
| [2026-07-16 · Plan de asistencia unificada](./2026-07-16-plan-asistencia-unificada.md) | Plan para unificar la vista de asistencia del personal | Implementado. Sus reglas visuales viven en [PATRONES P6](../../2-diseno/PATRONES.md) |
| [2026-07-18 · Auditoría documental](./2026-07-18-auditoria-documental.md) | Diagnóstico del corpus anterior | Motivó Marbella OS. Su diagnóstico está superado por esta reorganización |
| [2026-07-18 · Mapeo código–esquema](./2026-07-18-mapeo-codigo-esquema.md) | Comparación entre lo que el código esperaba y lo que la base de datos tenía | **Mayoritariamente resuelto.** Verificado el 2026-07-29: los hallazgos críticos ya no existen |
| [2026-07-24 · Auditoría del productor de nóminas](./2026-07-24-auditoria-productor-nominas.md) | Diagnóstico de la cadena de ingestión de nóminas | Lo vigente está en [integraciones/NOMINAS](../../3-ingenieria/integraciones/NOMINAS.md) |
| [2026-07-24 · Endurecimiento del productor de nóminas](./2026-07-24-hardening-productor-nominas.md) | Trabajo de robustez sobre esa cadena | Ídem |
| [2026-07-26 · Validación del sistema de sombra](./2026-07-26-shadow-validacion.md) | Comparación entre el motor nuevo y el cálculo heredado | Sirvió para justificar [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md) |
| [2026-07-26 · Residuales del sistema de sombra](./2026-07-26-shadow-residuales.md) | Análisis de las diferencias que quedaban | Las diferencias explicadas por política están en [dominio/JORNADA-FIJA](../../3-ingenieria/dominio/JORNADA-FIJA.md) |

## Advertencia

**Estos documentos describen estados pasados del sistema.** Varios contienen afirmaciones que ya eran falsas semanas después de escribirse.

Para saber cómo está el sistema hoy, [ESTADO](../../5-estado/ESTADO.md). Para saber qué debe cumplir, la capa correspondiente. Estos informes solo sirven para saber **qué se pensaba en su fecha**.

Sus enlaces internos tampoco resuelven, por el mismo motivo que en el [archivo](../archivo/README.md): son documentos congelados y no se editan.
