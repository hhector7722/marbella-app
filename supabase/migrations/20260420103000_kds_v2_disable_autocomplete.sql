-- =============================================================================
-- KDS v2: desactivar auto-completar en BD (2026-04-20)
--
-- Decisión operativa:
-- - El ticket SOLO se marca completado con evento explícito `order_completed` (cocina).
-- - Evita rebotes completada/activa cuando entran tandas nuevas del TPV.
-- =============================================================================

BEGIN;

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

  -- Eventos de cierre / reapertura (solo explícitos)
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
END;
$$;

REVOKE ALL ON FUNCTION kds_internal.apply_kds_event(public.kds_events) FROM PUBLIC;

COMMIT;

