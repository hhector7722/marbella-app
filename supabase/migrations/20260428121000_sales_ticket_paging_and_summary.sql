-- Ventas: evitar tope PostgREST (db_max_rows) calculando KPIs por SQL
-- y sirviendo listado paginado (200) para UI.

CREATE OR REPLACE FUNCTION public.get_ticket_sales_summary(
  p_start_date date,
  p_end_date date,
  p_start_time text DEFAULT NULL,
  p_end_time text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      t.total_documento,
      (
        CASE
          WHEN t.hora_cierre IS NULL THEN NULL::time
          WHEN t.hora_cierre ~ 'T' THEN (split_part(split_part(t.hora_cierre, 'T', 2), '.', 1))::time
          WHEN t.hora_cierre ~ ' ' THEN (split_part(t.hora_cierre, ' ', 2))::time
          ELSE (substring(t.hora_cierre from 1 for 8))::time
        END
      ) AS close_time
    FROM public.tickets_marbella t
    WHERE (t.fecha)::date >= p_start_date
      AND (t.fecha)::date <= p_end_date
  ),
  filtered AS (
    SELECT
      b.total_documento
    FROM base b
    WHERE
      -- Si no hay filtro horario, no filtrar.
      (p_start_time IS NULL OR p_end_time IS NULL)
      OR (
        b.close_time IS NOT NULL
        AND (
          (extract(hour from b.close_time)::int * 60 + extract(minute from b.close_time)::int)
          BETWEEN
            (extract(hour from (substring(p_start_time from 1 for 5))::time)::int * 60 + extract(minute from (substring(p_start_time from 1 for 5))::time)::int)
            AND
            (extract(hour from (substring(p_end_time from 1 for 5))::time)::int * 60 + extract(minute from (substring(p_end_time from 1 for 5))::time)::int)
        )
      )
  )
  SELECT jsonb_build_object(
    'total_ventas', COALESCE(round(sum(f.total_documento)::numeric, 2), 0),
    'recuento_tickets', count(*)::int,
    'ticket_medio', CASE WHEN count(*) > 0 THEN COALESCE(round((sum(f.total_documento) / count(*))::numeric, 2), 0) ELSE 0 END
  )
  FROM filtered f;
$$;

CREATE OR REPLACE FUNCTION public.get_tickets_marbella_page(
  p_start_date date,
  p_end_date date,
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0,
  p_start_time text DEFAULT NULL,
  p_end_time text DEFAULT NULL
)
RETURNS TABLE (
  numero_documento text,
  fecha text,
  hora_cierre text,
  total_documento numeric,
  mesa int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      t.numero_documento,
      t.fecha,
      t.hora_cierre,
      t.total_documento,
      t.mesa,
      (
        CASE
          WHEN t.hora_cierre IS NULL THEN NULL::time
          WHEN t.hora_cierre ~ 'T' THEN (split_part(split_part(t.hora_cierre, 'T', 2), '.', 1))::time
          WHEN t.hora_cierre ~ ' ' THEN (split_part(t.hora_cierre, ' ', 2))::time
          ELSE (substring(t.hora_cierre from 1 for 8))::time
        END
      ) AS close_time
    FROM public.tickets_marbella t
    WHERE (t.fecha)::date >= p_start_date
      AND (t.fecha)::date <= p_end_date
  ),
  filtered AS (
    SELECT b.*
    FROM base b
    WHERE
      (p_start_time IS NULL OR p_end_time IS NULL)
      OR (
        b.close_time IS NOT NULL
        AND (
          (extract(hour from b.close_time)::int * 60 + extract(minute from b.close_time)::int)
          BETWEEN
            (extract(hour from (substring(p_start_time from 1 for 5))::time)::int * 60 + extract(minute from (substring(p_start_time from 1 for 5))::time)::int)
            AND
            (extract(hour from (substring(p_end_time from 1 for 5))::time)::int * 60 + extract(minute from (substring(p_end_time from 1 for 5))::time)::int)
        )
      )
  )
  SELECT
    f.numero_documento,
    f.fecha,
    f.hora_cierre,
    f.total_documento,
    f.mesa
  FROM filtered f
  ORDER BY (f.fecha)::date DESC, f.close_time DESC NULLS LAST, f.numero_documento DESC
  LIMIT greatest(1, least(coalesce(p_limit, 200), 500))  -- guardrail
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_ticket_sales_summary(date, date, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tickets_marbella_page(date, date, int, int, text, text) TO anon, authenticated, service_role;

