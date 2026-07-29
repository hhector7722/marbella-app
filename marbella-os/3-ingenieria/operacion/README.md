---
documento: OPERACION-INDICE
clase: vivo
estado: vigente
capa: ingenieria
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
---

# Operación

Procedimientos que se ejecutan sobre el sistema en funcionamiento: despliegues, tareas programadas y recuperación tras un fallo.

## Contenido

| Documento | Cuándo se usa |
|---|---|
| [Despliegue del puente con el punto de venta](./RUNBOOK-BDP-VENTAS.md) | Al actualizar el extractor o el receptor de ventas, y tras un hueco de datos |

## Pendientes

- **Despliegue de la aplicación** — Procedimiento y variables de entorno necesarias.
- **Tareas programadas** — Inventario de qué se ejecuta, cuándo y qué pasa si no se ejecuta.
- **Recuperación de datos** — Qué hacer ante un hueco de ventas, un fichaje perdido o una importación fallida.

## Qué debe contener un procedimiento

Escrito para ejecutarse **bajo presión, con el servicio afectado y sin tiempo para investigar**:

- Cuándo se aplica y cómo se reconoce la situación.
- Pasos en orden, con los comandos exactos.
- Cómo verificar que ha funcionado.
- Qué hacer si no ha funcionado.

**Un procedimiento sin verificación final está incompleto.** Ejecutar los pasos no es lo mismo que haber resuelto el problema.
