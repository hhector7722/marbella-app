-- K5: importa únicamente mappings legacy estructural y dimensionalmente seguros.
--
-- Se crean como PROPOSED de confianza. No producen stock, precio ni recepción.
-- La primera recepción real que pase K5/K4 los confirmará append-only dentro de
-- apply_receipt_line, conservando el actor y la evidencia de esa recepción.

WITH legacy_base AS (
  SELECT
    l.*,
    i.purchase_unit,
    i.base_unit,
    btrim(regexp_replace(
      regexp_replace(
        translate(
          lower(
            CASE
              WHEN l.supplier_id = 1 THEN regexp_replace(
                btrim(l.supplier_item_name),
                '^(?:[A-Z][0-9]{3}[A-Z][0-9]{6}|[A-Z][0-9]{6}[A-Z][0-9]{2}[A-Z]|[A-Z][0-9]{10}|[A-Z][0-9]{8}|[A-Z][0-9]{6})[[:space:]]*',
                '',
                'i'
              )
              ELSE btrim(l.supplier_item_name)
            END
          ),
          'áéíóúüñ',
          'aeiouun'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )) AS canonical_key
  FROM public.supplier_item_mappings l
  JOIN public.ingredients i ON i.id = l.ingredient_id
),
legacy_key_counts AS (
  SELECT supplier_id, canonical_key, count(*) AS n
  FROM legacy_base
  GROUP BY supplier_id, canonical_key
),
active_versions AS (
  SELECT
    v.*,
    btrim(regexp_replace(
      regexp_replace(
        translate(
          lower(
            CASE
              WHEN v.supplier_id = 1 THEN regexp_replace(
                btrim(v.supplier_item_name),
                '^(?:[A-Z][0-9]{3}[A-Z][0-9]{6}|[A-Z][0-9]{6}[A-Z][0-9]{2}[A-Z]|[A-Z][0-9]{10}|[A-Z][0-9]{8}|[A-Z][0-9]{6})[[:space:]]*',
                '',
                'i'
              )
              ELSE btrim(v.supplier_item_name)
            END
          ),
          'áéíóúüñ',
          'aeiouun'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )) AS canonical_key
  FROM public.purchase_mapping_versions v
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.purchase_mapping_versions successor
    WHERE successor.supersedes_id = v.id
  )
),
eligible AS (
  SELECT lb.*
  FROM legacy_base lb
  JOIN legacy_key_counts kc
    ON kc.supplier_id = lb.supplier_id
   AND kc.canonical_key = lb.canonical_key
  WHERE kc.n = 1
    AND lb.canonical_key <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM active_versions av
      WHERE av.supplier_id = lb.supplier_id
        AND av.canonical_key = lb.canonical_key
    )
    AND lb.conversion_factor > 0
    AND lb.line_billing_unit IS NOT NULL
    AND btrim(lb.line_billing_unit) <> ''
    AND lb.line_content_qty > 0
    AND lb.line_content_unit IS NOT NULL
    AND btrim(lb.line_content_unit) <> ''
    AND private.k4_normalize_unit(lb.line_content_unit) IS NOT NULL
    AND private.k4_normalize_unit(lb.purchase_unit) IS NOT NULL
    AND private.k4_normalize_unit(lb.base_unit) IS NOT NULL
    AND private.k4_base_unit_for_purchase_unit(private.k4_normalize_unit(lb.purchase_unit))
        = private.k4_normalize_unit(lb.base_unit)
    AND private.k4_convert_quantity(lb.line_content_qty, lb.line_content_unit, lb.purchase_unit) IS NOT NULL
    AND abs(
      lb.conversion_factor
      - private.k4_convert_quantity(lb.line_content_qty, lb.line_content_unit, lb.purchase_unit)
    ) <= 0.00000001
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
  NULL,
  'k5-legacy-import:' || e.id::text,
  NULL,
  NULL,
  NULL,
  'Importación legacy segura K5; requiere confirmación atómica K4 en la primera recepción real.'
FROM eligible e
ON CONFLICT DO NOTHING;
