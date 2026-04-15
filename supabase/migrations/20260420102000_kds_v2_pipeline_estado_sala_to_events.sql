-- =============================================================================
-- KDS v2: estado_sala (Radar) -> kds_events (TPV) (2026-04-20)
--
-- El extractor envía snapshot de unidades actuales por ticket. Convertimos snapshot -> deltas
-- comparando contra proyección (qty_added - qty_cancel_notice), para emitir:
-- - item_added (delta positivo)
-- - item_cancel_notice (delta negativo) como aviso rojo, sin borrar trabajo.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_emit_kds_events_from_sala(
  p_id_ticket text,
  p_mesa text,
  p_notas_comanda text,
  p_productos jsonb,
  p_timestamp_tpv text DEFAULT NULL,
  p_numero_documento text DEFAULT NULL,
  p_nombre_cliente text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  vrec jsonb;
  v_target_qty int;
  v_articulo_id int;
  v_nombre text;
  v_notas text;
  v_notas_n text;

  v_envia_art boolean;
  v_envia_dept boolean;
  v_effective_envia boolean;
  v_departamento_id integer;

  r record;
  v_existing_effective int;
  v_delta int;
  v_source_event_id text;
  v_ts text;
BEGIN
  IF p_id_ticket IS NULL OR btrim(p_id_ticket) = '' THEN
    RETURN;
  END IF;

  IF p_productos IS NULL THEN
    p_productos := '[]'::jsonb;
  END IF;

  v_ts := NULLIF(btrim(COALESCE(p_timestamp_tpv, '')), '');

  DROP TABLE IF EXISTS tmp_kds_v2_targets;
  CREATE TEMP TABLE tmp_kds_v2_targets (
    articulo_id int NOT NULL,
    notas_n text NOT NULL,
    qty int NOT NULL,
    producto_nombre text,
    PRIMARY KEY (articulo_id, notas_n)
  ) ON COMMIT DROP;

  -- 1) Construir mapa objetivo desde snapshot TPV (solo artículos que envían a KDS)
  FOR vrec IN SELECT * FROM jsonb_array_elements(p_productos)
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

    INSERT INTO tmp_kds_v2_targets (articulo_id, notas_n, qty, producto_nombre)
    VALUES (v_articulo_id, v_notas_n, v_target_qty, v_nombre)
    ON CONFLICT (articulo_id, notas_n) DO UPDATE
      SET qty = tmp_kds_v2_targets.qty + EXCLUDED.qty,
          producto_nombre = COALESCE(EXCLUDED.producto_nombre, tmp_kds_v2_targets.producto_nombre);
  END LOOP;

  -- 2) Unir objetivo ∪ existente (proyección), calculando delta sobre \"effective_added\"
  FOR r IN
    SELECT
      COALESCE(t.articulo_id, e.articulo_id) AS articulo_id,
      COALESCE(t.notas_n, e.notas_norm) AS notas_n,
      COALESCE(t.qty, 0) AS target_qty,
      COALESCE(t.producto_nombre, e.producto_nombre) AS producto_nombre,
      COALESCE(e.qty_added, 0) AS qty_added,
      COALESCE(e.qty_cancel_notice, 0) AS qty_cancel_notice
    FROM tmp_kds_v2_targets t
    FULL OUTER JOIN (
      SELECT
        l.articulo_id,
        l.notas_norm,
        l.producto_nombre,
        l.qty_added,
        l.qty_cancel_notice
      FROM public.kds_projection_lines l
      WHERE l.id_ticket = btrim(p_id_ticket)
    ) e
      ON COALESCE(t.articulo_id, -2147483648) = COALESCE(e.articulo_id, -2147483648)
     AND COALESCE(t.notas_n, '') = COALESCE(e.notas_norm, '')
    WHERE COALESCE(t.articulo_id, e.articulo_id) IS NOT NULL
  LOOP
    v_existing_effective := GREATEST(0, (r.qty_added - r.qty_cancel_notice));
    v_delta := COALESCE(r.target_qty, 0) - v_existing_effective;

    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    IF v_ts IS NOT NULL THEN
      v_source_event_id := concat_ws('|', 'tpv', btrim(p_id_ticket), v_ts, r.articulo_id::text, COALESCE(r.notas_n, ''), CASE WHEN v_delta > 0 THEN 'item_added' ELSE 'item_cancel_notice' END, abs(v_delta)::text);
    ELSE
      v_source_event_id := NULL;
    END IF;

    IF v_delta > 0 THEN
      INSERT INTO public.kds_events (
        source, source_event_id, id_ticket, mesa, event_type,
        articulo_id, producto_nombre, notas, qty,
        payload
      )
      VALUES (
        'tpv',
        v_source_event_id,
        btrim(p_id_ticket),
        NULLIF(btrim(p_mesa), ''),
        'item_added',
        r.articulo_id,
        NULLIF(btrim(COALESCE(r.producto_nombre, '')), ''),
        NULLIF(COALESCE(r.notas_n, ''), ''),
        v_delta,
        jsonb_build_object(
          'notas_comanda', NULLIF(btrim(COALESCE(p_notas_comanda, '')), ''),
          'numero_documento', NULLIF(btrim(COALESCE(p_numero_documento, '')), ''),
          'nombre_cliente', NULLIF(btrim(COALESCE(p_nombre_cliente, '')), '')
        )
      )
      ON CONFLICT (source, source_event_id) DO NOTHING;
    ELSE
      INSERT INTO public.kds_events (
        source, source_event_id, id_ticket, mesa, event_type,
        articulo_id, producto_nombre, notas, qty,
        payload
      )
      VALUES (
        'tpv',
        v_source_event_id,
        btrim(p_id_ticket),
        NULLIF(btrim(p_mesa), ''),
        'item_cancel_notice',
        r.articulo_id,
        NULLIF(btrim(COALESCE(r.producto_nombre, '')), ''),
        NULLIF(COALESCE(r.notas_n, ''), ''),
        abs(v_delta),
        jsonb_build_object(
          'notas_comanda', NULLIF(btrim(COALESCE(p_notas_comanda, '')), ''),
          'numero_documento', NULLIF(btrim(COALESCE(p_numero_documento, '')), ''),
          'nombre_cliente', NULLIF(btrim(COALESCE(p_nombre_cliente, '')), '')
        )
      )
      ON CONFLICT (source, source_event_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Trigger de estado_sala: aplica deltas a KDS v2 desde radiografia_completa
CREATE OR REPLACE FUNCTION public.fn_trg_process_kds_from_sala()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  i jsonb;
BEGIN
  NEW.ultima_actualizacion := now();
  IF NEW.radiografia_completa IS NULL THEN
    NEW.radiografia_completa := '[]'::jsonb;
  END IF;

  FOR i IN SELECT * FROM jsonb_array_elements(NEW.radiografia_completa)
  LOOP
    PERFORM public.fn_emit_kds_events_from_sala(
      i->>'id_ticket',
      i->>'mesa',
      i->>'notas_comanda',
      i->'productos',
      i->>'timestamp_tpv',
      i->>'numero_documento',
      i->>'nombre_cliente'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_kds_on_sala_change ON public.estado_sala;
CREATE TRIGGER trg_update_kds_on_sala_change
BEFORE UPDATE ON public.estado_sala
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_process_kds_from_sala();

COMMIT;

