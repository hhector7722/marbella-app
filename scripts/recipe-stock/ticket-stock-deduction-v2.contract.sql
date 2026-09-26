-- Descuento recursivo de venta. No ejecutar en producción.
-- Requiere el esquema, el wrapper v2 y process_ticket_stock_deduction ya instalados.

DO $$
DECLARE
  flour uuid := gen_random_uuid();
  nata uuid := gen_random_uuid();
  bacon uuid := gen_random_uuid();
  parmesan uuid := gen_random_uuid();
  pepper uuid := gen_random_uuid();
  shared uuid := gen_random_uuid();
  direct uuid := gen_random_uuid();
  salsa uuid := gen_random_uuid();
  pasta uuid := gen_random_uuid();
  pasta2 uuid := gen_random_uuid();
  left_recipe uuid := gen_random_uuid();
  right_recipe uuid := gen_random_uuid();
  side_recipe uuid := gen_random_uuid();
  empty_recipe uuid := gen_random_uuid();
  good_recipe uuid := gen_random_uuid();
  bad_recipe uuid := gen_random_uuid();
  factor_recipe uuid := gen_random_uuid();
  src text;
  sale_count integer;
  refund_count integer;
BEGIN
  SELECT p.prosrc INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'process_ticket_stock_deduction';

  IF src IS NULL
     OR src NOT ILIKE '%recipe_stock_requirements_v2_rows%'
     OR src NOT ILIKE '%private.ticket_stock_deduction_runs%'
     OR src NOT ILIKE '%DROP TABLE IF EXISTS pg_temp.ticket_stock_b9%'
     OR src NOT ILIKE '%ON COMMIT DROP%'
     OR src ILIKE '%CREATE TEMP TABLE IF NOT EXISTS%'
     OR src ILIKE '%recipe_ingredients%'
     OR src ILIKE '%recipe_subrecipes%'
     OR src ILIKE '%WITH RECURSIVE%'
     OR src NOT ILIKE '%b9-recursive-v1%'
     OR src NOT ILIKE '%sin líneas persistidas%'
     OR src NOT ILIKE '%SELECT EXISTS%' THEN
    RAISE EXCEPTION 'la venta sigue leyendo el escandallo directo: %', src;
  END IF;

  IF substring(src from position('CREATE TEMP TABLE' in src)) ILIKE '%IF FOUND%'
     OR substring(src from position('CREATE TEMP TABLE' in src)) NOT ILIKE '%SELECT EXISTS%' THEN
    RAISE EXCEPTION 'S: un preflight dinámico depende de FOUND';
  END IF;

  -- T mira el writer instalado. El REVOKE de la tabla nueva es válido;
  -- revocar el schema private, también a authenticated, no lo es.
  IF src ~* 'revoke[[:space:]]+[^;]*on[[:space:]]+schema[[:space:]]+private' THEN
    RAISE EXCEPTION 'T: B9.1 revoca el schema private';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'process_ticket_stock_deduction'
      AND (
        NOT p.prosecdef
        OR NOT (p.proconfig::text ILIKE '%search_path=%')
        OR has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ) THEN
    RAISE EXCEPTION 'la venta cambió de privilegios';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'private'
      AND c.relname = 'ticket_stock_deduction_runs'
      AND c.relrowsecurity
  ) OR has_table_privilege('anon', 'private.ticket_stock_deduction_runs', 'SELECT')
    OR has_table_privilege('authenticated', 'private.ticket_stock_deduction_runs', 'SELECT')
    OR has_table_privilege('authenticated', 'private.ticket_stock_deduction_runs', 'INSERT')
    OR has_table_privilege('anon', 'private.ticket_stock_deduction_runs', 'INSERT') THEN
    RAISE EXCEPTION 'la corrida privada no está cerrada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'revert_ticket_stock_deduction'
      AND (
        p.prosrc ILIKE '%recipe_stock_requirements_v2_rows%'
        OR p.prosrc ILIKE '%recipe_ingredients%'
      )
  ) THEN
    RAISE EXCEPTION 'el reembolso no debe recalcular la receta';
  END IF;

  INSERT INTO public.ingredients (
    id, name, unit_type, purchase_unit, current_price, base_unit
  ) VALUES
    (flour, 'Harina', 'kg', 'kg', 2, 'g'),
    (nata, 'Nata', 'l', 'l', 1, 'ml'),
    (bacon, 'Bacon', 'kg', 'kg', 1, 'g'),
    (parmesan, 'Parmesano', 'kg', 'kg', 0, 'g'),
    (pepper, 'Pimienta molida', 'kg', 'kg', 0, 'g'),
    (shared, 'Compartido', 'kg', 'kg', 1, 'g');

  INSERT INTO public.recipes (id, name) VALUES
    (direct, 'Directa'),
    (left_recipe, 'Izquierda'),
    (right_recipe, 'Derecha'),
    (side_recipe, 'Lateral'),
    (empty_recipe, 'Vacia'),
    (good_recipe, 'Buena'),
    (bad_recipe, 'Mala'),
    (factor_recipe, 'Factor');
  INSERT INTO public.recipes (id, name, is_sellable, yield_quantity, yield_unit)
  VALUES (salsa, 'Salsa carbonara', false, 1, 'ud');
  INSERT INTO public.recipes (id, name, is_sellable) VALUES
    (pasta, 'Pasta carbonara', true),
    (pasta2, 'Pasta carbonara doble', true);

  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES
    (direct, flour, 0.25, 'kg', 1),
    (salsa, nata, 50, 'ml', 1),
    (salsa, bacon, 20, 'g', 1),
    (salsa, parmesan, 10, 'g', 1),
    (salsa, pepper, 0.5, 'g', 1),
    (left_recipe, shared, 10, 'g', 1),
    (right_recipe, shared, 5, 'g', 1),
    (side_recipe, bacon, 20, 'g', 1),
    (good_recipe, bacon, 20, 'g', 1),
    (bad_recipe, flour, 1, 'ml', 1),
    (factor_recipe, nata, 50, 'ml', 1);
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES
    (pasta, salsa, 1, 'ud'),
    (pasta2, salsa, 1, 'ud');

  INSERT INTO public.map_tpv_receta (articulo_id, recipe_id, factor_porcion) VALUES
    (910910001, direct, 1),
    (910910002, pasta, 1),
    (910910003, pasta2, 1),
    (910910004, left_recipe, 1),
    (910910005, right_recipe, 1),
    (910910006, pasta, 1),
    (910910007, side_recipe, 1),
    (910910008, empty_recipe, 1),
    (910910009, good_recipe, 1),
    (910910010, bad_recipe, 1),
    (910910011, factor_recipe, 2),
    (910910012, direct, 1);

  INSERT INTO public.ticket_lines_marbella (
    numero_documento, linea, articulo_id, unidades, precio_unidad, importe_total, fecha_negocio
  ) VALUES
    ('b91-a', 1, 910910001, 1, 0, 0, DATE '2026-09-26'),
    ('b91-b', 1, 910910002, 1, 0, 0, DATE '2026-09-26'),
    ('b91-c', 1, 910910003, 2, 0, 0, DATE '2026-09-26'),
    ('b91-d', 1, 910910004, 1, 0, 0, DATE '2026-09-26'),
    ('b91-d', 2, 910910005, 1, 0, 0, DATE '2026-09-26'),
    ('b91-e', 1, 910910006, 1, 0, 0, DATE '2026-09-26'),
    ('b91-e', 2, 910910006, -1, 0, 0, DATE '2026-09-26'),
    ('b91-e', 3, 910910007, 1, 0, 0, DATE '2026-09-26'),
    ('b91-f', 1, 910910010, 1, 0, 0, DATE '2026-09-26'),
    ('b91-f', 2, 910910009, 1, 0, 0, DATE '2026-09-26'),
    ('b91-g', 1, 910910008, 1, 0, 0, DATE '2026-09-26'),
    ('b91-g', 2, 910910009, 1, 0, 0, DATE '2026-09-26'),
    ('b91-i', 1, 910910011, 1, 0, 0, DATE '2026-09-26'),
    ('b91-j', 1, 910910012, -1, 0, 0, DATE '2026-09-26'),
    ('b91-l', 1, 910910008, 1, 0, 0, DATE '2026-09-26'),
    ('b91-r', 1, 910910006, 1, 0, 0, DATE '2026-09-26'),
    ('b91-r', 2, 910910006, -1, 0, 0, DATE '2026-09-26'),
    ('b91-u', 1, 910910001, 1, 0, 0, DATE '2026-09-26'),
    ('b91-u', 2, 910910099, 1, 0, 0, DATE '2026-09-26'),
    ('b91-v', 1, 910910098, 1, 0, 0, DATE '2026-09-26');

  PERFORM public.process_ticket_stock_deduction('b91-a');
  IF (
    SELECT count(*) FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-a' AND movement_type = 'SALE'
  ) <> 1
  OR EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-a'
      AND (ingredient_id IS DISTINCT FROM flour OR quantity IS DISTINCT FROM 250 OR unit IS DISTINCT FROM 'g')
  ) THEN
    RAISE EXCEPTION 'A: la receta directa no descuenta 250 g';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-b');
  IF (
    SELECT count(*) FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-b' AND movement_type = 'SALE'
  ) <> 4
  OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-b' AND ingredient_id = nata AND quantity = 50 AND unit = 'ml'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-b' AND ingredient_id = bacon AND quantity = 20 AND unit = 'g'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-b' AND ingredient_id = parmesan AND quantity = 10 AND unit = 'g'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-b' AND ingredient_id = pepper AND quantity = 0.5 AND unit = 'g'
  ) THEN
    RAISE EXCEPTION 'B: carbonara no descuenta el lote físico';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-c');
  IF NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-c' AND ingredient_id = nata AND quantity = 100 AND unit = 'ml'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-c' AND ingredient_id = pepper AND quantity = 1 AND unit = 'g'
  ) THEN
    RAISE EXCEPTION 'C: unidades 2 no duplica';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-d');
  SELECT count(*) INTO sale_count
  FROM public.stock_movements
  WHERE reference_doc = 'TICKET-b91-d' AND movement_type = 'SALE';
  IF sale_count <> 1 OR EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-d'
      AND (ingredient_id IS DISTINCT FROM shared OR quantity IS DISTINCT FROM 15 OR unit IS DISTINCT FROM 'g')
  ) THEN
    RAISE EXCEPTION 'D: el ingrediente compartido no suma en un solo movimiento';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-e');
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-e' AND ingredient_id IN (nata, bacon, parmesan, pepper)
      AND ingredient_id <> bacon
  ) OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-e' AND ingredient_id = bacon AND quantity = 20 AND unit = 'g'
  ) OR (
    SELECT count(*) FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-e' AND movement_type = 'SALE'
  ) <> 1 THEN
    RAISE EXCEPTION 'E: el neto cero no debía descontar la receta anulada';
  END IF;

  BEGIN
    PERFORM public.process_ticket_stock_deduction('b91-f');
    RAISE EXCEPTION 'F debía abortar';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'F debía abortar' THEN
        RAISE EXCEPTION 'F no abortó';
      END IF;
      IF SQLERRM NOT ILIKE '%expansión de stock inválida%'
         OR SQLERRM NOT ILIKE '%' || bad_recipe::text || '%' THEN
        RAISE EXCEPTION 'F error inesperado: %', SQLERRM;
      END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-f' AND movement_type = 'SALE'
  ) THEN
    RAISE EXCEPTION 'F escribió movimientos';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-f'
  ) THEN
    RAISE EXCEPTION 'O: el error dejó una corrida';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-g');
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-g' AND ingredient_id IS NULL
  ) OR (
    SELECT count(*) FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-g' AND movement_type = 'SALE'
  ) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-g' AND ingredient_id = bacon AND quantity = 20
  ) THEN
    RAISE EXCEPTION 'G: la receta vacía bloqueó o no se escribió la válida';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-b');
  IF (
    SELECT count(*) FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-b' AND movement_type = 'SALE'
  ) <> 4 THEN
    RAISE EXCEPTION 'H: el segundo proceso duplicó';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-i');
  IF NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-i' AND ingredient_id = nata AND quantity = 100 AND unit = 'ml'
  ) THEN
    RAISE EXCEPTION 'I: factor_porcion 2 no escaló';
  END IF;

  BEGIN
    PERFORM public.process_ticket_stock_deduction('b91-j');
    RAISE EXCEPTION 'J debía abortar';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'J debía abortar' THEN
        RAISE EXCEPTION 'J no abortó';
      END IF;
      IF SQLERRM NOT ILIKE '%multiplicador neto inválido%' THEN
        RAISE EXCEPTION 'J error inesperado: %', SQLERRM;
      END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-j' AND movement_type = 'SALE'
  ) OR EXISTS (
    SELECT 1 FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-j'
  ) THEN
    RAISE EXCEPTION 'J escribió movimientos';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-l');
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-l' AND movement_type = 'SALE'
  ) OR (
    SELECT count(*) FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-l' AND movement_count = 0
  ) <> 1 THEN
    RAISE EXCEPTION 'L: la receta vacía no cerró el ticket en cero';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-l');
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-l' AND movement_type = 'SALE'
  ) OR (
    SELECT count(*) FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-l'
  ) <> 1 THEN
    RAISE EXCEPTION 'M: el segundo proceso de la vacía duplicó la corrida';
  END IF;

  INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity_gross, unit, umb_multiplier)
  VALUES (empty_recipe, flour, 10, 'g', 1);
  PERFORM public.process_ticket_stock_deduction('b91-l');
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-l' AND movement_type = 'SALE'
  ) OR (
    SELECT count(*) FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-l' AND movement_count = 0
  ) <> 1 THEN
    RAISE EXCEPTION 'N: un ticket cerrado se recalculó al cambiar la receta';
  END IF;

  IF (
    SELECT count(*) FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-b' AND movement_count = 4
  ) <> 1
  OR (
    SELECT count(*) FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-b' AND movement_type = 'SALE'
  ) IS DISTINCT FROM (
    SELECT movement_count FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-b'
  ) THEN
    RAISE EXCEPTION 'P: la corrida no coincide con los SALE';
  END IF;

  PERFORM public.revert_ticket_stock_deduction('b91-b');
  SELECT count(*) INTO refund_count
  FROM public.stock_movements
  WHERE reference_doc = 'REFUND-b91-b' AND movement_type = 'ADJUSTMENT';
  IF refund_count <> 4 OR EXISTS (
    SELECT 1
    FROM public.stock_movements sale
    JOIN public.stock_movements refund
      ON refund.ingredient_id = sale.ingredient_id
     AND refund.reference_doc = 'REFUND-b91-b'
     AND refund.movement_type = 'ADJUSTMENT'
    WHERE sale.reference_doc = 'TICKET-b91-b'
      AND sale.movement_type = 'SALE'
      AND (refund.quantity IS DISTINCT FROM abs(sale.quantity) OR refund.unit IS DISTINCT FROM sale.unit)
  ) THEN
    RAISE EXCEPTION 'K: el reembolso no reintegra los SALE agregados';
  END IF;

  BEGIN
    PERFORM public.process_ticket_stock_deduction('b91-q');
    RAISE EXCEPTION 'Q debía abortar';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'Q debía abortar' THEN
        RAISE EXCEPTION 'Q no abortó';
      END IF;
      IF SQLERRM NOT ILIKE '%sin líneas persistidas%' THEN
        RAISE EXCEPTION 'Q error inesperado: %', SQLERRM;
      END IF;
  END;
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-q' AND movement_type = 'SALE'
  ) OR EXISTS (
    SELECT 1 FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-q'
  ) THEN
    RAISE EXCEPTION 'Q: un ticket sin líneas se cerró';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-r');
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-r' AND movement_type = 'SALE'
  ) OR (
    SELECT count(*) FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-r' AND movement_count = 0
  ) <> 1 THEN
    RAISE EXCEPTION 'R: el neto cero con líneas no cerró en cero';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-u');
  IF NOT EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-u'
      AND movement_type = 'SALE'
      AND ingredient_id = flour
      AND quantity = 250
      AND unit = 'g'
  ) OR (
    SELECT count(*) FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-u' AND movement_type = 'SALE'
  ) <> 1
  OR NOT EXISTS (
    SELECT 1 FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-u'
      AND (provenance->>'ticket_line_count')::integer = 2
      AND (provenance->>'mapped_line_count')::integer = 1
      AND (provenance->>'unmapped_line_count')::integer = 1
      AND provenance->'unmapped_article_ids' = jsonb_build_array(910910099)
      AND provenance->>'source' = 'bdp_webhook'
      AND provenance->>'command' = 'process_ticket_stock_deduction'
      AND provenance->>'schema_version' = 'b9-recursive-v1'
  ) THEN
    RAISE EXCEPTION 'U: el artículo sin mapping no quedó fotografiado';
  END IF;

  PERFORM public.process_ticket_stock_deduction('b91-v');
  IF EXISTS (
    SELECT 1 FROM public.stock_movements
    WHERE reference_doc = 'TICKET-b91-v' AND movement_type = 'SALE'
  ) OR NOT EXISTS (
    SELECT 1 FROM private.ticket_stock_deduction_runs
    WHERE numero_documento = 'b91-v'
      AND movement_count = 0
      AND (provenance->>'unmapped_line_count')::integer > 0
      AND provenance->'unmapped_article_ids' @> jsonb_build_array(910910098)
  ) THEN
    RAISE EXCEPTION 'V: el ticket solo sin mapping no cerró con la foto';
  END IF;

  DELETE FROM private.ticket_stock_deduction_runs
  WHERE numero_documento IN (
    'b91-a', 'b91-b', 'b91-c', 'b91-d', 'b91-e', 'b91-f', 'b91-g', 'b91-i', 'b91-j', 'b91-l', 'b91-q', 'b91-r', 'b91-u', 'b91-v'
  );
  DELETE FROM public.stock_movements
  WHERE reference_doc IN (
    'TICKET-b91-a', 'TICKET-b91-b', 'TICKET-b91-c', 'TICKET-b91-d', 'TICKET-b91-e',
    'TICKET-b91-f', 'TICKET-b91-g', 'TICKET-b91-i', 'TICKET-b91-j', 'TICKET-b91-l',
    'TICKET-b91-q', 'TICKET-b91-r', 'TICKET-b91-u', 'TICKET-b91-v',
    'REFUND-b91-b'
  )
     OR idempotency_key LIKE 'sale:b91-%'
     OR idempotency_key LIKE 'sale-refund:b91-%';
  DELETE FROM public.ticket_lines_marbella
  WHERE numero_documento IN (
    'b91-a', 'b91-b', 'b91-c', 'b91-d', 'b91-e', 'b91-f', 'b91-g', 'b91-i', 'b91-j', 'b91-l', 'b91-q', 'b91-r', 'b91-u', 'b91-v'
  );
  DELETE FROM public.map_tpv_receta
  WHERE articulo_id BETWEEN 910910001 AND 910910012;
  DELETE FROM public.recipe_subrecipes
  WHERE parent_recipe_id IN (pasta, pasta2);
  DELETE FROM public.recipe_ingredients
  WHERE recipe_id IN (
    direct, salsa, left_recipe, right_recipe, side_recipe, empty_recipe, good_recipe, bad_recipe, factor_recipe
  );
  DELETE FROM public.recipes
  WHERE id IN (
    direct, salsa, pasta, pasta2, left_recipe, right_recipe, side_recipe,
    empty_recipe, good_recipe, bad_recipe, factor_recipe
  );
  DELETE FROM public.ingredients
  WHERE id IN (flour, nata, bacon, parmesan, pepper, shared);
END;
$$;
