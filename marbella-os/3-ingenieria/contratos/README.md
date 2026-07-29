---
documento: CONTRATOS-INDICE
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
---

# Contratos

Acuerdos formales entre piezas del sistema: qué produce cada una, qué garantiza y qué no.

## Regla de versionado

**Un contrato no se edita: se versiona.** Cambiar el comportamiento acordado exige publicar una versión nueva y declarar la anterior como sustituida.

El motivo es que un contrato se cumple o no se cumple, y eso solo se puede comprobar contra un texto que no se mueve. Un contrato editable no es un contrato.

## Contenido

| Contrato | Qué acuerda | Estado |
|---|---|---|
| [Proyección semanal v1](./PROYECCION-v1.md) | Qué escribe el productor de horas en la proyección semanal, con qué autoridad y con qué garantías de idempotencia | Vigente |

## Cuándo hace falta un contrato

Cuando dos piezas se comunican y **al menos una de ellas puede romper a la otra sin darse cuenta**. Un motor de cálculo y quien persiste su resultado. Un sistema externo y quien lo recibe. Una función de base de datos y la pantalla que la consume.

**No hace falta** para llamadas internas de un mismo módulo, ni cuando el compilador ya garantiza la forma.

## Estructura

Partes implicadas, dirección del flujo, qué produce cada parte, qué campos son autoridad de quién, comportamiento ante repetición, y validaciones que deben pasar antes de escribir.

La parte de **autoridad por campo** es la que evita el problema clásico: dos productores escribiendo el mismo dato y ninguno sabiendo que el otro existe.
