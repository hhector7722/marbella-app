-- =============================================================================
-- KDS v2: Events + Projections (schema) (2026-04-20)
--
-- Modelo estable:
-- - kds_events: append-only (Realtime INSERT-only)
-- - kds_projection_orders / kds_projection_lines: estado actual materializado
-- =============================================================================

BEGIN;

-- Schema interno para funciones privilegiadas (evitar SECURITY DEFINER en public)
CREATE SCHEMA IF NOT EXISTS kds_internal;

-- ---------------------------------------------------------------------------
-- Tabla de eventos (fuente de verdad)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kds_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,               -- 'tpv' | 'kitchen' | 'system'
  source_event_id text,               -- idempotencia por origen (opcional pero recomendado)
  id_ticket text NOT NULL,
  mesa text,
  event_type text NOT NULL,           -- 'item_added' | 'item_done' | 'item_undone' | 'item_cancel_notice' | ...
  articulo_id integer,
  producto_nombre text,
  notas text,
  qty integer NOT NULL DEFAULT 1 CHECK (qty > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS kds_events_source_event_id_uniq
  ON public.kds_events (source, source_event_id)
  WHERE source_event_id IS NOT NULL AND btrim(source_event_id) <> '';

CREATE INDEX IF NOT EXISTS kds_events_ticket_created_idx
  ON public.kds_events (id_ticket, created_at);

ALTER TABLE public.kds_events ENABLE ROW LEVEL SECURITY;

-- Lectura: permitir a anon+authenticated (alineado con el KDS actual; endurecer luego si se desea)
DROP POLICY IF EXISTS kds_events_read_all ON public.kds_events;
CREATE POLICY kds_events_read_all ON public.kds_events
  FOR SELECT TO anon, authenticated
  USING (true);

-- Inserción cocina: solo source='kitchen'. (TPV usa service_role y no pasa por RLS)
DROP POLICY IF EXISTS kds_events_insert_kitchen ON public.kds_events;
CREATE POLICY kds_events_insert_kitchen ON public.kds_events
  FOR INSERT TO authenticated
  WITH CHECK (source = 'kitchen');

-- ---------------------------------------------------------------------------
-- Proyección: órdenes por ticket
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kds_projection_orders (
  id_ticket text PRIMARY KEY,
  mesa text,
  estado text NOT NULL DEFAULT 'activa', -- 'activa' | 'completada'
  opened_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  notas_comanda text
);

CREATE INDEX IF NOT EXISTS kds_projection_orders_estado_last_event_idx
  ON public.kds_projection_orders (estado, last_event_at DESC);

ALTER TABLE public.kds_projection_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kds_projection_orders_read_all ON public.kds_projection_orders;
CREATE POLICY kds_projection_orders_read_all ON public.kds_projection_orders
  FOR SELECT TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Proyección: líneas por ticket + artículo + notas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kds_projection_lines (
  id_ticket text NOT NULL,
  articulo_id integer NOT NULL,
  notas_norm text NOT NULL DEFAULT '',
  producto_nombre text,
  qty_added integer NOT NULL DEFAULT 0 CHECK (qty_added >= 0),
  qty_done integer NOT NULL DEFAULT 0 CHECK (qty_done >= 0),
  qty_cancel_notice integer NOT NULL DEFAULT 0 CHECK (qty_cancel_notice >= 0),
  last_event_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kds_projection_lines_pkey PRIMARY KEY (id_ticket, articulo_id, notas_norm)
);

CREATE INDEX IF NOT EXISTS kds_projection_lines_ticket_pending_idx
  ON public.kds_projection_lines (id_ticket, (GREATEST(qty_added - qty_done, 0)) DESC);

ALTER TABLE public.kds_projection_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kds_projection_lines_read_all ON public.kds_projection_lines;
CREATE POLICY kds_projection_lines_read_all ON public.kds_projection_lines
  FOR SELECT TO anon, authenticated
  USING (true);

-- Realtime: solo eventos (INSERT). Proyecciones se leen por fetch normal.
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.kds_events;

COMMIT;

