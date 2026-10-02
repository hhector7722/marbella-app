-- K5: reutiliza mappings legacy ya conocidos cuando su presentación es segura.
--
-- 1) Si un mapping legacy nunca tuvo versión K5 y su presentación es
--    estructuralmente compatible con la unidad canónica del ingrediente,
--    crea una versión PROPOSED de confianza reutilizable.
-- 2) Si el usuario ya había revisado manualmente ese mismo mapping y existe
--    una hoja PROPOSED idéntica, crea un sucesor de confianza en vez de una
--    segunda hoja activa.
-- 3) No toca mappings ambiguos/incompatibles, ni stock, ni precios, ni
--    confirmaciones de recepción.

WITH legacy_base AS (
  SELECT
    l.*,
    i.purchase_unit,
    i.base_unit,
    private.k4_convert_quantity(l.line_content_qty, l.line_content_unit, i.purchase_unit) AS derived_factor
  FROM public.supplier_item_mappings l
  JOIN public.ingredients i ON i.id = l.ingredient_id
),
active_leaf AS (
  SELECT v.*
  FROM public.purchase_mapping_versions v
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.purchase_mapping_versions successor
    WHERE successor.supersedes_id = v.id
  )
),
eligible AS (
  SELECT
    lb.*,
    av.id AS supersedes_id
  FROM legacy_base lb
  LEFT JOIN active_leaf av
    ON av.legacy_mapping_id = lb.id
  WHERE lb.conversion_factor > 0
    AND lb.line_billing_unit IS NOT NULL
    AND btrim(lb.line_billing_unit) <> ''
    AND lb.line_content_qty IS NOT NULL
    AND lb.line_content_qty > 0
    AND lb.line_content_unit IS NOT NULL
    AND btrim(lb.line_content_unit) <> ''
    AND private.k4_normalize_unit(lb.line_content_unit) IS NOT NULL
    AND private.k4_normalize_unit(lb.purchase_unit) IS NOT NULL
    AND private.k4_normalize_unit(lb.base_unit) IS NOT NULL
    AND private.k4_base_unit_for_purchase_unit(private.k4_normalize_unit(lb.purchase_unit))
      = private.k4_normalize_unit(lb.base_unit)
    AND lb.derived_factor IS NOT NULL
    AND abs(lb.conversion_factor - lb.derived_factor) <= 0.00000001
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_mapping_versions trusted
      WHERE trusted.idempotency_key = 'k5-legacy-import:' || lb.id::text
    )
    AND (
      av.id IS NULL
      OR (
        av.status = 'proposed'::public.purchase_mapping_version_status
        AND av.ingredient_id = lb.ingredient_id
        AND abs(av.conversion_factor - lb.conversion_factor) <= 0.00000001
        AND lower(btrim(coalesce(av.line_billing_unit, '')))
          = lower(btrim(coalesce(lb.line_billing_unit, '')))
        AND abs(coalesce(av.line_content_qty, 0) - coalesce(lb.line_content_qty, 0)) <= 0.00000001
        AND lower(btrim(coalesce(av.line_content_unit, '')))
          = lower(btrim(coalesce(lb.line_content_unit, '')))
        AND coalesce(av.idempotency_key, '') NOT LIKE 'k5-legacy-import:%'
      )
    )
    AND NOT (
      av.id IS NULL
      AND EXISTS (
        SELECT 1
        FROM active_leaf other_leaf
        WHERE other_leaf.supplier_id = lb.supplier_id
          AND lower(btrim(other_leaf.supplier_item_name))
            = lower(btrim(lb.supplier_item_name))
      )
    )
)
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
  source_document_extraction_id,
  idempotency_key,
  proposed_by,
  confirmed_by,
  confirmed_at,
  note
)
SELECT
  e.id,
  e.supplier_id,
  e.supplier_item_name,
  e.ingredient_id,
  e.conversion_factor,
  e.line_billing_unit,
  e.line_content_qty,
  e.line_content_unit,
  'proposed'::public.purchase_mapping_version_status,
  e.supersedes_id,
  NULL,
  'k5-legacy-import:' || e.id::text,
  NULL,
  NULL,
  NULL,
  CASE
    WHEN e.supersedes_id IS NULL
      THEN 'Backfill K5: mapping legacy estructuralmente compatible y reutilizable.'
    ELSE 'Backfill K5: promoción de mapping legacy revisado y estructuralmente compatible.'
  END
FROM eligible e
ON CONFLICT DO NOTHING;
