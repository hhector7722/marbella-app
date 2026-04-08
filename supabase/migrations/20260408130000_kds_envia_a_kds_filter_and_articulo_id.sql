-- =============================================================================
-- KDS: filtrado envia_a_kds + relleno articulo_id (2026-04-08)
-- Reglas:
-- - bdp_articulos.envia_a_kds = TRUE  => siempre cocina
-- - bdp_articulos.envia_a_kds = FALSE => nunca cocina
-- - bdp_articulos.envia_a_kds IS NULL => hereda bdp_departamentos.envia_a_kds (por departamento_id)
-- Además:
-- - kds_order_lines.articulo_id debe persistirse (viene del TPV en JSON; fallback por nombre).
-- - Delta: Unidades_TPV - COUNT(lineas ya en KDS) (a nivel artículo + notas).
-- - KDS muestra SOLO el día en curso (el front filtra por created_at >= inicio de día).
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
  v_departamento_id int;
BEGIN
  IF aprods IS NULL OR jsonb_array_length(aprods) = 0 THEN
    RETURN;
  END IF;

  -- Cabecera KDS por ticket (día en curso, Madrid)
  SELECT id INTO vid
  FROM public.kds_orders
  WHERE id_ticket = aid
    AND created_at >= ((now() AT TIME ZONE 'Europe/Madrid')::date AT TIME ZONE 'Europe/Madrid')
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

    -- Fallback: si no viene articulo_id, resolverlo por nombre en catálogo BDP.
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

    -- Si no hay articulo_id o no envía a KDS, NO insertar líneas.
    IF v_effective_envia IS NOT TRUE THEN
      CONTINUE;
    END IF;

    -- Delta por (kds_order_id + articulo_id + notas). Si no hay notas, iguala por IS NOT DISTINCT FROM.
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
  'Delta KDS con filtrado envia_a_kds (artículo→departamento) y persistencia de articulo_id; inserta N filas unidad.'; 

