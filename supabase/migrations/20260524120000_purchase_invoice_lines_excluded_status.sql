-- Líneas de albarán que no son ingrediente (portes, sin cargo, ajustes…).
-- status = 'excluded' → sin mapped_ingredient_id, sin stock PURCHASE, cuenta como resuelta en UI.

COMMENT ON COLUMN public.purchase_invoice_lines.status IS
  'pending: sin resolver; mapped: vinculada a ingrediente; excluded: portes/ajuste/sin cargo (no requiere ingrediente ni stock).';

-- Auto-mapeo: no tocar líneas excluidas (CREATE OR REPLACE idempotente).
CREATE OR REPLACE FUNCTION public.auto_map_invoice_lines_fuzzy(
  p_invoice_id uuid DEFAULT NULL,
  p_similarity_threshold numeric DEFAULT 0.75
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mapped int := 0;
  v_skipped int := 0;
  rec record;
  v_ingredient_id uuid;
  v_name text;
  v_sim numeric;
BEGIN
  FOR rec IN
    SELECT pil.id, pil.original_name, pi.supplier_id
    FROM public.purchase_invoice_lines pil
    INNER JOIN public.purchase_invoices pi ON pi.id = pil.invoice_id
    WHERE pil.mapped_ingredient_id IS NULL
      AND COALESCE(pil.status, 'pending') <> 'excluded'
      AND pi.supplier_id IS NOT NULL
      AND trim(COALESCE(pil.original_name, '')) <> ''
      AND (p_invoice_id IS NULL OR pil.invoice_id = p_invoice_id)
  LOOP
    v_ingredient_id := NULL;
    v_name := lower(trim(rec.original_name));

    -- Match exacto (case-insensitive)
    SELECT m.ingredient_id
    INTO v_ingredient_id
    FROM public.supplier_item_mappings m
    WHERE m.supplier_id = rec.supplier_id
      AND lower(trim(m.supplier_item_name)) = v_name
      AND m.ingredient_id IS NOT NULL
      AND COALESCE(m.conversion_factor, 0) > 0
    LIMIT 1;

    -- Match fuzzy (pg_trgm)
    IF v_ingredient_id IS NULL AND v_name <> '' THEN
      SELECT m.ingredient_id, similarity(lower(trim(m.supplier_item_name)), v_name)
      INTO v_ingredient_id, v_sim
      FROM public.supplier_item_mappings m
      WHERE m.supplier_id = rec.supplier_id
        AND m.ingredient_id IS NOT NULL
        AND COALESCE(m.conversion_factor, 0) > 0
        AND similarity(lower(trim(m.supplier_item_name)), v_name) >= p_similarity_threshold
      ORDER BY similarity(lower(trim(m.supplier_item_name)), v_name) DESC
      LIMIT 1;
    END IF;

    IF v_ingredient_id IS NOT NULL THEN
      UPDATE public.purchase_invoice_lines
      SET mapped_ingredient_id = v_ingredient_id,
          status = 'mapped'
      WHERE id = rec.id;
      v_mapped := v_mapped + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('mapped', v_mapped, 'skipped', v_skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_map_invoice_lines_fuzzy(uuid, numeric) TO authenticated;
