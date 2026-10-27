# Auditoría de duplicados de ingredientes — 27 de octubre de 2026

## Resumen de evidencia
- 261 ingredientes a fecha de diagnóstico; 38 sin imagen (pista, no criterio suficiente).
- 32 ingredientes sin imagen creados entre 7 y 23 de octubre.
- Tres correspondencias verificadas y consolidadas con el registro `ingredient_consolidation_aliases`.
- El `stock_current` de los ingredientes implicados permaneció idéntico. No se crearon, editaron ni borraron movimientos de stock.
- El histórico de `purchase_invoice_lines`, `purchase_receipt_confirmations`, `stock_movements` e `ingredient_price_history` se mantiene intacto.
- Las referencias FUTURAS en `supplier_item_mappings` se redirigieron a ingredientes canónicos cuando la unidad de base y el precio coincidían.
- Un índice único de nombre normalizado en ingredientes no archivados impide repetir nombres diferenciados solo por mayúsculas o acentos.

## Consolidaciones verificadas
| Original ambiguo | Nombre que queda | Decisión |
|---|---|---|
| Orégano (ficha antigua sin stock, sin receta y precio 0) | Orégano (ficha reciente con receta y precio 2,66) | Se archiva la antigua; se conserva la ficha con precio y receta. No se modifica precio/stock. |
| Queso Rulo Cabra 1 Kg | Queso de cabra | Ambas fichas en gramos y precio 13,63. Se conserva la imagen de la antigua, el histórico de dos recepciones del duplicado y se redirige el mapeo de futuras compras. |
| Sanet jabón manual | Jabón Manos | Ambas fichas en mililitros y precio 1,156. Mismo artículo SANET en el proveedor; se conserva la imagen y el mapeo histórico y se redirige el futuro. |

## Posibles coincidencias NO fusionadas: revisión de equivalencia física
| Ficha nueva | Ficha previa | Por qué no fusionar automáticamente |
|---|---|---|
| Apio (pieza) | Apio | Unidad nueva: ud; anterior: g. Falta peso por pieza. |
| Cebollino (manojo) | Cebollino | Unidad nueva: ud; anterior: g. Falta peso por manojo. |
| Croquetas de cocido (kg) | Croquetas cocido | Nueva: g; antigua: ud. Falta peso por croqueta y comprobar variedad. |
| Croquetas de brandada (kg) | Croquetas bacalao | Nueva: g; antigua: ud. Puede ser otro relleno; falta conversión. |
| Olivas El Faro Gigantes (unidad) | Olivas el Faro | Nueva: ud; antigua: g. Falta contenido por unidad / bote. |
| Bacon Food Service Galno (unidad; peso no indicado) | Bacon | Nueva: ud; antigua: g. El propio nombre indica peso desconocido. |
| DT-MAQ lavavajillas máquina | Lavavajillas Máquina | Nueva: g; anterior: ud, y el detergente puede expresarse por envase. |
| TR-FLOR fregasuelos floral | Friegasuelos | Nueva: g; anterior: ml. Falta densidad/presentación. |
| Haribo Ositos Oro 100 g | Haribo | Misma unidad ud pero posible variedad/formato diferente y precios 0,80 vs 0. |
| Agua con gas Lidl | Agua gas Malavella | Distinta marca; podrían ser SKU diferentes. |
| Red Bull Sugarfree | Red bull | Variante sin azúcar; distinta referencia comercial. |
| Bolsa papel pasta kraft 9+5x23 | Bolsa papel pasta kraft 9+5x32 | Tamaños diferentes; conservar ambos. |
| Nuez | Nuez moscada | Ingredientes diferentes; no fusionar. |

## Por qué no se sumaron compras antiguas al stock
`public.update_ingredient_stock_trigger` **no modifica `stock_current`**
cuando recibe `PURCHASE` con `reference_type='purchase_invoice_line'` y
`origin='receipt_confirmation'`. Por ello algunos duplicados tienen movimientos
de compra positivos, pero `stock_current=0`. Contarlos como stock nuevo ahora
falsearía las existencias. El proceso deja esos apuntes vinculados al ID histórico
y mantiene un alias explícito para resolver la identidad canónica en desarrollos futuros.

## Acciones para futuras revisiones
1. Comprobar unidad, envase, variante, precio y producto real antes de aceptar un duplicado.
2. Si las unidades difieren, exigir una conversión demostrable, no deducirla por nombre.
3. Nunca modificar/borrar asientos del libro de stock; hacer correcciones auditadas de forma aditiva.
4. Evitar crear nuevos ingredientes si la ficha canónica normalizada ya existe.
5. Si se decide unificar una posible equivalencia, registrar su alias y conservar facturas/recibos y stock sin doble conteo.
