---
documento: DECISIONES-INDICE
clase: vivo
estado: vigente
capa: decisiones
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
---

# Decisiones

Registro de decisiones de arquitectura y de producto. Responde a una sola pregunta: **por qué el sistema es así y no de otra forma.**

## Reglas

Una decisión, un archivo. Numeración secuencial de cuatro dígitos, sin reiniciar y sin huecos.

**Una decisión no se edita nunca.** Si deja de ser válida, se escribe otra que la sustituya y la anterior pasa a estado `superseded` indicando quién la reemplaza. Se conserva porque el valor de un registro de decisiones está precisamente en poder leer lo que se pensaba entonces.

Esto separa dos cosas que antes se confundían: **el documento es inmutable, la decisión puede caducar.** El estado del documento dice si la decisión sigue en pie; el archivo nunca cambia.

## Cuándo se escribe una decisión

Cuando una elección es difícil de revertir, cuando cierra alternativas razonables, o cuando alguien en el futuro va a preguntarse por qué se hizo así.

**No se escribe** para decisiones reversibles en una tarde, ni para elegir el nombre de una variable, ni para justificar una corrección.

## Estructura

Contexto, decisión, alternativas descartadas con su motivo, consecuencias aceptadas.

Las alternativas descartadas son la parte más valiosa y la que más se omite. Sin ellas, el lector futuro no sabe si el problema se pensó o simplemente se resolvió con lo primero que apareció.

## Decisiones registradas

| Número | Decisión | Estado |
|---|---|---|
| [0001](./ADR-0001-hours-engine-productor-unico.md) | Hours Engine como productor único del dominio de horas | Vigente |

## Decisiones tomadas sin registrar

Detectadas al construir Marbella OS. **Están vigentes en el código y no tienen registro**, lo que significa que nadie puede saber por qué se tomaron:

- Autorización del acceso maestro por dirección de correo en lugar de por rol ([D9](../5-estado/DEUDA.md)).
- Un token en la dirección web como única credencial de un encargo ([D12](../5-estado/DEUDA.md)).
- Sistema de diseño propio para documentos impresos, separado de la pantalla ([DOCUMENTOS-IMPRESOS](../2-diseno/DOCUMENTOS-IMPRESOS.md)).
- No migrar el pedido a proveedor al sistema de diseño nuevo, tras haberlo intentado.

Se escribirán como decisiones retroactivas cuando se toque cada área, con la fecha real de la decisión y la nota de que se registró después. **Registrar una decisión tarde es mejor que no registrarla**, pero la fecha no se falsea.
