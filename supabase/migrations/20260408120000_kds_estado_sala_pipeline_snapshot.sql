-- =============================================================================
-- Snapshot: pipeline Gemelo Digital — estado_sala → KDS (export 2026-04-08)
-- Origen: proyecto Supabase Bar La Marbella (execute_sql / pg_catalog).
-- Objetivo: versionar esquema + funciones + trigger para entornos nuevos y diff en Git.
-- Idempotencia: CREATE IF NOT EXISTS / OR REPLACE; seguro re-ejecutar en PRO ya desplegada.
-- =============================================================================

-- Enums -----------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.kds_order_status AS ENUM ('activa', 'completada');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.kds_item_status AS ENUM ('pendiente', 'terminado', 'cancelado');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Tablas ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estado_sala (
  id integer NOT NULL,
  ultima_actualizacion timestamptz,
  mesas_activas integer,
  radiografia_completa jsonb,
  total_mesas integer,
  id_ticket text,
  CONSTRAINT estado_sala_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kds_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  origen_referencia text,
  mesa text NOT NULL,
  notas_comanda text,
  origen text DEFAULT 'Comandero'::text,
  estado public.kds_order_status DEFAULT 'activa'::public.kds_order_status,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  id_ticket text,
  status text DEFAULT 'pending'::text,
  CONSTRAINT kds_orders_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.kds_order_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  kds_order_id uuid,
  producto_nombre text,
  notas text,
  departamento text,
  estado public.kds_item_status DEFAULT 'pendiente'::public.kds_item_status,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  unidades numeric DEFAULT 1,
  precio numeric DEFAULT 0,
  articulo_id integer,
  nombre text,
  order_id uuid,
  status text DEFAULT 'pending'::text,
  cantidad numeric DEFAULT 1,
  mesa text,
  numero_documento text,
  CONSTRAINT kds_order_lines_pkey PRIMARY KEY (id)
);

-- Columnas añadidas en iteraciones posteriores (no rompen CREATE TABLE IF NOT EXISTS)
ALTER TABLE public.estado_sala ADD COLUMN IF NOT EXISTS total_mesas integer;
ALTER TABLE public.estado_sala ADD COLUMN IF NOT EXISTS id_ticket text;

ALTER TABLE public.kds_orders ADD COLUMN IF NOT EXISTS id_ticket text;
ALTER TABLE public.kds_orders ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;

ALTER TABLE public.kds_order_lines ADD COLUMN IF NOT EXISTS unidades numeric DEFAULT 1;
ALTER TABLE public.kds_order_lines ADD COLUMN IF NOT EXISTS precio numeric DEFAULT 0;
ALTER TABLE public.kds_order_lines ADD COLUMN IF NOT EXISTS articulo_id integer;
ALTER TABLE public.kds_order_lines ADD COLUMN IF NOT EXISTS nombre text;
ALTER TABLE public.kds_order_lines ADD COLUMN IF NOT EXISTS order_id uuid;
ALTER TABLE public.kds_order_lines ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending'::text;
ALTER TABLE public.kds_order_lines ADD COLUMN IF NOT EXISTS cantidad numeric DEFAULT 1;
ALTER TABLE public.kds_order_lines ADD COLUMN IF NOT EXISTS mesa text;
ALTER TABLE public.kds_order_lines ADD COLUMN IF NOT EXISTS numero_documento text;

-- FK (idempotente)
DO $$
BEGIN
  ALTER TABLE ONLY public.kds_order_lines
    ADD CONSTRAINT kds_order_lines_kds_order_id_fkey
    FOREIGN KEY (kds_order_id) REFERENCES public.kds_orders(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Índices ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kds_lines_composed
  ON public.kds_order_lines USING btree (kds_order_id, producto_nombre, notas);

CREATE INDEX IF NOT EXISTS idx_kds_orders_origen_referencia
  ON public.kds_orders USING btree (origen_referencia);

-- Funciones (cálculo de delta por líneas insertadas) -------------------------
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
  vcnt int;
  vtqt int;
  vdlt int;
  vi int;
BEGIN
  IF aprods IS NULL OR jsonb_array_length(aprods) = 0 THEN
    RETURN;
  END IF;

  SELECT id INTO vid
  FROM kds_orders
  WHERE id_ticket = aid
    AND created_at >= ((now() AT TIME ZONE 'Europe/Madrid')::date AT TIME ZONE 'Europe/Madrid')
  LIMIT 1;

  IF vid IS NULL THEN
    INSERT INTO kds_orders (id_ticket, mesa, notas_comanda, estado, origen)
    VALUES (aid, amesa, anotas, 'activa', 'TPV')
    RETURNING id INTO vid;
  END IF;

  FOR vrec IN SELECT * FROM jsonb_array_elements(aprods)
  LOOP
    vtqt := (vrec->>'unidades')::int;
    SELECT count(*) INTO vcnt
    FROM kds_order_lines
    WHERE kds_order_id = vid
      AND producto_nombre = vrec->>'nombre';

    vdlt := vtqt - vcnt;

    IF vdlt > 0 THEN
      FOR vi IN 1..vdlt
      LOOP
        INSERT INTO kds_order_lines (
          kds_order_id,
          producto_nombre,
          unidades,
          cantidad,
          estado,
          notas,
          mesa,
          numero_documento
        )
        VALUES (
          vid,
          vrec->>'nombre',
          1,
          1,
          'pendiente',
          coalesce(vrec->>'notas', ''),
          amesa,
          adoc
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_calculate_and_insert_delta(
  p_id_ticket text,
  p_mesa text,
  p_notas_comanda text,
  p_productos jsonb,
  p_numero_documento text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.fncalcdelta(p_id_ticket, p_mesa, p_notas_comanda, p_productos, p_numero_documento);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trg_process_kds_from_sala()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  i jsonb;
  t timestamptz;
BEGIN
  NEW.ultima_actualizacion := now();
  IF NEW.radiografia_completa IS NULL THEN
    RETURN NEW;
  END IF;

  FOR i IN SELECT * FROM jsonb_array_elements(NEW.radiografia_completa)
  LOOP
    t := (i->>'timestamp_tpv')::timestamptz;
    IF t IS NULL OR t > (now() - interval '12 hours') THEN
      PERFORM public.fn_calculate_and_insert_delta(
        i->>'id_ticket',
        i->>'mesa',
        i->>'notas_comanda',
        i->'productos',
        i->>'numero_documento'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Trigger ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_update_kds_on_sala_change ON public.estado_sala;
CREATE TRIGGER trg_update_kds_on_sala_change
  BEFORE UPDATE ON public.estado_sala
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_trg_process_kds_from_sala();

-- Fila SSOT Radar (id = 1) ----------------------------------------------------
INSERT INTO public.estado_sala (id, mesas_activas, radiografia_completa)
VALUES (1, 0, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Privilegios (anon + authenticated; RLS desactivado en PRO actual) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estado_sala TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kds_orders TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kds_order_lines TO anon, authenticated;
GRANT USAGE ON TYPE public.kds_order_status TO anon, authenticated;
GRANT USAGE ON TYPE public.kds_item_status TO anon, authenticated;

-- Realtime (PG15+: IF NOT EXISTS evita error si la tabla ya está en la publicación)
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.estado_sala;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.kds_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.kds_order_lines;

COMMENT ON FUNCTION public.fncalcdelta(text, text, text, jsonb, text) IS
  'Delta KDS: unidades TPV − COUNT líneas existentes por producto; inserta N filas de 1 unidad.';

COMMENT ON FUNCTION public.fn_trg_process_kds_from_sala() IS
  'Dispara al UPDATE de estado_sala: recorre radiografia_completa y llama fn_calculate_and_insert_delta por mesa/ticket.';
