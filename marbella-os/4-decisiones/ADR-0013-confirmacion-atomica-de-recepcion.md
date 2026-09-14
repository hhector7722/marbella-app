---
documento: ADR-0013
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-14
depende_de: ADR-0012
supersede: —
---

# ADR-0013 · Confirmación atómica de recepción por línea

## Contexto

ADR-0012 separó evidencia, propuesta y efecto económico. Faltaba decidir cómo materializar el efecto sin volver a abrir rutas paralelas de precio o stock y sin reducir la conciliación a una relación única entre albarán y pedido.

Una misma línea puede recibirse sin pedido, repartir su cantidad entre varios pedidos, o completar solo una parte de cada uno. El resultado debe resistir reintentos, conservar el precio observado y no permitir que una edición posterior cambie el significado del documento ya confirmado.

## Decisión

1. `public.apply_receipt_line(...)` es el único comando expuesto para confirmar económicamente una línea. Delega en una función privada con privilegio controlado y `search_path` vacío; la entrada pública conserva el contexto del usuario.
2. El comando solo acepta `manager` y `admin`. Valida identidad, documento original, proveedor, línea revisada, ingrediente, versión de mapeo, dimensiones, presentación, factor, precio, bloqueo, asignaciones, actor e idempotencia antes de escribir. Toda incertidumbre ordinaria devuelve `needs_review` y no aplica una aproximación.
3. Una ejecución confirmada crea, en la misma transacción, como máximo un `PURCHASE` en `stock_movements`, una auditoría append-only en `purchase_receipt_confirmations`, las asignaciones confirmadas a líneas de pedido y, solo si corresponde, un histórico de precio con documento, línea, actor, movimiento y versión de mapeo.
4. Una propuesta de mapeo se convierte en una nueva versión confirmada al aplicar la recepción; nunca se edita la propuesta ni una versión previa. Una línea con recepción confirmada no puede reescribirse. Las correcciones futuras serán rectificaciones o reversores, fuera de K4.
5. `stock_current` sigue siendo una proyección regenerable del ledger. El trigger de caché heredado no procesa los `PURCHASE` canónicos K4 mientras se prepara el corte físico; no se crea un segundo ledger.
6. La interfaz sigue el orden propuesta → conciliación opcional → vista previa completa → confirmación. Las antiguas rutas de reparar stock, rectificar stock o aplicar precio desde albaranes quedan retiradas.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Insertar `PURCHASE` desde la pantalla y actualizar el precio por separado | Rompe atomicidad, auditoría e idempotencia ante un fallo intermedio. |
| Un único FK de albarán a pedido | No representa reparto entre pedidos ni parcialidad por cantidad. |
| Permitir que `supervisor` confirme porque puede revisar | La autorización aprobada limita los efectos económicos a `manager` y `admin`. |
| Mantener el trigger heredado como productor de `stock_current` para K4 | Mantiene una segunda escritura de saldo y contradice la proyección canónica. |
| Corregir una recepción editando su línea documental | Reescribe la evidencia de un hecho ya aplicado. |

## Consecuencias

- La recepción queda preparada para K4 sin automatizar rectificaciones, corte físico ni una nueva política de inventario; esas decisiones no forman parte de esta fase.
- Los documentos y mapeos ya existentes se conservan. Un `PURCHASE` legacy bloquea una segunda recepción K4 de la misma línea y exige revisión.
- Docling sigue limitado a evidencia documental; no puede llamar al comando de confirmación ni escribir precios, stock o mapeos definitivos.
