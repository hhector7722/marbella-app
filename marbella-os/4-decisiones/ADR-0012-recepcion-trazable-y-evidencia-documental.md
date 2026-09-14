---
documento: ADR-0012
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-14
depende_de: ADR-0001
supersede: —
---

# ADR-0012 · Recepción trazable y evidencia documental sin efectos automáticos

## Contexto

El circuito heredado convertía la captura de una línea de albarán en mapeo, precio y entrada de stock. Eso confundía evidencia con hecho económico, no admitía recepciones parciales contra varios pedidos y hacía imposible corregir sin perder el recorrido anterior.

Además, un mismo albarán puede cubrir varios pedidos, un pedido puede recibirse en varias veces y puede existir una recepción sin pedido previo. Docling necesita medirse con documentos reales antes de participar en una decisión económica.

## Decisión

1. `stock_movements` evoluciona como **único ledger canónico append-only**. Cada hecho nuevo declara referencia tipada, clave de idempotencia, origen, actor, correlación, procedencia y, cuando aplique, versión de mapeo o reversión. `stock_current` es una proyección regenerable, nunca otro ledger.
2. La reconciliación se guarda por asignación entre `purchase_order_items` y `purchase_invoice_lines`. Cada asignación conserva ambas cantidades y estado; permite parcialidad, varios pedidos por albarán y albaranes sin pedido. Las vistas de conciliación exponen pedido, recibido, pendiente y diferencia sin recalcular hechos en pantalla.
3. Documento original, evidencia, versiones de mapeo, historial de precio y movimientos de stock no se borran ni se sobrescriben. Una corrección crea versión, sustitución, rectificación o movimiento reversor según el tipo de hecho.
4. Cualquier persona autenticada que puede usar el escáner puede capturar un albarán. Solo `manager` y `admin` podrán confirmar una recepción y producir efectos económicos. `chef` y `supervisor` no pueden aplicar precio ni stock. Mientras no exista la confirmación explícita, ninguna captura o mapeo produce esos efectos.
5. Docling en K3 solo produce evidencia documental versionada: artefacto crudo, tablas, filas, columnas, celdas, métricas y registro de trabajo. No escribe ingredientes, precios, líneas de compra, mapeos, escandallos ni movimientos de stock.
6. El inventario físico certificado se decidirá en un corte posterior al cierre de jornada. No condiciona la seguridad, el ledger ni la evidencia de K1–K3.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| FK única de albarán a pedido | No representa parcialidad, reparto entre pedidos ni recepción sin pedido. |
| Segundo ledger `stock_movements_v2` | Divide la autoridad de stock y obliga a reconciliar dos libros. |
| Docling que mapea y aplica directamente | Convierte una extracción probabilística en un hecho económico sin confirmación humana. |
| Corregir borrando archivo, evidencia o movimiento | Hace imposible reconstruir qué documento y decisión produjeron el resultado. |

## Consecuencias

- K1 elimina permisos amplios y separa captura de efectos económicos.
- K2 añade metadatos al ledger existente y las relaciones de conciliación sin reparar hechos históricos.
- K3 puede medir Docling con albaranes reales sin cambiar el negocio.
- La confirmación económica central queda deliberadamente fuera de K1–K3 y requiere aprobación antes de iniciarse la fase siguiente.
