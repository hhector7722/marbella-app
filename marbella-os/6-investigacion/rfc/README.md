---
documento: RFC-INDICE
clase: vivo
estado: vigente
capa: investigacion
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
---

# Propuestas abiertas

Aquí vive lo que se está proponiendo y todavía no se ha decidido. Es el paso previo a una decisión en [4-decisiones](../../4-decisiones/README.md), según el ciclo de vida de [CANON §8](../../CANON.md).

## Contenido

Ninguna propuesta abierta ahora mismo.

## Cómo se escribe una

Nombre `RFC-NNNN-slug-en-minusculas.md`, con numeración global de cuatro dígitos independiente de la de los ADR.

Una propuesta plantea el problema, propone una salida y nombra las alternativas que ha considerado. No decide: lo que decide es el ADR que sale de ella.

## Cómo termina

**Una propuesta no se queda en el limbo.** Termina de una de estas tres formas:

- **Aprobada.** Se escribe el ADR correspondiente y la propuesta se mueve a [archivo](../archivo/README.md) indicando qué decisión generó.
- **Rechazada.** Se mueve a [archivo](../archivo/README.md) **con el motivo escrito**. Conservarla ahorra volver a proponer lo mismo dentro de un año.
- **Caducada.** Si lleva más de un trimestre sin resolverse, se archiva por caducidad. Que nadie la haya cerrado en tres meses ya es una respuesta.

Mientras está abierta, una propuesta **no obliga a nada**. Lleva `normativo: false` como todo lo que hay en esta capa salvo los índices.
