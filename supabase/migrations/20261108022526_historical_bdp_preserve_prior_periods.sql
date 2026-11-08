-- Preserve all existing years when combining historical 2026 BDP totals.
-- Exclude only the 36 incomplete ticket headers dated 2026-01-01..2026-02-13
-- from ticket-backed reports; replace their aggregates with the complete PDF
-- instead. Individual ticket data remains unchanged in storage.

DO $patch$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.get_ventas_crossfilter_detail_raw(date,date,integer,integer,text,integer,integer)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition, 'WHERE t.fecha BETWEEN $1 AND $2') = 0 THEN
    RAISE EXCEPTION 'Missing crossfilter original date anchor; no changes applied';
  END IF;
  v_definition := replace(
    v_definition,
    'WHERE t.fecha BETWEEN $1 AND $2',
    'WHERE t.fecha BETWEEN $1 AND $2 AND t.fecha NOT BETWEEN DATE ''2026-01-01'' AND DATE ''2026-02-13'''
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.get_full_period_ticket_sales_detail_raw(date,date)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition, 'WHERE t.fecha >= p_start_date') = 0
    OR strpos(v_definition, 'WHERE tl.fecha_negocio >= p_start_date') = 0
  THEN RAISE EXCEPTION 'Missing full-period original date anchors; no changes applied'; END IF;
  v_definition := replace(
    v_definition,
    'WHERE t.fecha >= p_start_date',
    'WHERE t.fecha NOT BETWEEN DATE ''2026-01-01'' AND DATE ''2026-02-13'' AND t.fecha >= p_start_date'
  );
  v_definition := replace(
    v_definition,
    'WHERE tl.fecha_negocio >= p_start_date',
    'WHERE tl.fecha_negocio NOT BETWEEN DATE ''2026-01-01'' AND DATE ''2026-02-13'' AND tl.fecha_negocio >= p_start_date'
  );
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.get_ventas_crossfilter(date,date,integer,integer,text,integer,integer)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition, 'GREATEST(p_start_date') = 0 THEN
    RAISE EXCEPTION 'Missing crossfilter wrapper anchor; no changes applied';
  END IF;
  v_definition := replace(
    replace(v_definition,
      'GREATEST(p_start_date, DATE ''2026-02-14'')', 'p_start_date'),
      'GREATEST(p_start_date,DATE ''2026-02-14'')', 'p_start_date'
  );
  IF strpos(v_definition, 'GREATEST(p_start_date') <> 0 THEN
    RAISE EXCEPTION 'Crossfilter wrapper date not replaced'; END IF;
  EXECUTE v_definition;

  SELECT pg_get_functiondef('public.get_full_period_ticket_sales_detail(date,date)'::regprocedure)
    INTO v_definition;
  IF strpos(v_definition, 'GREATEST(p_start_date') = 0 THEN
    RAISE EXCEPTION 'Missing full-period wrapper anchor; no changes applied';
  END IF;
  v_definition := replace(
    replace(v_definition,
      'GREATEST(p_start_date,DATE ''2026-02-14'')', 'p_start_date'),
      'GREATEST(p_start_date, DATE ''2026-02-14'')', 'p_start_date'
  );
  IF strpos(v_definition, 'GREATEST(p_start_date') <> 0 THEN
    RAISE EXCEPTION 'Full-period wrapper date not replaced'; END IF;
  EXECUTE v_definition;
END;
$patch$;

-- All-year and pre-2026 queries retain old ticket-detail rows; only dates
-- covered by the PDF get the summarized replacement without duplication.
