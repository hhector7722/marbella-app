---
documento: ADR-0020
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-30
depende_de: ADR-0019, MODELO-DE-DATOS, SEGURIDAD
supersede: —
---

# ADR-0020 · Borrador compartido del recuento de inventario

## Contexto

El recuento de inventario ([ADR-0019](./ADR-0019-inventario-captura-y-certificacion.md))
separa captura y certificación. Quedaba por decidir dónde vive el recuento
**mientras se rellena**. La primera versión lo guardaba en el dispositivo
(`localStorage`), de modo que lo que apuntaba una persona no lo veía nadie más.

El pedido a proveedor ya resuelve ese mismo problema con `order_drafts`: un
borrador en servidor, compartido y en tiempo real, que cualquiera que abra el
proveedor ve igual. El inventario necesita el mismo comportamiento.

## Decisión

1. El recuento en curso vive en servidor, en `inventory_count_drafts`.
2. El borrador es **compartido**: lo que apunta una persona lo ven las demás al
   instante. No hay borradores por persona.
3. Persiste hasta que se guarda o se vacía. Cerrar la app o salir de la pantalla
   no lo borra.
4. Guarda la cantidad por ubicación (barra y cámara) y quién la tocó por última
   vez.
5. Se vacía al **guardar** y al pulsar **«Nuevo»**, un botón primario en la fila
   del cromo que deja todas las cantidades en blanco.
6. El borrador no es un hecho económico ni un segundo ledger. No produce stock.
   Es el mismo patrón que `order_drafts`: lo lee y escribe cualquier persona
   autenticada, sin `anon`, con RLS.
7. La sincronización usa la difusión en tiempo real de Supabase, como el pedido.
   El último cambio gana; no hay bloqueo ni fusión por campo.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Borrador por persona en servidor | No cumple el objetivo: diez personas contarían el mismo almacén sin ver lo de las demás. |
| Borrador solo en el dispositivo | Es el estado que se retira: no se comparte, no sobrevive a limpiar datos y no lo ve quien certifica. |
| Escribir el recuento directamente en `inventory_counts` mientras se rellena | Convierte cada tecla en un pendiente; ensucia la captura y complica la certificación. |
| Bloqueo optimista o fusión por campo | Añade complejidad para un borrador desechable; el pedido ya funciona con «gana el último». |

## Consecuencias

- `MODELO-DE-DATOS` registra `inventory_count_drafts` entre las tablas de
  existencias.
- `SEGURIDAD` documenta la excepción deliberada de escritura directa del
  borrador compartido, sin `anon`.
- [D30](../5-estado/DEUDA.md) queda pagada: el borrador ya no vive en el
  dispositivo.
- El recuento guardado sigue yendo a `inventory_counts` y solo lo certifica
  gerencia ([ADR-0019](./ADR-0019-inventario-captura-y-certificacion.md)).
