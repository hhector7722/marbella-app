-- Ensure invoice-unit display is populated for the first three verified merges.
UPDATE public.ingredients i SET preferred_invoice_unit=i.purchase_unit
WHERE i.preferred_invoice_unit IS NULL
  AND EXISTS(SELECT 1 FROM public.ingredient_consolidation_aliases a WHERE a.canonical_ingredient_id=i.id);
UPDATE public.ingredient_consolidation_aliases a SET
  invoice_unit=i.preferred_invoice_unit,
  conversion_status='resolved'
FROM public.ingredients i
WHERE i.id=a.canonical_ingredient_id AND a.invoice_unit IS NULL
  AND a.conversion_status IS NULL;
