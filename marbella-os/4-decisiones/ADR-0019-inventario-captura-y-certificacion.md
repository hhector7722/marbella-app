---
documento: ADR-0019
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-30
depende_de: ADR-0012, MODELO-DE-DATOS, SEGURIDAD, ACTORES-Y-ROLES
supersede: —
---

# ADR-0019 · Recuento de inventario: captura libre y certificación por gerencia

## Contexto

El recuento físico de inventario (`/dashboard/inventory`) exige hoy rol
`manager` o `admin` tanto para entrar como para guardar. El botón
«Guardar recuento» no guarda un borrador: escribe directamente movimientos
`INVENTORY_COUNT` en el ledger canónico `stock_movements` mediante
`record_inventory_count_movements`. Por eso coinciden en una sola puerta la
captura y el efecto económico.

El negocio necesita que **cualquiera pueda contar** y que **gerencia
certifique** el recuento antes de que toque el stock. Es el mismo patrón que
[ADR-0012](./ADR-0012-recepcion-trazable-y-evidencia-documental.md) fijó para
compras: la captura no produce efectos; la confirmación económica es de
`manager` o `admin`.

[ADR-0012](./ADR-0012-recepcion-trazable-y-evidencia-documental.md) §6 dejó
el «inventario físico certificado» para «un corte posterior al cierre de
jornada». Este ADR abre ese corte.

## Decisión

1. El recuento se separa en dos hechos: **captura** y **certificación**.
2. La captura está abierta a cualquier persona autenticada. No produce
   movimientos de stock.
3. La captura vive en dos tablas propias, ajenas al ledger:
   `inventory_counts` (cabecera: autor, estado, correlación, fechas y actor
   de certificación o rechazo) e `inventory_count_lines` (ingrediente,
   cantidad física, cantidad teórica, unidad y diferencia derivada).
4. `inventory_counts.status` tiene tres valores: `pending`, `certified` y
   `rejected`.
5. La certificación es de `manager` o `admin` y es la **única** puerta que
   escribe `stock_movements`. Reutiliza `record_inventory_count_movements`,
   que sigue siendo el comando canónico. No se crea un segundo ledger.
6. El rechazo es de `manager` o `admin` y no produce movimientos.
7. Una persona mantiene **como máximo un recuento pendiente**. Capturar de
   nuevo sustituye su pendiente anterior; no se acumulan borradores.
8. Las mutaciones pasan por comandos estrechos `SECURITY DEFINER`
   (`submit_inventory_count`, `certify_inventory_count`,
   `reject_inventory_count`). No hay escritura directa desde el cliente:
   las tablas solo conceden `SELECT` y las políticas de lectura dejan ver a
   cada persona su recuento y a gerencia todos.
9. `anon` no tiene ningún permiso sobre estas tablas ni sobre sus funciones.
10. La pantalla `/dashboard/inventory` es accesible a todos los roles. El
    histórico (`/dashboard/inventory/ledger`) y la merma
    (`/dashboard/inventory/waste`) siguen restringidos a `manager` y `admin`.
11. La persona que cuenta no recibe lenguaje de «pendiente»: ve una
    confirmación de guardado. La distinción captura/certificación es de
    gerencia.
12. La pantalla respeta el modo experiencia: ver-como un trabajador muestra la
    versión de captura, no la de gerencia.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Permitir que cualquier rol escriba el ledger directamente | Rompe la separación entre captura y efecto económico de ADR-0012 y amplía `is_purchase_manager_or_admin()` sin necesidad. |
| Guardar el borrador solo en el dispositivo | No lo ve gerencia, no se comparte entre dispositivos y no es auditable antes de certificar. |
| Un segundo ledger de recuentos | Divide la autoridad de stock; el único ledger canónico es `stock_movements`. |
| Reutilizar `stock_movements` con un origen «pendiente» | Mete hechos no certificados en el libro canónico append-only. |
| Dejar el recuento como borrador compartido sin certificación | El stock no se corrige nunca; el recuento deja de cerrar el ciclo. |

## Consecuencias

- `ACTORES-Y-ROLES` reconoce la captura de inventario a cualquier rol y la
  certificación a `manager`/`admin`.
- `SEGURIDAD` documenta las tablas y los comandos estrechos del recuento.
- `MODELO-DE-DATOS` registra `inventory_counts` e `inventory_count_lines` como
  tablas de la cocina de datos de existencias.
- La deuda [D30](../5-estado/DEUDA.md) cambia: el borrador local deja de ser
  el único estado previo a la certificación.
- La certificación sigue sin alterar hechos históricos: una corrección es un
  movimiento nuevo, nunca una edición.
