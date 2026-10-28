---
documento: SPIKE-AUDITORIA-INGREDIENTES-DUPLICADOS-2026-10-27
clase: inmutable
estado: vigente
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-10-27
caducidad: no aplica
supersede: —
---

# Auditoría y unificación de ingredientes — 27/10/2026

## Resultado
- **15 identidades duplicadas unificadas** en `public.ingredient_consolidation_aliases`: 3 de la primera revisión + 12 verificadas contra albaranes en la segunda revisión.
- Ningún movimiento de `public.stock_movements` editado, eliminado o generado durante la migración.
- El registro `ingredients.stock_current` no se escribió; el SQL compara antes/después y revierte todo si detecta diferencias.
- Los duplicados no se borraron: `archived_at` y `inventory_visible=false`, reteniendo los IDs y las confirmaciones/facturas históricas.
- Los alias de referencia se preservan y las correspondencias futuras con unidad física compatible se redirigen al producto activo.

## Correspondencias consolidadas

| Ingrediente duplicado | Ingrediente conservado | Unidad en el albarán | Tratamiento de entrada futura |
|---|---|---|---|
| Oregano | Orégano | kg | Seguro, ambos gramos (primera revisión) |
| Queso Rulo Cabra 1 Kg | Queso de cabra | kg | Seguro, ambos gramos (primera revisión) |
| Sanet jabón manual | Jabón Manos | l | Seguro, ambos ml (primera revisión) |
| Haribo Ositos Oro 100 g | Haribo | ud | Seguro: ambos ud, mismo producto exacto facturado |
| Paleta cocida extra | Jamón york | kg | Seguro: mismo artículo `ESPATLLE CUITA EXTRA 11x11`, ambos gramos |
| Centro pernil C/V | Jamón Serrano | kg | Seguro: misma denominación `CENTRE PERNIL C/V`, ambos gramos |
| Centro paleta cebo 50% | Jamón Ibérico | kg | Ambos gramos; precio 41,2008 €/kg, tipo cebo ibérico |
| Apio (pieza) | Apio | ud | Requiere peso real por pieza: ud vs g |
| Cebollino (manojo) | Cebollino | manojo | Requiere peso real por manojo: ud vs g |
| Croquetas de cocido (kg) | Croquetas cocido | kg | Requiere unidades/kg antes de convertir a ud |
| Croquetas de brandada (kg) | Croquetas bacalao | kg | Requiere unidades/kg antes de convertir a ud |
| Bacon Food Service Galno | Bacon | kg (histórico; último albarán marcó «unidades») | Requiere peso por unidad de envase |
| Olivas El Faro Gigantes (unidad) | Olivas el Faro | ud | Requiere peso neto por recipiente |
| DT-MAQ lavavajillas máquina | Lavavajillas Máquina | kg | Stock anterior en ud: requiere precisar tamaño/formato |
| TR-FLOR fregasuelos floral | Friegasuelos | kg | Inventario previo en ml: requiere densidad o equivalencia kg/l |

## Unidad según el albarán, sin alterar la física
Se añadió `ingredients.preferred_invoice_unit` para reflejar la unidad que realmente aparece en los albaranes, independientemente de `purchase_unit/base_unit` cuando los datos históricos de recetas/stock usan otra dimensión. Cambiar `purchase_unit` sin convertir su `base_unit` viola la restricción canónica `ingredients_purchase_base_unit_canonical`; convertir el stock sin un peso o densidad verificados falsificaría existencias.

Los **8 ingredientes con unidad física diferente** han quedado unificados como identidades, pero conservan **9 referencias concretas de proveedor a revisar** en `ingredient_consolidation_conversion_reviews`.
Las filas `supplier_item_mappings` afectadas mantienen su descripción, cantidad, unidad de albarán y precio previo, pero quedan sin asignación de ingrediente `ingredient_id=NULL` hasta conocer la equivalencia. Evita que las próximas facturas se contabilicen como 1 gramo por 1 pieza o 1 ml por 1 kg. Revisión en `/dashboard/inventory/unificaciones`.

## Artículos similares que no son duplicados
- Agua con gas Lidl vs Agua con gas Malavella: marcas distintas.
- Red Bull Sugarfree vs Red Bull: variante sin azúcar distinta.
- Nuez vs Nuez moscada: productos distintos.
- Bolsa papel kraft 9+5x23 vs 9+5x32: tamaños distintos.
- Pincho caracol 100 uds vs palillos normales 1000 uds: productos distintos.
- Té sin variedad determinada vs té negro/rojo/verde: falta especificar variedad para identificar una coincidencia, por tanto no se ha fusionado.
- Croqueta crema catalana vs croquetas saladas: productos distintos.
- Envases y bandejas con tamaños/capacidades diferentes: productos distintos.

## Salvaguardas
La fecha de creación y ausencia de foto se usaron solo como pistas, nunca como evidencia suficiente.
El archivo de la migración `20261027113000_supplier_invoice_evidence_ingredient_merges.sql` contiene los IDs de entrada, evidencias y validaciones transaccionales.
Las consultas de verificación posteriores deben comprobar conteos de alias, recetas y stock, así como ausencia de futuros mapeos a ingredientes archivados.
