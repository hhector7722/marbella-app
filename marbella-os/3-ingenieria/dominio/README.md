---
documento: DOMINIO-INDICE
clase: vivo
estado: vigente
capa: ingenieria
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
---

# Reglas de dominio

Las reglas de negocio con consecuencia económica o legal. Aquí viven las fórmulas, y **cada fórmula vive en exactamente un documento**.

Un documento de dominio se distingue de una capacidad en [1-producto/capacidades](../../1-producto/capacidades/) por lo que responde:

- Una **capacidad** responde qué puede hacer una persona y qué ve.
- Un **dominio** responde cómo se calcula un número y por qué ese número es correcto.

## Documentos vigentes

| Documento | Qué gobierna |
|---|---|
| [COSTE-LABORAL](./COSTE-LABORAL.md) | Fórmula del coste de personal por día |
| [JORNADA-FIJA](./JORNADA-FIJA.md) | Política de jornada completa independiente de fichajes |
| [PRECIOS-Y-COMPRAS](./PRECIOS-Y-COMPRAS.md) | Precio de ingrediente y su actualización desde albaranes |

## Pendientes

Se escriben cuando se trabaje sobre ellos, no antes:

- **HORAS** — Redondeos, clasificación de tipos de día, cálculo de balance y liquidación. La decisión de arquitectura está en [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md); falta la especificación de las reglas de cálculo.
- **TESORERIA** — Cuadre de caja, saldo objetivo, tratamiento del descuadre.
- **PROPINAS** — Base de reparto y su relación con [JORNADA-FIJA](./JORNADA-FIJA.md).

## Estructura obligatoria

Todo documento de dominio contiene, en este orden: la fórmula, el origen de cada magnitud que entra en ella, las reglas normativas, el comportamiento cuando falta un dato, y una lista de invariantes comprobables.

**La lista de invariantes no es opcional.** Sin ella no hay forma de saber si una implementación cumple el dominio.
