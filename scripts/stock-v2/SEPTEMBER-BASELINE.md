# Stock 2.0 · Septiembre 2026: corte lógico, no físico

Este despliegue ejecutado en Supabase **NO borra ventas, compras ni stock histórico** y no cambia el punto de lectura en `/dashboard/stock` ni en otras pantallas. El corte de simulación de septiembre está en `stock_v2.replay_runs`: `21ba4e50-8f0b-4873-9395-f9c9c26f839a`.

## Inventario inicial solicitado
El usuario confirmó haber contado físicamente a **principios de septiembre**. Se buscaron tablas de inventarios, movimientos `INVENTORY_COUNT` y archivos en Storage y Biblioteca. **No aparece un recuento fechado a principios de septiembre**. Solo existen:
- 27 registros físicos del **18/09/2026** (copia segura en `stock_v2.legacy_inventory_evidence`).
- Recuentos pendientes del **30/09/2026** (24 líneas) y **02/10/2026** (37 líneas).

No se ha elegido el 18/09 como sustituto de la fecha declarada. `stock_v2.opening_baseline_requests` está `awaiting_original_inventory`, con fecha real NULL. `opening_baseline_lines` está vacía. `verified_opening_estimate` devuelve **cero filas** hasta que el inventario original esté identificado, validado y sus cantidades hayan sido guardadas explícitamente.

## Compras desde septiembre

`stock_v2.purchase_line_audit` toma las líneas de `purchase_invoice_lines` y:
- marca compras ya asociadas al movimiento original o a K4 (`already_posted`);
- bloquea automáticamente la reutilización de las recepciones parciales (`invoice_partially_posted`);
- separa fechas dudosas, mapeos sin validar y unidades/importes incompletos;
- deriva candidatos OCR vía `stock_v2.purchase_mapping_triage`, **sin convertir candidatos en recibos ni tocar stock**.

Hay propuestas K4 preliminares; ninguna pasa al libro económico desde este script. Esto impide sumar por segunda vez albaranes ya recibidos.

## Ventas intactas

La simulación septiembre–octubre copia la salida del motor previo calculada desde `ticket_lines_marbella`, `map_tpv_receta` y fichas técnicas actuales; no actualiza ni elimina esas tablas. **El TPV sigue grabando ventas en tiempo real.** Los saldos calculados no constituyen todavía existencias reales ni una proyección en vivo.

## Hallazgo de cobertura

El catálogo cuenta con 230 ingredientes activos, pero solo **43 marcados para Inventario** (`inventory_visible=true`). 38 de esos 43 tienen alguna evidencia de recuento, no siempre de la misma fecha; 5 no la tienen.

## Secuencia para activación

1. Identificar y asociar el inventario físico **original** de comienzos de septiembre, con su fecha/hora real.
2. Copiar sus ingredientes/cantidades a `opening_baseline_lines`; comprobar unidades, cobertura y duplicados.
3. Conciliar los albaranes del nuevo periodo, revisando K4 y no repitiendo entradas antiguas; aprobar solo transformaciones evidenciadas.
4. Completar recetas faltantes y conservar versiones de recetas efectivas por fecha.
5. Ejecutar una nueva simulación completa, contrastar físico versus libro e implementar un conmutador de lectura reversible hacia Stock 2.0.
6. Nunca borrar `tickets_marbella`, `ticket_lines_marbella`, `ventas_marbella`, informes o `stock_movements` antiguos.

## Ficheros

- `05-september-cut-and-purchase-audit.sql`: esquema y snapshot de septiembre, conciliación de compras y candidatos físicos de otras fechas.
- `06-opening-proof-and-purchase-triage.sql`: tabla vacía para cargar inventario original y vista de candidatos OCR.
- `07-verify-september.sql`: verificaciones SQL sin cambios.
