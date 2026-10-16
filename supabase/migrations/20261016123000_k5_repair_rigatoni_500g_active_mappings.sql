-- El original de Ametller «Rigatoni nº24 DE CECCO 500 g» factura dos
-- unidades de 500 g. Dos raíces K5 importadas conservan por error 1 kg por
-- unidad y quedan activas junto a la versión confirmada de 500 g. K5/K4
-- bloquean correctamente la ambigüedad. Se versionan esas raíces sin
-- modificar ni eliminar hechos inmutables.

INSERT INTO public.purchase_mapping_versions (
  legacy_mapping_id, supplier_id, supplier_item_name, ingredient_id,
  conversion_factor, line_billing_unit, line_content_qty, line_content_unit,
  status, supersedes_id, source_document_extraction_id, idempotency_key,
  proposed_by, note
)
SELECT
  v.legacy_mapping_id, v.supplier_id, v.supplier_item_name, v.ingredient_id,
  0.5, 'ud', 0.5, 'kg',
  'proposed'::public.purchase_mapping_version_status, v.id,
  v.source_document_extraction_id, 'k5-repair-rigatoni-500g:' || v.id::text,
  NULL, 'Corrección respaldada por «500 g» impreso en el albarán: un envase contiene 0,5 kg.'
FROM public.purchase_mapping_versions v
JOIN public.suppliers s ON s.id = v.supplier_id
JOIN public.ingredients i ON i.id = v.ingredient_id
WHERE s.name = 'Ametller'
  AND i.name = 'Rigatoni'
  AND v.supplier_item_name ILIKE 'Rigatoni%500 g'
  AND v.line_billing_unit = 'ud'
  AND v.line_content_unit = 'kg'
  AND v.line_content_qty = 1
  AND v.conversion_factor = 1
  AND v.status = 'proposed'
  AND NOT EXISTS (
    SELECT 1 FROM public.purchase_mapping_versions successor
    WHERE successor.supersedes_id = v.id
  )
ON CONFLICT DO NOTHING;

-- El caché legacy es mutable y contiene también la variante tipográfica n°.
-- Solo se corrige esa presentación explícita de 500 g; las propuestas K5
-- anteriores permanecen como evidencia histórica.
UPDATE public.supplier_item_mappings m
SET conversion_factor = 0.5, line_content_qty = 0.5
FROM public.suppliers s, public.ingredients i
WHERE m.supplier_id = s.id
  AND m.ingredient_id = i.id
  AND s.name = 'Ametller'
  AND i.name = 'Rigatoni'
  AND m.supplier_item_name ILIKE 'Rigatoni%500 g'
  AND m.line_billing_unit = 'ud'
  AND m.line_content_unit = 'kg'
  AND m.line_content_qty = 1
  AND m.conversion_factor = 1;
