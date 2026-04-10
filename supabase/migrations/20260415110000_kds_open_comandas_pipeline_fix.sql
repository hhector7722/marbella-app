-- =============================================================================
-- KDS: comandas abiertas visibles y deltas coherentes (2026-04-15)
-- Problema:
-- 1) fn_trg_process_kds_from_sala solo llamaba al delta si timestamp_tpv era
--    reciente (<12h): mesas abiertas mucho tiempo dejaban de generar deltas.
-- 2) fncalcdelta buscaba kds_orders solo con created_at "hoy": al cambiar de día
--    se creaba otra cabecera para el mismo id_ticket y las líneas antiguas
--    quedaban huérfanas respecto al fetch del front.
-- 3) El front filtraba activas por líneas creadas "hoy" y ocultaba abiertas con
--    líneas de días anteriores (corrige useKDS en repo).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_trg_process_kds_from_sala()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  i jsonb;
BEGIN
  NEW.ultima_actualizacion := now();
  IF NEW.radiografia_completa IS NULL THEN
    RETURN NEW;
  END IF;

  FOR i IN SELECT * FROM jsonb_array_elements(NEW.radiografia_completa)
  LOOP
    -- Radiografía = mesas abiertas en TPV: procesar siempre el delta (idempotente).
    PERFORM public.fn_calculate_and_insert_delta(
      i->>'id_ticket',
      i->>'mesa',
      i->>'notas_comanda',
      i->'productos',
      i->>'numero_documento'
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_trg_process_kds_from_sala() IS
  'UPDATE estado_sala: recorre radiografia_completa y llama fn_calculate_and_insert_delta por mesa/ticket (sin ventana temporal).';

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
  vid uuid;
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
BEGIN
  IF aprods IS NULL OR jsonb_array_length(aprods) = 0 THEN
    RETURN;
  END IF;

  -- Una cabecera activa por ticket (sin cortar por día calendario).
  SELECT id INTO vid
  FROM public.kds_orders
  WHERE id_ticket = aid
    AND estado = 'activa'::public.kds_order_status
  ORDER BY created_at DESC
  LIMIT 1;

  IF vid IS NULL THEN
    INSERT INTO public.kds_orders (id_ticket, mesa, notas_comanda, estado, origen)
    VALUES (aid, amesa, anotas, 'activa', 'TPV')
    RETURNING id INTO vid;
  END IF;

  FOR vrec IN SELECT * FROM jsonb_array_elements(aprods)
  LOOP
    v_target_qty := COALESCE(NULLIF((vrec->>'unidades')::int, 0), 0);
    IF v_target_qty <= 0 THEN
      CONTINUE;
    END IF;

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

    SELECT COUNT(*) INTO v_existing_count
    FROM public.kds_order_lines l
    WHERE l.kds_order_id = vid
      AND l.articulo_id IS NOT DISTINCT FROM v_articulo_id
      AND l.notas IS NOT DISTINCT FROM v_notas;

    v_delta := v_target_qty - COALESCE(v_existing_count, 0);

    IF v_delta > 0 THEN
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
          vid,
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
    END IF;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION public.fncalcdelta(text, text, text, jsonb, text) IS
  'Delta KDS: cabecera activa por id_ticket (sin reinicio diario); envia_a_kds + articulo_id.';
