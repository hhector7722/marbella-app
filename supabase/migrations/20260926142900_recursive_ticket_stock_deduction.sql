-- Descuento de venta por expansión canónica.
-- No recorre recipe_ingredients. No reprocesa un ticket ya completado.
-- Si una receta con multiplicador neto positivo no está ok, no escribe nada
-- y no deja corrida.

CREATE SCHEMA IF NOT EXISTS private;

GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE private.ticket_stock_deduction_runs (
  numero_documento text PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  movement_count integer NOT NULL CHECK (movement_count >= 0),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE private.ticket_stock_deduction_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.ticket_stock_deduction_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE private.ticket_stock_deduction_runs TO service_role;

CREATE POLICY ticket_stock_deduction_runs_service_read
  ON private.ticket_stock_deduction_runs
  FOR SELECT TO service_role
  USING (true);

CREATE POLICY ticket_stock_deduction_runs_service_insert
  ON private.ticket_stock_deduction_runs
  FOR INSERT TO service_role
  WITH CHECK (true);

COMMENT ON TABLE private.ticket_stock_deduction_runs IS
  'Cierre de process_ticket_stock_deduction. Una fila significa que el ticket ya se procesó, aunque movement_count sea 0. No guarda el detalle económico ni rellena tickets antiguos que solo tienen SALE.';

CREATE OR REPLACE FUNCTION public.process_ticket_stock_deduction(p_numero_documento text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recipe_id uuid;
  v_ingredient_id uuid;
  v_multiplier numeric;
  v_errors jsonb;
  v_movement_count integer := 0;
  v_has_issue boolean := false;
  v_ticket_line_count integer := 0;
  v_mapped_line_count integer := 0;
  v_unmapped_line_count integer := 0;
  v_unmapped_article_ids jsonb := '[]'::jsonb;
BEGIN
  IF btrim(coalesce(p_numero_documento, '')) = '' THEN
    RAISE EXCEPTION 'El número de ticket es obligatorio';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ticket-stock:' || p_numero_documento, 0));

  EXECUTE 'DROP TABLE IF EXISTS pg_temp.ticket_stock_b9';

  IF EXISTS (
    SELECT 1
    FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = p_numero_documento
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_movements
    WHERE reference_doc = 'TICKET-' || p_numero_documento
      AND movement_type = 'SALE'
  ) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ticket_lines_marbella
    WHERE numero_documento = p_numero_documento
  ) THEN
    RAISE EXCEPTION 'ticket % sin líneas persistidas; no se puede cerrar el stock', p_numero_documento;
  END IF;

  SELECT mtr.recipe_id
  INTO v_recipe_id
  FROM public.ticket_lines_marbella tl
  JOIN public.map_tpv_receta mtr ON tl.articulo_id = mtr.articulo_id
  WHERE tl.numero_documento = p_numero_documento
    AND (
      mtr.factor_porcion IS NULL
      OR mtr.factor_porcion <= 0
      OR mtr.factor_porcion = 'NaN'::numeric
      OR mtr.factor_porcion = 'Infinity'::numeric
      OR mtr.factor_porcion = '-Infinity'::numeric
    )
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'factor_porcion inválido para recipe_id %', v_recipe_id;
  END IF;

  SELECT nets.recipe_id, nets.multiplier
  INTO v_recipe_id, v_multiplier
  FROM (
    SELECT
      mtr.recipe_id,
      sum(tl.unidades * mtr.factor_porcion) AS multiplier
    FROM public.ticket_lines_marbella tl
    JOIN public.map_tpv_receta mtr ON tl.articulo_id = mtr.articulo_id
    WHERE tl.numero_documento = p_numero_documento
    GROUP BY mtr.recipe_id
  ) nets
  WHERE nets.multiplier < 0
     OR nets.multiplier = 'NaN'::numeric
     OR nets.multiplier = 'Infinity'::numeric
     OR nets.multiplier = '-Infinity'::numeric
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'multiplicador neto inválido para recipe_id %: %', v_recipe_id, v_multiplier;
  END IF;

  EXECUTE $sql$
    CREATE TEMP TABLE pg_temp.ticket_stock_b9 (
      recipe_id uuid,
      ok boolean,
      ingredient_count integer,
      ingredient_id uuid,
      quantity_base numeric,
      unit_base text,
      errors jsonb
    ) ON COMMIT DROP
  $sql$;

  EXECUTE $sql$
    INSERT INTO pg_temp.ticket_stock_b9 (
      recipe_id, ok, ingredient_count, ingredient_id, quantity_base, unit_base, errors
    )
    SELECT
      nets.recipe_id,
      rows.ok,
      rows.ingredient_count,
      rows.ingredient_id,
      rows.quantity_base,
      rows.unit_base,
      rows.errors
    FROM (
      SELECT
        mtr.recipe_id,
        sum(tl.unidades * mtr.factor_porcion) AS multiplier
      FROM public.ticket_lines_marbella tl
      JOIN public.map_tpv_receta mtr ON tl.articulo_id = mtr.articulo_id
      WHERE tl.numero_documento = $1
      GROUP BY mtr.recipe_id
      HAVING sum(tl.unidades * mtr.factor_porcion) > 0
    ) nets
    CROSS JOIN LATERAL public.recipe_stock_requirements_v2_rows(
      nets.recipe_id,
      nets.multiplier
    ) AS rows
  $sql$
  USING p_numero_documento;

  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1
      FROM pg_temp.ticket_stock_b9
      WHERE ok IS DISTINCT FROM true
    )
  $sql$
  INTO v_has_issue;

  IF v_has_issue THEN
    EXECUTE $sql$
      SELECT recipe_id, errors
      FROM pg_temp.ticket_stock_b9
      WHERE ok IS DISTINCT FROM true
      LIMIT 1
    $sql$
    INTO v_recipe_id, v_errors;
    RAISE EXCEPTION 'expansión de stock inválida para recipe_id %: %', v_recipe_id, v_errors;
  END IF;

  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
        AND (quantity_base IS NULL OR unit_base IS NULL OR btrim(unit_base) = '')
    )
  $sql$
  INTO v_has_issue;

  IF v_has_issue THEN
    EXECUTE $sql$
      SELECT recipe_id
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
        AND (quantity_base IS NULL OR unit_base IS NULL OR btrim(unit_base) = '')
      LIMIT 1
    $sql$
    INTO v_recipe_id;
    RAISE EXCEPTION 'expansión de stock sin cantidad segura para recipe_id %', v_recipe_id;
  END IF;

  EXECUTE $sql$
    SELECT EXISTS (
      SELECT 1
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
      GROUP BY ingredient_id
      HAVING count(DISTINCT unit_base) > 1
    )
  $sql$
  INTO v_has_issue;

  IF v_has_issue THEN
    EXECUTE $sql$
      SELECT ingredient_id
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
      GROUP BY ingredient_id
      HAVING count(DISTINCT unit_base) > 1
      LIMIT 1
    $sql$
    INTO v_ingredient_id;
    RAISE EXCEPTION 'ingrediente % sin una sola unidad base en el ticket', v_ingredient_id;
  END IF;

  EXECUTE $sql$
    INSERT INTO public.stock_movements (
      movement_type, ingredient_id, quantity, unit, movement_date,
      reference_doc, original_description, processed_by,
      reference_type, reference_external_id, idempotency_key, origin, provenance
    )
    SELECT
      'SALE',
      agg.ingredient_id,
      agg.quantity_base,
      agg.unit_base,
      now(),
      'TICKET-' || $1,
      'Deducción automática TPV - Ticket ' || $1,
      'process_ticket_stock_deduction',
      'sale_ticket'::public.stock_reference_type,
      $1,
      'sale:' || $1 || ':' || agg.ingredient_id::text,
      'sale_webhook'::public.stock_movement_origin,
      jsonb_build_object(
        'source', 'bdp_webhook',
        'command', 'process_ticket_stock_deduction',
        'schema_version', 'b9-recursive-v1',
        'expansion', 'recipe_stock_requirements_v2_rows'
      )
    FROM (
      SELECT
        ingredient_id,
        unit_base,
        sum(quantity_base) AS quantity_base
      FROM pg_temp.ticket_stock_b9
      WHERE ingredient_id IS NOT NULL
      GROUP BY ingredient_id, unit_base
    ) agg
    WHERE agg.quantity_base IS NOT NULL
      AND agg.quantity_base > 0
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  $sql$
  USING p_numero_documento;

  GET DIAGNOSTICS v_movement_count = ROW_COUNT;

  SELECT
    count(*)::integer,
    count(mtr.recipe_id)::integer,
    (count(*) - count(mtr.recipe_id))::integer,
    COALESCE((
      SELECT jsonb_agg(missing.articulo_id ORDER BY missing.articulo_id)
      FROM (
        SELECT DISTINCT tl_missing.articulo_id
        FROM public.ticket_lines_marbella tl_missing
        WHERE tl_missing.numero_documento = p_numero_documento
          AND NOT EXISTS (
            SELECT 1
            FROM public.map_tpv_receta mapped
            WHERE mapped.articulo_id = tl_missing.articulo_id
          )
      ) missing
    ), '[]'::jsonb)
  INTO
    v_ticket_line_count,
    v_mapped_line_count,
    v_unmapped_line_count,
    v_unmapped_article_ids
  FROM public.ticket_lines_marbella tl
  LEFT JOIN public.map_tpv_receta mtr ON mtr.articulo_id = tl.articulo_id
  WHERE tl.numero_documento = p_numero_documento;

  INSERT INTO private.ticket_stock_deduction_runs (
    numero_documento, movement_count, provenance
  ) VALUES (
    p_numero_documento,
    v_movement_count,
    jsonb_build_object(
      'source', 'bdp_webhook',
      'command', 'process_ticket_stock_deduction',
      'schema_version', 'b9-recursive-v1',
      'ticket_line_count', v_ticket_line_count,
      'mapped_line_count', v_mapped_line_count,
      'unmapped_line_count', v_unmapped_line_count,
      'unmapped_article_ids', v_unmapped_article_ids
    )
  );

  EXECUTE 'DROP TABLE IF EXISTS pg_temp.ticket_stock_b9';
END;
$$;

COMMENT ON FUNCTION public.process_ticket_stock_deduction(text) IS
  'Descuenta un ticket nuevo expandiendo cada receta con recipe_stock_requirements_v2_rows. Atómico: ok false no escribe cantidades ni deja corrida. Una expansión válida vacía no bloquea. La corrida cierra el ticket aunque no haya SALE. Un SALE antiguo sin corrida no se reprocesa ni se rellena.';

REVOKE ALL ON FUNCTION public.process_ticket_stock_deduction(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_ticket_stock_deduction(text) TO service_role;
