---
documento: INVESTIGACION-INDICE
clase: vivo
estado: vigente
capa: investigacion
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
---

# Investigación

Todo lo que **no es norma**: propuestas sin aprobar, exploraciones acotadas, informes de auditoría y material histórico.

## La regla que justifica esta capa

**Nada de lo que hay aquí obliga a nada.** Un informe es una fotografía de un momento, no una regla. Un análisis describe lo que había, no lo que debe haber.

Esta capa existe porque el corpus anterior no distinguía informe de norma, y varios informes de auditoría acabaron citándose como si establecieran reglas. Cuando el código cambió, esos informes quedaron obsoletos pero siguieron pareciendo autoridad. La [prueba concreta](../5-estado/ESTADO.md) está en el estado: buena parte de los hallazgos críticos de julio ya no existían en el código un mes después.

**Si algo de aquí debe obligar, se promueve**: a una decisión en [4-decisiones](../4-decisiones/README.md), a una regla en [3-ingenieria](../3-ingenieria/), o a un apunte en [DEUDA](../5-estado/DEUDA.md). Y entonces sale de aquí.

## Estructura

| Carpeta | Contenido | Ciclo de vida |
|---|---|---|
| `rfc/` | Propuestas abiertas a discusión | Se aprueban y generan decisión, o se archivan con el motivo |
| [`spikes/`](./spikes/) | Exploraciones acotadas y auditorías con fecha | Se congelan al terminar |
| [`archivo/`](./archivo/) | Material histórico sin valor normativo | No se toca |

## Reglas

- **Todo documento de esta capa lleva fecha en el nombre.** Sin fecha no se puede juzgar su vigencia, y un documento sin fecha se lee como si fuera actual.
- Un informe terminado **no se actualiza**. Si hace falta volver a mirar, se escribe uno nuevo.
- Una propuesta rechazada **se conserva con el motivo del rechazo**. Ahorra volver a proponer lo mismo.
- Los documentos de esta capa **no se citan como fuente en las otras capas**. Se citan al revés: un documento normativo puede mencionar de dónde salió una idea.
