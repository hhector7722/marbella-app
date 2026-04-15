-- =============================================================================
-- KDS v2: ingest RPC (kitchen) + proyección (2026-04-20)
--
-- - kds_internal.apply_kds_event: aplica evento a proyecciones (SECURITY DEFINER, row_security off)
-- - trigger AFTER INSERT en kds_events para eventos TPV/system (service role)
-- - public.kds_ingest_event: RPC para cocina (valida source='kitchen', dedupe source_event_id)
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS kds_internal;

-- Normalización simple de notas (evita NULL vs '' en PK)
CREATE OR REPLACE FUNCTION kds_internal.normalize_notes(p_notes text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(btrim(p_notes), '');
$$;

-- Aplica un evento a las proyecciones (bypass RLS dentro)
CREATE OR REPLACE FUNCTION kds_internal.apply_kds_event(p_event public.kds_events)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kds_internal
SET row_security = off
AS $$
DECLARE
  v_notes_norm text;
BEGIN
  v_notes_norm := kds_internal.normalize_notes(p_event.notas);

  -- Upsert de orden (por ticket). opened_at: primera vez.
  INSERT INTO public.kds_projection_orders (id_ticket, mesa, estado, opened_at, last_event_at, notas_comanda)
  VALUES (
    p_event.id_ticket,
    p_event.mesa,
    'activa',
    p_event.created_at,
    p_event.created_at,
    NULLIF((p_event.payload->>'notas_comanda')::text, '')
  )
  ON CONFLICT (id_ticket) DO UPDATE
    SET mesa = COALESCE(EXCLUDED.mesa, public.kds_projection_orders.mesa),
        last_event_at = GREATEST(public.kds_projection_orders.last_event_at, EXCLUDED.last_event_at),
        notas_comanda = COALESCE(EXCLUDED.notas_comanda, public.kds_projection_orders.notas_comanda);

  -- Eventos de cierre / reapertura
  IF p_event.event_type = 'order_completed' THEN
    UPDATE public.kds_projection_orders
    SET estado = 'completada',
        completed_at = COALESCE(completed_at, p_event.created_at),
        last_event_at = GREATEST(last_event_at, p_event.created_at)
    WHERE id_ticket = p_event.id_ticket;
    RETURN;
  ELSIF p_event.event_type = 'order_reopened' THEN
    UPDATE public.kds_projection_orders
    SET estado = 'activa',
        completed_at = NULL,
        last_event_at = GREATEST(last_event_at, p_event.created_at)
    WHERE id_ticket = p_event.id_ticket;
    -- seguimos: puede convivir con line events
  END IF;

  -- Eventos por línea requieren articulo_id
  IF p_event.articulo_id IS NULL THEN
    RETURN;
  END IF;

  -- Garantizar fila de proyección de línea
  INSERT INTO public.kds_projection_lines (
    id_ticket, articulo_id, notas_norm, producto_nombre,
    qty_added, qty_done, qty_cancel_notice, last_event_at
  )
  VALUES (
    p_event.id_ticket, p_event.articulo_id, v_notes_norm, p_event.producto_nombre,
    0, 0, 0, p_event.created_at
  )
  ON CONFLICT (id_ticket, articulo_id, notas_norm) DO UPDATE
    SET producto_nombre = COALESCE(EXCLUDED.producto_nombre, public.kds_projection_lines.producto_nombre),
        last_event_at = GREATEST(public.kds_projection_lines.last_event_at, EXCLUDED.last_event_at);

  -- Aplicar contadores
  IF p_event.event_type = 'item_added' THEN
    UPDATE public.kds_projection_lines
    SET qty_added = qty_added + p_event.qty,
        last_event_at = GREATEST(last_event_at, p_event.created_at)
    WHERE id_ticket = p_event.id_ticket
      AND articulo_id = p_event.articulo_id
      AND notas_norm = v_notes_norm;

  ELSIF p_event.event_type = 'item_done' THEN
    UPDATE public.kds_projection_lines
    SET qty_done = LEAST(qty_added, qty_done + p_event.qty),
        last_event_at = GREATEST(last_event_at, p_event.created_at)
    WHERE id_ticket = p_event.id_ticket
      AND articulo_id = p_event.articulo_id
      AND notas_norm = v_notes_norm;

  ELSIF p_event.event_type = 'item_undone' THEN
    UPDATE public.kds_projection_lines
    SET qty_done = GREATEST(0, qty_done - p_event.qty),
        last_event_at = GREATEST(last_event_at, p_event.created_at)
    WHERE id_ticket = p_event.id_ticket
      AND articulo_id = p_event.articulo_id
      AND notas_norm = v_notes_norm;

  ELSIF p_event.event_type = 'item_cancel_notice' THEN
    UPDATE public.kds_projection_lines
    SET qty_cancel_notice = qty_cancel_notice + p_event.qty,
        last_event_at = GREATEST(last_event_at, p_event.created_at)
    WHERE id_ticket = p_event.id_ticket
      AND articulo_id = p_event.articulo_id
      AND notas_norm = v_notes_norm;
  END IF;

  -- Auto-completar si no queda pendiente en ninguna línea (solo si está activa)
  IF EXISTS (
    SELECT 1
    FROM public.kds_projection_orders o
    WHERE o.id_ticket = p_event.id_ticket AND o.estado = 'activa'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.kds_projection_lines l
    WHERE l.id_ticket = p_event.id_ticket
      AND GREATEST(l.qty_added - l.qty_done, 0) > 0
  ) THEN
    UPDATE public.kds_projection_orders
    SET estado = 'completada',
        completed_at = COALESCE(completed_at, now()),
        last_event_at = GREATEST(last_event_at, now())
    WHERE id_ticket = p_event.id_ticket
      AND estado = 'activa';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION kds_internal.apply_kds_event(public.kds_events) FROM PUBLIC;
REVOKE ALL ON FUNCTION kds_internal.normalize_notes(text) FROM PUBLIC;

-- Wrapper trigger function (Postgres exige firma sin args)
CREATE OR REPLACE FUNCTION kds_internal.trg_apply_kds_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kds_internal
SET row_security = off
AS $$
BEGIN
  PERFORM kds_internal.apply_kds_event(NEW);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION kds_internal.trg_apply_kds_event() FROM PUBLIC;

-- Trigger: cualquier INSERT en kds_events aplica proyección
DROP TRIGGER IF EXISTS trg_kds_events_apply_projection ON public.kds_events;
CREATE TRIGGER trg_kds_events_apply_projection
AFTER INSERT ON public.kds_events
FOR EACH ROW
EXECUTE FUNCTION kds_internal.trg_apply_kds_event();

-- RPC: cocina inserta evento con validación y dedupe
CREATE OR REPLACE FUNCTION public.kds_ingest_event(
  p_source_event_id text,
  p_id_ticket text,
  p_mesa text,
  p_event_type text,
  p_articulo_id integer,
  p_producto_nombre text,
  p_notas text DEFAULT NULL,
  p_qty integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, kds_internal
SET row_security = off
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Solo cocina por RPC (TPV inserta con service role directamente)
  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'event_type requerido';
  END IF;
  IF p_id_ticket IS NULL OR btrim(p_id_ticket) = '' THEN
    RAISE EXCEPTION 'id_ticket requerido';
  END IF;
  IF COALESCE(p_qty, 0) <= 0 THEN
    RAISE EXCEPTION 'qty debe ser > 0';
  END IF;

  INSERT INTO public.kds_events (
    source, source_event_id, id_ticket, mesa, event_type,
    articulo_id, producto_nombre, notas, qty
  )
  VALUES (
    'kitchen',
    NULLIF(btrim(p_source_event_id), ''),
    btrim(p_id_ticket),
    NULLIF(btrim(p_mesa), ''),
    btrim(p_event_type),
    p_articulo_id,
    NULLIF(btrim(p_producto_nombre), ''),
    p_notas,
    p_qty
  )
  ON CONFLICT (source, source_event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL AND p_source_event_id IS NOT NULL AND btrim(p_source_event_id) <> '' THEN
    SELECT id INTO v_id
    FROM public.kds_events
    WHERE source = 'kitchen' AND source_event_id = btrim(p_source_event_id)
    LIMIT 1;
  END IF;

  RETURN v_id;
END;
$$;

-- Exponer RPC a authenticated (cocina). (Ajustar a RBAC si se desea)
GRANT EXECUTE ON FUNCTION public.kds_ingest_event(text, text, text, text, integer, text, text, integer) TO authenticated;

COMMIT;

