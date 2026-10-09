# Stock 2.0 · Primer inventario unitario, 9 de octubre de 2026

Se respetan los productos **con `ingredients.inventory_visible=true`**, coincidiendo con la pantalla de Inventario. En el momento de la implantación hay **41 activos y los 41 son unitarios** (pueden cambiar en el futuro).

## Qué se ha hecho

- La pantalla Stock `/dashboard/inventory/ledger` muestra solo el catálogo de Inventario, sin botón para reintroducir ocultos.
- Los productos no muestran la cifra negativa antigua. Sin recuento certificado, ponen **Pendiente** (NULL, no cero).
- El usuario hace el recuento en `/dashboard/inventory`, explícitamente indicando **0** para cualquier producto sin existencias. Se exige cobertura del 100% del catálogo.
- Todas las personas capturan mediante el RPC existente `submit_inventory_count`. Si es gerencia, el servidor certifica inmediatamente con `certify_unit_stock_count`; si es trabajador, gerencia utiliza el panel Pendientes para certificar con ese mismo RPC.
- Las capturas están en `public.inventory_counts`/`inventory_count_lines` y la nueva base autoritativa para el modo Stock 2.0 solo en `stock_v2.unit_stock_counts` y `stock_v2.unit_stock_count_lines`.
- El RPC privado de lectura autorizada `public.get_unit_stock_status` calcula el valor de cada producto a partir de **su último recuento certificado** más compras, ventas TPV y consumos/mermas posteriores. No usa `ingredients.stock_current`.
- Los movimientos anteriores al recuento no se muestran en Stock y no afectan el nuevo contador. El historial visible se obtiene de los inventarios certificados nuevos, no del ledger antiguo.

## Lo que NO cambia

- Ninguna fila de `tickets_marbella`, `ticket_lines_marbella`, `ventas_marbella`, informes, `stock_movements`, `ingredients.stock_current` o recepciones históricas se elimina ni se reescribe.
- Los recuentos previos se **conservan para auditoría**, aunque no figuren como inventario activo. Los dos pendientes antiguos están rechazados, borrador compartido vacío.
- El cambio de inventario unitario evita `record_inventory_count_movements`: no crea ajustes enormes para compensar el stock acumulado incorrecto.

## Notas operativas y límites

- El primer recuento se registra con la fecha y hora de captura; no se inventa una apertura a cero.
- **No guardar antes de que el despliegue de `main` esté en READY**, porque el cliente anterior registraba ajustes sobre el ledger viejo.
- El corte es **por producto y fecha del último recuento**, no un borrado general de los movimientos de ventas.
- El cálculo por movimiento depende de que la importación del TPV, compras y mermas siga procesando correctamente. Los tickets no se tocan.
- Este primer corte está diseñado para unidades (`ud`). Si más adelante se activan ingredientes por g/ml, se listarán pero no tendrán cantidad de Stock 2.0 hasta implementar su control.
- Para que un recuento sea certificado exige que **todos** los productos unitarios activos se hayan contado (incluidos 0), que la cantidad sea entera y que Barra+Cámara concuerde con el total.
- Las compras albarán aún pendientes K4 **no se inventan ni se reciben automáticamente**: solo contarán en stock cuando se registren compras reales posteriores al recuento, comprobadas sin duplicados.
- Si falla la certificación de gerencia, el recuento sigue `pending` y es recuperable; no se declara éxito.
