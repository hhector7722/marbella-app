---
documento: INTEGRACIONES-INDICE
clase: vivo
estado: vigente
capa: ingenieria
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
---

# Integraciones

Sistemas que no controlamos y con los que Marbella intercambia datos. Un documento por integración.

## Contenido

| Integración | Qué entra o sale | Estado |
|---|---|---|
| [Punto de venta](./BDP-TPV.md) | Ventas, estado de sala y líneas de cocina | Vigente |
| [Nóminas](./NOMINAS.md) | Coste mensual de empresa desde la gestoría | Vigente, con parte del diseño sin implementar |

## Pendientes

Se escriben cuando se toquen:

- **Albaranes por correo** — Lectura de albaranes desde el correo entrante con interpretación por visión artificial.
- **Actividades del pabellón** — Ingesta de actividades desde correo.
- **Dictado** — Transcripción de voz a texto.

## Estructura obligatoria

Cada documento declara: **dirección del flujo** (quién escribe a quién), qué dato entra y con qué formato, qué puede fallar y qué pasa cuando falla, quién es la autoridad del dato en caso de conflicto, y dónde está el código de la pieza externa.

## Reglas

- **El código externo vive en [`integrations/`](../../../integrations/README.md), no aquí.** Aquí vive su documentación.
- **Una integración nunca es autoridad de una magnitud de negocio.** Aporta un dato de origen; la magnitud la produce un motor de Marbella. Es el [principio 3](../../1-producto/PRINCIPIOS.md).
- **Un fallo de integración se declara, no se disimula.** Si el dato no llegó, la pantalla dice que no llegó. Nunca muestra cero. Es el [principio 2](../../1-producto/PRINCIPIOS.md).
