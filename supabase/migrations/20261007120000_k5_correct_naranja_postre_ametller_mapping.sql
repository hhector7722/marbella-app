-- Corrige el artículo de proveedor "Naranja Postre" (Ametller, proveedor 1):
-- su línea del albarán 01/0261638 del 2026-09-09 quedó apuntando al ingrediente
-- "Aquarius naranja" y el diccionario aprendido apuntaba a "Cebolla morada".
-- El destino correcto es el ingrediente canónico "Naranja".
--
-- Alcance: se corrigen la línea y el diccionario mutable, y se deja una versión
-- de mapeo append-only que supersede la confirmación errónea. NO se reescribe el
-- movimiento de stock legacy de esa línea: K2 es aditivo y reversible, y los
-- movimientos anteriores a K2 se conservan; el corte físico de inventario es el
-- que reconcilia el saldo. No se crea ningún efecto económico nuevo.

-- 1. La línea del albarán deja de apuntar a "Aquarius naranja".
UPDATE public.purchase_invoice_lines
SET mapped_ingredient_id = 'ec49880d-c409-4c1b-ab55-d65d8771eeeb'
WHERE id = '4f535631-1097-4f92-9f9f-39a914725071'
  AND mapped_ingredient_id IS DISTINCT FROM 'ec49880d-c409-4c1b-ab55-d65d8771eeeb';

-- 2. El diccionario aprendido de Ametller para "Naranja Postre" apunta a Naranja.
UPDATE public.supplier_item_mappings
SET ingredient_id = 'ec49880d-c409-4c1b-ab55-d65d8771eeeb'
WHERE id = 'c866a859-d022-43a2-9e10-6a6cb6a07957'
  AND ingredient_id IS DISTINCT FROM 'ec49880d-c409-4c1b-ab55-d65d8771eeeb';

-- 3. Versión de mapeo append-only que supersede la confirmación errónea
--    ("Cebolla morada") y deja Naranja como interpretación vigente.
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
  supersedes_id,
  idempotency_key,
  proposed_by,
  confirmed_by,
  confirmed_at,
  note
)
SELECT
  'c866a859-d022-43a2-9e10-6a6cb6a07957'::uuid,
  1,
  'Naranja Postre',
  'ec49880d-c409-4c1b-ab55-d65d8771eeeb'::uuid,
  1,
  'kg',
  1,
  'kg',
  'proposed'::public.purchase_mapping_version_status,
  '23b2e18f-6a48-4b88-a96d-7781045b03bf'::uuid,
  'k5-correct-naranja-postre:2026-10-07',
  NULL,
  NULL,
  NULL,
  'Corrección: «Naranja Postre» (Ametller) pertenece al ingrediente «Naranja», no a «Aquarius naranja» ni a «Cebolla morada».'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.purchase_mapping_versions
  WHERE idempotency_key = 'k5-correct-naranja-postre:2026-10-07'
);
