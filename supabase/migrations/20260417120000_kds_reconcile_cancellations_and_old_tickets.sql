-- =============================================================================
-- KDS: reconciliación de anulaciones (objetivo TPV ∪ líneas KDS) + tickets OLD
-- (2026-04-17)
--
-- Problema:
-- - fncalcdelta solo iteraba productos presentes en JSON; productos [] → RETURN
--   sin cancelar líneas pendientes.
-- - Líneas que pasan a 0 en BDP dejan de aparecer en el extractor → no había
--   delta negativo para ese (articulo_id, notas).
-- - Tickets que desaparecen del POST (mesa vacía) no se procesaban en NEW.
--
-- Solución:
-- - Mapa objetivo agregado desde productos (solo envia_a_kds) + FULL OUTER JOIN
--   con conteos existentes (líneas no canceladas) por ticket activo.
-- - fn_trg_process_kds_from_sala: para id_ticket en OLD y no en NEW, delta con [].
-- - No se marca kds_orders como completada al quitar ticket del radar (sigue
--   el comportamiento de 20260416100000).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fncalcdelta(
  aid text,
  amesa text,
  anotas text,
  aprods jsonb,
  adoc text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  vrec jsonb;
  v_target_qty int;
  v_existing_count int;
  v_delta int;
  vi int;

  v_articulo_id int;
  v_nombre text;
  v_notas text;
  v_notas_n text;

  v_envia_art boolean;
  v_envia_dept boolean;
  v_effective_envia boolean;
  v_departamento_id integer;

  v_last_order_id uuid;
  v_last_order_created timestamptz;
  v_batch_id uuid;
  v_cancel_remaining int;

  r record;
BEGIN
  IF aprods IS NULL THEN
    aprods := '[]'::jsonb;
  END IF;

  DROP TABLE IF EXISTS tmp_fncalcdelta_targets;
  CREATE TEMP TABLE tmp_fncalcdelta_targets (
    articulo_id int NOT NULL,
    notas_n text NOT NULL,
    qty int NOT NULL,
    nombre text,
    PRIMARY KEY (articulo_id, notas_n)
  ) ON COMMIT DROP;

  FOR vrec IN SELECT * FROM jsonb_array_elements(aprods)
  LOOP
    v_target_qty := COALESCE(NULLIF(floor(COALESCE((vrec->>'unidades')::numeric, 0))::int, 0), 0);
    IF v_target_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_nombre := NULLIF(btrim(COALESCE(vrec->>'nombre', '')), '');
    v_notas := COALESCE(vrec->>'notas', '');
    v_notas_n := COALESCE(v_notas, '');
    v_articulo_id := NULLIF((vrec->>'articulo_id')::int, 0);

    IF v_articulo_id IS NULL AND v_nombre IS NOT NULL THEN
      SELECT a.id
      INTO v_articulo_id
      FROM public.bdp_articulos a
      WHERE lower(btrim(a.nombre)) = lower(btrim(v_nombre))
      LIMIT 1;
    END IF;

    v_effective_envia := FALSE;
    IF v_articulo_id IS NOT NULL THEN
      SELECT a.envia_a_kds, a.departamento_id
      INTO v_envia_art, v_departamento_id
      FROM public.bdp_articulos a
      WHERE a.id = v_articulo_id
      LIMIT 1;

      IF v_envia_art IS TRUE THEN
        v_effective_envia := TRUE;
      ELSIF v_envia_art IS FALSE THEN
        v_effective_envia := FALSE;
      ELSE
        SELECT d.envia_a_kds
        INTO v_envia_dept
        FROM public.bdp_departamentos d
        WHERE d.id = v_departamento_id
        LIMIT 1;
        v_effective_envia := COALESCE(v_envia_dept, FALSE);
      END IF;
    END IF;

    IF v_effective_envia IS NOT TRUE THEN
      CONTINUE;
    END IF;

    INSERT INTO tmp_fncalcdelta_targets (articulo_id, notas_n, qty, nombre)
    VALUES (v_articulo_id, v_notas_n, v_target_qty, v_nombre)
    ON CONFLICT (articulo_id, notas_n) DO UPDATE
      SET qty = tmp_fncalcdelta_targets.qty + EXCLUDED.qty,
          nombre = COALESCE(EXCLUDED.nombre, tmp_fncalcdelta_targets.nombre);
  END LOOP;

  SELECT o.id, o.created_at
  INTO v_last_order_id, v_last_order_created
  FROM public.kds_orders o
  WHERE o.id_ticket = aid
    AND o.estado = 'activa'::public.kds_order_status
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM tmp_fncalcdelta_targets)
     AND NOT EXISTS (
       SELECT 1
       FROM public.kds_order_lines l
       JOIN public.kds_orders o ON o.id = l.kds_order_id
       WHERE o.id_ticket = aid
         AND o.estado = 'activa'::public.kds_order_status
         AND l.estado <> 'cancelado'::public.kds_item_status
     ) THEN
    RETURN;
  END IF;

  IF v_last_order_id IS NULL
     AND EXISTS (SELECT 1 FROM tmp_fncalcdelta_targets t WHERE t.qty > 0) THEN
    INSERT INTO public.kds_orders (id_ticket, mesa, notas_comanda, estado, origen)
    VALUES (aid, amesa, anotas, 'activa', 'TPV')
    RETURNING id, created_at INTO v_last_order_id, v_last_order_created;
  END IF;

  FOR r IN
    SELECT
      COALESCE(t.articulo_id, e.articulo_id) AS articulo_id,
      COALESCE(t.notas_n, e.notas_n) AS notas_n,
      COALESCE(t.qty, 0) AS target_qty,
      COALESCE(e.cnt, 0) AS existing_cnt,
      t.nombre AS nombre_tgt
    FROM tmp_fncalcdelta_targets t
    FULL OUTER JOIN (
      SELECT
        l.articulo_id,
        COALESCE(l.notas, '') AS notas_n,
        COUNT(*)::int AS cnt
      FROM public.kds_order_lines l
      JOIN public.kds_orders o ON o.id = l.kds_order_id
      WHERE o.id_ticket = aid
        AND o.estado = 'activa'::public.kds_order_status
        AND l.estado <> 'cancelado'::public.kds_item_status
      GROUP BY l.articulo_id, COALESCE(l.notas, '')
    ) e ON t.articulo_id IS NOT DISTINCT FROM e.articulo_id
       AND t.notas_n IS NOT DISTINCT FROM e.notas_n
    WHERE COALESCE(t.articulo_id, e.articulo_id) IS NOT NULL
  LOOP
    v_articulo_id := r.articulo_id;
    v_notas := r.notas_n;
    v_target_qty := r.target_qty;
    v_existing_count := r.existing_cnt;

    v_delta := COALESCE(v_target_qty, 0) - COALESCE(v_existing_count, 0);

    SELECT a.nombre INTO v_nombre
    FROM public.bdp_articulos a
    WHERE a.id = v_articulo_id
    LIMIT 1;
    IF v_nombre IS NULL THEN
      v_nombre := COALESCE(r.nombre_tgt, 'Sin nombre');
    END IF;

    IF v_delta > 0 THEN
      IF v_last_order_id IS NULL THEN
        INSERT INTO public.kds_orders (id_ticket, mesa, notas_comanda, estado, origen)
        VALUES (aid, amesa, anotas, 'activa', 'TPV')
        RETURNING id, created_at INTO v_last_order_id, v_last_order_created;
      END IF;

      IF now() - v_last_order_created > interval '120 seconds' THEN
        INSERT INTO public.kds_orders (id_ticket, mesa, notas_comanda, estado, origen)
        VALUES (aid, amesa, anotas, 'activa', 'TPV')
        RETURNING id, created_at INTO v_batch_id, v_last_order_created;
        v_last_order_id := v_batch_id;
      END IF;

      FOR vi IN 1..v_delta
      LOOP
        INSERT INTO public.kds_order_lines (
          kds_order_id,
          producto_nombre,
          articulo_id,
          unidades,
          cantidad,
          estado,
          notas,
          mesa,
          numero_documento
        )
        VALUES (
          v_last_order_id,
          v_nombre,
          v_articulo_id,
          1,
          1,
          'pendiente',
          NULLIF(v_notas, ''),
          amesa,
          adoc
        );
      END LOOP;

    ELSIF v_delta < 0 THEN
      v_cancel_remaining := -v_delta;

      UPDATE public.kds_order_lines l
      SET estado = 'cancelado'::public.kds_item_status,
          completed_at = COALESCE(l.completed_at, now())
      WHERE l.id IN (
        SELECT l2.id
        FROM public.kds_order_lines l2
        JOIN public.kds_orders o2 ON o2.id = l2.kds_order_id
        WHERE o2.id_ticket = aid
          AND o2.estado = 'activa'::public.kds_order_status
          AND l2.estado = 'pendiente'::public.kds_item_status
          AND l2.articulo_id IS NOT DISTINCT FROM v_articulo_id
          AND COALESCE(l2.notas, '') IS NOT DISTINCT FROM COALESCE(v_notas, '')
        ORDER BY o2.created_at DESC, l2.created_at DESC
        LIMIT v_cancel_remaining
      );
    END IF;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fncalcdelta(text, text, text, jsonb, text) IS
  'Delta KDS: reconcilia mapa TPV (envia_a_kds) con líneas no canceladas por (articulo_id, notas); batch 120s; bajadas → cancelado en pendientes.';


CREATE OR REPLACE FUNCTION public.fn_trg_process_kds_from_sala()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  i jsonb;
  v_old_id text;
  v_new_ids text[];
  v_old_ids text[];
  v_old_mesa jsonb;
BEGIN
  NEW.ultima_actualizacion := now();
  IF NEW.radiografia_completa IS NULL THEN
    NEW.radiografia_completa := '[]'::jsonb;
  END IF;

  IF OLD.radiografia_completa IS NULL THEN
    OLD.radiografia_completa := '[]'::jsonb;
  END IF;

  FOR i IN SELECT * FROM jsonb_array_elements(NEW.radiografia_completa)
  LOOP
    PERFORM public.fn_calculate_and_insert_delta(
      i->>'id_ticket',
      i->>'mesa',
      i->>'notas_comanda',
      i->'productos',
      i->>'numero_documento'
    );
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT (x->>'id_ticket')) FILTER (WHERE (x->>'id_ticket') IS NOT NULL AND btrim(x->>'id_ticket') <> ''), ARRAY[]::text[])
  INTO v_new_ids
  FROM jsonb_array_elements(NEW.radiografia_completa) x;

  SELECT COALESCE(array_agg(DISTINCT (x->>'id_ticket')) FILTER (WHERE (x->>'id_ticket') IS NOT NULL AND btrim(x->>'id_ticket') <> ''), ARRAY[]::text[])
  INTO v_old_ids
  FROM jsonb_array_elements(OLD.radiografia_completa) x;

  FOREACH v_old_id IN ARRAY v_old_ids
  LOOP
    IF NOT (v_old_id = ANY(v_new_ids)) THEN
      SELECT elem INTO v_old_mesa
      FROM jsonb_array_elements(OLD.radiografia_completa) AS t(elem)
      WHERE (elem->>'id_ticket') IS NOT DISTINCT FROM v_old_id
      LIMIT 1;

      IF v_old_mesa IS NOT NULL THEN
        PERFORM public.fn_calculate_and_insert_delta(
          v_old_mesa->>'id_ticket',
          v_old_mesa->>'mesa',
          v_old_mesa->>'notas_comanda',
          '[]'::jsonb,
          v_old_mesa->>'numero_documento'
        );
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_trg_process_kds_from_sala() IS
  'UPDATE estado_sala: deltas desde NEW.radiografia_completa; tickets solo en OLD reciben productos [] para cancelar pendientes KDS. No cierra comandas al quitar ticket del radar.';
