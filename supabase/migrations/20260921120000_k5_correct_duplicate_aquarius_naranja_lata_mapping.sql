-- Corrige el artículo de proveedor "AQUARIUS NARANJA LATA" (proveedor 9) para
-- que apunte al ingrediente canónico "Aquarius naranja" en lugar del
-- ingrediente duplicado creado por error el 2026-06-04.
--
-- No se borra ningún hecho: `purchase_mapping_versions` es append-only
-- (ADR-0012 §3) y la corrección se expresa como una versión que supersede a la
-- anterior. La fila duplicada de `ingredients` se conserva porque una versión
-- de mapeo inmutable la referencia (FK RESTRICT); se retira del inventario con
-- `inventory_visible = false`.

-- 1. El mapping legacy del proveedor pasa a apuntar al ingrediente canónico.
UPDATE public.supplier_item_mappings
SET ingredient_id = 'c9c87d4a-b095-4e3f-b127-b3c2f9b4a5d9'
WHERE id = '146fae86-60d3-4901-81e5-c3895eaf0d29'
  AND ingredient_id IS DISTINCT FROM 'c9c87d4a-b095-4e3f-b127-b3c2f9b4a5d9';

-- 2. Versión de mapeo append-only que supersede la propuesta importada y deja
--    el mapeo activo apuntando al canónico.
INSERT INTO public.purchase_mapping_versions (
  legacy_mapping_id,
  supplier_id,
  supplier_item_name,
  ingredient_id,
  conversion_factor,
  line_billing_unit,
  line_content_qty,
  line_content_unit,
  status,
  source_document_extraction_id,
  idempotency_key,
  proposed_by,
  confirmed_by,
  confirmed_at,
  supersedes_id,
  note
)
SELECT
  '146fae86-60d3-4901-81e5-c3895eaf0d29'::uuid,
  9,
  'AQUARIUS NARANJA LATA',
  'c9c87d4a-b095-4e3f-b127-b3c2f9b4a5d9'::uuid,
  1,
  'ud',
  1,
  'ud',
  'proposed'::public.purchase_mapping_version_status,
  NULL,
  'k5-correct-duplicate:146fae86-60d3-4901-81e5-c3895eaf0d29',
  NULL,
  NULL,
  NULL,
  'fb5b2b3e-3dd5-4143-b77c-b0cc69c35f50'::uuid,
  'Corrección: el artículo del proveedor pertenece a "Aquarius naranja". Se retira el ingrediente duplicado "AQUARIUS NARANJA LATA".'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.purchase_mapping_versions
  WHERE supersedes_id = 'fb5b2b3e-3dd5-4143-b77c-b0cc69c35f50'
);

-- 3. La línea del albarán deja de apuntar al duplicado.
UPDATE public.purchase_invoice_lines
SET mapped_ingredient_id = 'c9c87d4a-b095-4e3f-b127-b3c2f9b4a5d9'
WHERE id = '174a4a74-0fea-449e-903a-7923329eafd5'
  AND mapped_ingredient_id IS DISTINCT FROM 'c9c87d4a-b095-4e3f-b127-b3c2f9b4a5d9';

-- 4. El duplicado sale de la base de inventario. La fila no se borra: está
--    referenciada por la versión de mapeo superseded, que es inmutable.
UPDATE public.ingredients
SET inventory_visible = false
WHERE id = 'ea28e180-e86b-4b9e-9ee5-9a1b8d4c2e93'
  AND inventory_visible IS DISTINCT FROM false;
