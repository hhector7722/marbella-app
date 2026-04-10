-- =============================================================================
-- KDS: batching (tandas) + cancelaciones visibles (2026-04-15)
--
-- Objetivo operativo:
-- - Si una mesa abierta añade artículos nuevos, NO se "actualiza" la comanda anterior
--   (salvo dentro de una ventana de 120s). Entra una comanda KDS nueva (tanda).
-- - Si el TPV baja unidades (delete/abono), cocina debe enterarse: marcamos líneas
--   como estado='cancelado' (UPDATE → Realtime), NO hacemos DELETE físico.
-- - Si un ticket desaparece del Radar (sale de radiografia_completa), cerramos
--   comandas activas asociadas.
--
-- Notas:
-- - El delta se calcula contra el TOTAL del ticket (sumando todas las comandas activas
--   del mismo id_ticket), para evitar doble inserción al existir batches.
-- - Cancelación recomendada: solo líneas 'pendiente' (no reescribimos historia cocinada).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_trg_process_kds_from_sala()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  i jsonb;
  v_old_id text;
  v_new_ids text[];
  v_old_ids text[];
BEGIN
  NEW.ultima_actualizacion := now();
  IF NEW.radiografia_completa IS NULL THEN
    NEW.radiografia_completa := '[]'::jsonb;
  END IF;

  IF OLD.radiografia_completa IS NULL THEN
    OLD.radiografia_completa := '[]'::jsonb;
  END IF;

  -- Procesar siempre las mesas presentes (idempotente).
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

  -- Detectar tickets que desaparecen del Radar: cerrar comandas activas.
  SELECT COALESCE(array_agg(DISTINCT (x->>'id_ticket')) FILTER (WHERE (x->>'id_ticket') IS NOT NULL AND btrim(x->>'id_ticket') <> ''), ARRAY[]::text[])
  INTO v_new_ids
  FROM jsonb_array_elements(NEW.radiografia_completa) x;

  SELECT COALESCE(array_agg(DISTINCT (x->>'id_ticket')) FILTER (WHERE (x->>'id_ticket') IS NOT NULL AND btrim(x->>'id_ticket') <> ''), ARRAY[]::text[])
  INTO v_old_ids
  FROM jsonb_array_elements(OLD.radiografia_completa) x;

  FOREACH v_old_id IN ARRAY v_old_ids
  LOOP
    IF NOT (v_old_id = ANY(v_new_ids)) THEN
      UPDATE public.kds_orders
      SET estado = 'completada'::public.kds_order_status,
          completed_at = COALESCE(completed_at, now())
      WHERE id_ticket = v_old_id
        AND estado = 'activa'::public.kds_order_status;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_trg_process_kds_from_sala() IS
  'UPDATE estado_sala: procesa deltas; cierra tickets que desaparecen del radar.';


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

  v_envia_art boolean;
  v_envia_dept boolean;
  v_effective_envia boolean;
  v_departamento_id integer;

  v_last_order_id uuid;
  v_last_order_created timestamptz;
  v_batch_id uuid;
  v_cancel_remaining int;
BEGIN
  IF aprods IS NULL OR jsonb_array_length(aprods) = 0 THEN
    RETURN;
  END IF;

  -- Último batch activo del ticket (para ventana 120s).
  SELECT o.id, o.created_at
  INTO v_last_order_id, v_last_order_created
  FROM public.kds_orders o
  WHERE o.id_ticket = aid
    AND o.estado = 'activa'::public.kds_order_status
  ORDER BY o.created_at DESC
  LIMIT 1;

  -- Si no hay comanda activa, creamos la primera (batch base).
  IF v_last_order_id IS NULL THEN
    INSERT INTO public.kds_orders (id_ticket, mesa, notas_comanda, estado, origen)
    VALUES (aid, amesa, anotas, 'activa', 'TPV')
    RETURNING id, created_at INTO v_last_order_id, v_last_order_created;
  END IF;

  FOR vrec IN SELECT * FROM jsonb_array_elements(aprods)
  LOOP
    v_target_qty := COALESCE(NULLIF((vrec->>'unidades')::int, 0), 0);
    -- Unidades <=0 no generan inserción; las bajadas se gestionan con delta negativo (más abajo).

    v_nombre := NULLIF(btrim(COALESCE(vrec->>'nombre', '')), '');
    v_notas := COALESCE(vrec->>'notas', '');
    v_articulo_id := NULLIF((vrec->>'articulo_id')::int, 0);

    IF v_articulo_id IS NULL AND v_nombre IS NOT NULL THEN
      SELECT a.id
      INTO v_articulo_id
      FROM public.bdp_articulos a
      WHERE lower(btrim(a.nombre)) = lower(btrim(v_nombre))
      LIMIT 1;
    END IF;

    -- Determinar si este artículo debe ir a cocina según cascada envia_a_kds.
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

    -- Conteo EXISTENTE: total del ticket en todas las comandas activas (batches),
    -- excluyendo canceladas, para que la suma siempre coincida con TPV.
    SELECT COUNT(*) INTO v_existing_count
    FROM public.kds_order_lines l
    JOIN public.kds_orders o ON o.id = l.kds_order_id
    WHERE o.id_ticket = aid
      AND o.estado = 'activa'::public.kds_order_status
      AND l.estado <> 'cancelado'::public.kds_item_status
      AND l.articulo_id IS NOT DISTINCT FROM v_articulo_id
      AND l.notas IS NOT DISTINCT FROM v_notas;

    v_delta := COALESCE(v_target_qty, 0) - COALESCE(v_existing_count, 0);

    -- Si faltan unidades: insertar en batch (nuevo si >120s desde el último).
    IF v_delta > 0 THEN
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
          v_notas,
          amesa,
          adoc
        );
      END LOOP;

    ELSIF v_delta < 0 THEN
      -- Baja de unidades: cancelar (recomendado) líneas PENDIENTES (LIFO por batch).
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
          AND l2.notas IS NOT DISTINCT FROM v_notas
        ORDER BY o2.created_at DESC, l2.created_at DESC
        LIMIT v_cancel_remaining
      );
    END IF;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fncalcdelta(text, text, text, jsonb, text) IS
  'Delta KDS con batches (ventana 120s) y cancelación visible (delta negativo → estado=cancelado). Conteo total por ticket (todas activas).';

