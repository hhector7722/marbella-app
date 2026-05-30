-- Insights: rentabilidad horaria (ventas vs mano de obra, weekday, margen producto).
-- Esquema verificado: tickets_marbella(fecha, hora_cierre text, fecha_real, total_documento),
-- time_logs(user_id, clock_in, clock_out, event_type), map_tpv_receta, ticket_lines_marbella, events(event_date).

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_parse_ticket_hora_cierre_ts(
  p_fecha date,
  p_hora_cierre text,
  p_fecha_real timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_ts timestamptz;
BEGIN
  IF p_hora_cierre IS NOT NULL AND btrim(p_hora_cierre) <> '' THEN
    IF p_hora_cierre ~ 'T' OR p_hora_cierre ~ '^[0-9]{4}-' THEN
      BEGIN
        v_ts := p_hora_cierre::timestamptz;
        RETURN v_ts;
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;

    IF p_fecha IS NOT NULL THEN
      BEGIN
        RETURN (
          p_fecha::timestamp
          + (
            CASE
              WHEN p_hora_cierre ~ 'T' THEN (split_part(split_part(p_hora_cierre, 'T', 2), '.', 1))::time
              WHEN p_hora_cierre ~ ' ' THEN (split_part(p_hora_cierre, ' ', 2))::time
              ELSE (substring(p_hora_cierre from 1 for 8))::time
            END
          )
        ) AT TIME ZONE 'Europe/Madrid';
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;
  END IF;

  RETURN COALESCE(
    p_fecha_real,
    CASE
      WHEN p_fecha IS NOT NULL THEN (p_fecha::timestamp AT TIME ZONE 'Europe/Madrid')
      ELSE NULL
    END
  );
END;
$$;

COMMENT ON FUNCTION public.fn_parse_ticket_hora_cierre_ts(date, text, timestamptz) IS
  'Instante de cierre de ticket en timestamptz; soporta ISO UTC (hora_cierre) y legacy hora plana + fecha negocio Madrid.';

CREATE OR REPLACE FUNCTION public.fn_worker_hourly_rate(
  p_user_id uuid,
  p_on_date date,
  p_event_type text DEFAULT 'regular'
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE
      WHEN COALESCE(p_event_type, 'regular') = 'overtime' THEN
        (SELECT tv.overtime_cost_per_hour FROM public.fn_labor_term_values(p_user_id, p_on_date) tv)
      ELSE
        public.fn_labor_effective_ordinary_rate(p_user_id, p_on_date)
    END,
    10.00
  );
$$;

COMMENT ON FUNCTION public.fn_worker_hourly_rate(uuid, date, text) IS
  'Tarifa horaria efectiva (ordinaria vía fn_labor_effective_ordinary_rate o extra). TODO: profiles no tiene hourly_rate; fallback 10.00 €/h.';

-- -----------------------------------------------------------------------------
-- RPC 1: ventas vs mano de obra por franja horaria (0–23, Europe/Madrid)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_hourly_sales_vs_labor(
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  hour int,
  total_revenue numeric,
  ticket_count int,
  avg_ticket numeric,
  labor_cost numeric,
  margin numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'get_hourly_sales_vs_labor: p_date_from y p_date_to son obligatorios';
  END IF;

  IF p_date_from > p_date_to THEN
    RAISE EXCEPTION 'get_hourly_sales_vs_labor: p_date_from no puede ser posterior a p_date_to';
  END IF;

  RETURN QUERY
  WITH ticket_sales AS (
    SELECT
      EXTRACT(HOUR FROM timezone('Europe/Madrid', x.close_ts))::int AS hr,
      COALESCE(SUM(t.total_documento), 0)::numeric AS total_revenue,
      COUNT(*)::int AS ticket_count
    FROM public.tickets_marbella t
    CROSS JOIN LATERAL (
      SELECT public.fn_parse_ticket_hora_cierre_ts(
        (t.fecha)::date,
        t.hora_cierre,
        t.fecha_real
      ) AS close_ts
    ) x
    WHERE x.close_ts IS NOT NULL
      AND (timezone('Europe/Madrid', x.close_ts))::date >= p_date_from
      AND (timezone('Europe/Madrid', x.close_ts))::date <= p_date_to
    GROUP BY 1
  ),
  range_bounds AS (
    SELECT
      (p_date_from::timestamp AT TIME ZONE 'Europe/Madrid') AS range_start_ts,
      ((p_date_to + 1)::timestamp AT TIME ZONE 'Europe/Madrid') AS range_end_ts
  ),
  days AS (
    SELECT gs.d::date AS biz_date
    FROM generate_series(p_date_from, p_date_to, interval '1 day') AS gs(d)
  ),
  hours AS (
    SELECT gs.h::int AS hr
    FROM generate_series(0, 23) AS gs(h)
  ),
  slot_franjas AS (
    SELECT
      d.biz_date,
      h.hr,
      (d.biz_date::timestamp + (h.hr || ' hours')::interval) AS franja_inicio,
      (d.biz_date::timestamp + ((h.hr + 1) || ' hours')::interval) AS franja_fin
    FROM days d
    CROSS JOIN hours h
  ),
  log_segments AS (
    SELECT
      tl.user_id,
      timezone('Europe/Madrid', tl.clock_in)::timestamp AS clock_in_madrid,
      timezone(
        'Europe/Madrid',
        LEAST(COALESCE(tl.clock_out, now()), rb.range_end_ts)
      )::timestamp AS clock_out_madrid,
      COALESCE(tl.event_type::text, 'regular') AS event_type
    FROM public.time_logs tl
    CROSS JOIN range_bounds rb
    WHERE tl.clock_in IS NOT NULL
      AND tl.clock_in < rb.range_end_ts
      AND COALESCE(tl.clock_out, now()) > rb.range_start_ts
  ),
  labor_by_hour AS (
    SELECT
      sf.hr,
      COALESCE(
        SUM(
          GREATEST(
            0,
            EXTRACT(
              EPOCH FROM (
                LEAST(l.clock_out_madrid, sf.franja_fin)
                - GREATEST(l.clock_in_madrid, sf.franja_inicio)
              )
            ) / 60.0
          )
          * public.fn_worker_hourly_rate(l.user_id, sf.biz_date, l.event_type)
          / 60.0
        ),
        0
      )::numeric AS labor_cost
    FROM slot_franjas sf
    JOIN log_segments l
      ON l.clock_in_madrid < sf.franja_fin
     AND l.clock_out_madrid > sf.franja_inicio
     AND sf.biz_date >= l.clock_in_madrid::date
     AND sf.biz_date <= l.clock_out_madrid::date
    GROUP BY sf.hr
  )
  SELECT
    h.hr AS hour,
    round(COALESCE(ts.total_revenue, 0), 2) AS total_revenue,
    COALESCE(ts.ticket_count, 0)::int AS ticket_count,
    CASE
      WHEN COALESCE(ts.ticket_count, 0) > 0
        THEN round(COALESCE(ts.total_revenue, 0) / ts.ticket_count, 2)
      ELSE 0::numeric
    END AS avg_ticket,
    round(COALESCE(lb.labor_cost, 0), 2) AS labor_cost,
    round(COALESCE(ts.total_revenue, 0) - COALESCE(lb.labor_cost, 0), 2) AS margin
  FROM hours h
  LEFT JOIN ticket_sales ts ON ts.hr = h.hr
  LEFT JOIN labor_by_hour lb ON lb.hr = h.hr
  ORDER BY h.hr;
END;
$$;

COMMENT ON FUNCTION public.get_hourly_sales_vs_labor(date, date) IS
  'Por hora 0–23 (Europe/Madrid): ventas (total_documento por hora_cierre), coste laboral por solapamiento de fichajes y margen.';

-- -----------------------------------------------------------------------------
-- RPC 2: análisis por día de la semana + impacto eventos polideportivo
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_weekday_ticket_analysis(
  p_date_from date,
  p_date_to date
)
RETURNS TABLE (
  weekday int,
  weekday_name text,
  avg_revenue numeric,
  avg_tickets numeric,
  avg_ticket_value numeric,
  days_with_events int,
  avg_revenue_with_event numeric,
  avg_revenue_without_event numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_date_from IS NULL OR p_date_to IS NULL THEN
    RAISE EXCEPTION 'get_weekday_ticket_analysis: p_date_from y p_date_to son obligatorios';
  END IF;

  IF p_date_from > p_date_to THEN
    RAISE EXCEPTION 'get_weekday_ticket_analysis: p_date_from no puede ser posterior a p_date_to';
  END IF;

  RETURN QUERY
  WITH calendar AS (
    SELECT gs.d::date AS biz_date
    FROM generate_series(p_date_from, p_date_to, interval '1 day') AS gs(d)
  ),
  daily AS (
    SELECT
      c.biz_date,
      (EXTRACT(ISODOW FROM c.biz_date)::int - 1) AS wd,
      COALESCE(SUM(t.total_documento), 0)::numeric AS revenue,
      COUNT(t.numero_documento)::numeric AS tickets
    FROM calendar c
    LEFT JOIN public.tickets_marbella t
      ON (t.fecha)::date = c.biz_date
    GROUP BY c.biz_date
  ),
  event_dates AS (
    SELECT DISTINCT e.event_date
    FROM public.events e
    WHERE e.event_date >= p_date_from
      AND e.event_date <= p_date_to
  ),
  daily_flagged AS (
    SELECT
      d.biz_date,
      d.wd,
      d.revenue,
      d.tickets,
      EXISTS (SELECT 1 FROM event_dates ed WHERE ed.event_date = d.biz_date) AS has_event
    FROM daily d
  )
  SELECT
    w.wd AS weekday,
    (
      ARRAY[
        'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
      ]
    )[w.wd + 1] AS weekday_name,
    round(COALESCE(AVG(df.revenue), 0), 2) AS avg_revenue,
    round(COALESCE(AVG(df.tickets), 0), 2) AS avg_tickets,
    CASE
      WHEN COALESCE(AVG(df.tickets), 0) > 0
        THEN round(COALESCE(AVG(df.revenue), 0) / AVG(df.tickets), 2)
      ELSE 0::numeric
    END AS avg_ticket_value,
    COUNT(*) FILTER (WHERE df.has_event)::int AS days_with_events,
    round(COALESCE(AVG(df.revenue) FILTER (WHERE df.has_event), 0), 2) AS avg_revenue_with_event,
    round(COALESCE(AVG(df.revenue) FILTER (WHERE NOT df.has_event), 0), 2) AS avg_revenue_without_event
  FROM generate_series(0, 6) AS w(wd)
  LEFT JOIN daily_flagged df ON df.wd = w.wd
  GROUP BY w.wd
  ORDER BY w.wd;
END;
$$;

COMMENT ON FUNCTION public.get_weekday_ticket_analysis(date, date) IS
  'Promedios por weekday ISO (0=lunes): ventas diarias, tickets y contraste con/sin evento en events.event_date.';

-- -----------------------------------------------------------------------------
-- RPC 3: ranking margen por producto (solo artículos con receta mapeada)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_product_margin_ranking(
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  product_name text,
  total_units_sold numeric,
  avg_sale_price numeric,
  recipe_cost numeric,
  margin_per_unit numeric,
  total_margin_contribution numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int := COALESCE(NULLIF(p_limit, 0), 20);
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_limit := LEAST(GREATEST(v_limit, 1), 500);

  RETURN QUERY
  WITH top_products AS (
    SELECT
      tl.articulo_id,
      SUM(tl.unidades)::numeric AS units_sold,
      CASE
        WHEN SUM(tl.unidades) > 0 THEN round(SUM(tl.importe_total) / SUM(tl.unidades), 2)
        ELSE 0::numeric
      END AS sale_price_avg
    FROM public.ticket_lines_marbella tl
    INNER JOIN public.map_tpv_receta m ON m.articulo_id = tl.articulo_id
    GROUP BY tl.articulo_id
    ORDER BY SUM(tl.unidades) DESC
    LIMIT v_limit
  ),
  recipe_unit_costs AS (
    SELECT
      ri.recipe_id,
      round(
        COALESCE(
          SUM(
            COALESCE(
              public.recipe_qty_to_purchase_unit_for_cost(
                ri.quantity_gross::numeric,
                ri.unit::text,
                i.purchase_unit::text,
                i.supplier_pricing_mode::text,
                i.pack_unit_size_qty::numeric,
                i.pack_unit_size_unit::text
              ),
              0
            ) * i.current_price::numeric
          ),
          0
        ),
        2
      ) AS base_recipe_cost
    FROM public.recipe_ingredients ri
    JOIN public.ingredients i ON i.id = ri.ingredient_id
    WHERE ri.recipe_id IN (
      SELECT m.recipe_id
      FROM public.map_tpv_receta m
      INNER JOIN top_products tp ON tp.articulo_id = m.articulo_id
    )
    GROUP BY ri.recipe_id
  ),
  sales AS (
    SELECT
      tp.articulo_id,
      COALESCE(
        NULLIF(btrim(a.nombre), ''),
        NULLIF(btrim(r.name), ''),
        'Artículo ' || tp.articulo_id::text
      ) AS pname,
      tp.units_sold,
      tp.sale_price_avg,
      round(
        COALESCE(ruc.base_recipe_cost, 0) * COALESCE(m.factor_porcion, 1),
        2
      ) AS unit_recipe_cost
    FROM top_products tp
    INNER JOIN public.map_tpv_receta m ON m.articulo_id = tp.articulo_id
    LEFT JOIN recipe_unit_costs ruc ON ruc.recipe_id = m.recipe_id
    LEFT JOIN public.bdp_articulos a ON a.id = tp.articulo_id
    LEFT JOIN public.recipes r ON r.id = m.recipe_id
  )
  SELECT
    s.pname AS product_name,
    round(s.units_sold, 3) AS total_units_sold,
    s.sale_price_avg AS avg_sale_price,
    s.unit_recipe_cost AS recipe_cost,
    round(s.sale_price_avg - s.unit_recipe_cost, 2) AS margin_per_unit,
    round((s.sale_price_avg - s.unit_recipe_cost) * s.units_sold, 2) AS total_margin_contribution
  FROM sales s
  ORDER BY total_margin_contribution DESC;
END;
$$;

COMMENT ON FUNCTION public.get_product_margin_ranking(int) IS
  'Margen por producto TPV con receta en map_tpv_receta; top N por unidades vendidas, coste vía recipe_qty_to_purchase_unit_for_cost × factor_porcion.';

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.fn_parse_ticket_hora_cierre_ts(date, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_worker_hourly_rate(uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_hourly_sales_vs_labor(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_weekday_ticket_analysis(date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_margin_ranking(int) TO authenticated, service_role;
