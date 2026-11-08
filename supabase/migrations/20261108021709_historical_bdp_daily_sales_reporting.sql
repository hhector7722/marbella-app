-- El PDF financiero BDP anterior a 14/02/2026 aporta importes diarios y número de
-- documentos, pero NO contiene los tickets individuales ni el desglose por hora
-- o por producto. Los 36 tickets antiguos ya importados son solo parciales:
-- nunca se suman encima del resumen financiero del PDF.

CREATE OR REPLACE FUNCTION public.get_daily_sales_stats(target_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $daily$
DECLARE
  v_sales numeric;
  v_tickets bigint;
BEGIN
  SELECT c.tpv_sales, c.tickets_count
    INTO v_sales, v_tickets
  FROM public.cash_closings c
  WHERE c.closing_date=target_date AND c.tpv_terminal='HIST_BDP_PDF'
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'total_ventas',v_sales,
      'recuento_tickets',v_tickets,
      'ticket_medio', CASE WHEN v_tickets>0 THEN v_sales/v_tickets ELSE 0 END,
      'historicalSummaryOnly',true
    );
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'total_ventas',COALESCE(SUM(t.total_documento),0),
      'recuento_tickets',COUNT(*),
      'ticket_medio',CASE WHEN COUNT(*)>0
        THEN COALESCE(SUM(t.total_documento)/COUNT(*),0) ELSE 0 END
    )
    FROM public.tickets_marbella t WHERE t.fecha=target_date
  );
END;
$daily$;

-- Se conserva intacto el cálculo original de tickets (y sus filtros), con un
-- nuevo nombre interno. Los wrappers públicos añaden SOLO el total financiero
-- histórico en consultas sin filtros que requieren detalle inexistente.
DO $rename$
BEGIN
 IF to_regprocedure('public.get_ventas_crossfilter_detail_raw(date,date,integer,integer,text,integer,integer)') IS NULL THEN
  ALTER FUNCTION public.get_ventas_crossfilter(date,date,integer,integer,text,integer,integer)
    RENAME TO get_ventas_crossfilter_detail_raw;
 END IF;
 IF to_regprocedure('public.get_full_period_ticket_sales_detail_raw(date,date)') IS NULL THEN
  ALTER FUNCTION public.get_full_period_ticket_sales_detail(date,date)
    RENAME TO get_full_period_ticket_sales_detail_raw;
 END IF;
END;
$rename$;

CREATE OR REPLACE FUNCTION public.get_ventas_crossfilter(
 p_start_date date, p_end_date date,
 p_hour integer DEFAULT NULL, p_product_id integer DEFAULT NULL,
 p_payment text DEFAULT NULL, p_offset integer DEFAULT 0, p_limit integer DEFAULT 7
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $body$
DECLARE
  v_report jsonb;
  v_historical_sales numeric;
  v_historical_tickets bigint;
  v_historical_days bigint;
  v_sales numeric;
  v_tickets bigint;
BEGIN
 v_report := public.get_ventas_crossfilter_detail_raw(
   GREATEST(p_start_date, DATE '2026-02-14'),
   p_end_date,p_hour,p_product_id,p_payment,p_offset,p_limit
 );
 SELECT COALESCE(SUM(c.tpv_sales),0),
        COALESCE(SUM(c.tickets_count),0),
        COUNT(*)
 INTO v_historical_sales,v_historical_tickets,v_historical_days
 FROM public.cash_closings c
 WHERE c.tpv_terminal='HIST_BDP_PDF'
   AND c.closing_date BETWEEN p_start_date AND p_end_date;

 IF v_historical_days>0 THEN
   v_report := jsonb_set(
     v_report,'{historicalCoverage}',
     jsonb_build_object(
       'source','BDP financial daily PDF',
       'days',v_historical_days,
       'grossSales',v_historical_sales,
       'tickets',v_historical_tickets,
       'productAndHourDetailAvailable',false
     ),true
   );
   -- Una hora, producto o método de pago por ticket no se puede deducir
   -- del total financiero diario. No incluirlo en métricas filtradas.
   IF p_hour IS NULL AND p_product_id IS NULL AND p_payment IS NULL THEN
     v_sales := COALESCE((v_report->'summary'->>'totalSales')::numeric,0)
                +v_historical_sales;
     v_tickets := COALESCE((v_report->'summary'->>'count')::bigint,0)
                  +v_historical_tickets;
     v_report := jsonb_set(v_report,'{summary}',jsonb_build_object(
       'totalSales',v_sales,'count',v_tickets,
       'avgTicket',CASE WHEN v_tickets>0 THEN v_sales/v_tickets ELSE 0 END
     ),true);
   END IF;
 END IF;
 RETURN v_report;
END;
$body$;

CREATE OR REPLACE FUNCTION public.get_full_period_ticket_sales_detail(
 p_start_date date,p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $body$
DECLARE
  v_report jsonb;
  v_historical_sales numeric;
  v_historical_tickets bigint;
  v_historical_days bigint;
  v_sales numeric;
  v_tickets bigint;
BEGIN
 v_report := public.get_full_period_ticket_sales_detail_raw(
   GREATEST(p_start_date,DATE '2026-02-14'),p_end_date
 );
 SELECT COALESCE(SUM(c.tpv_sales),0),
        COALESCE(SUM(c.tickets_count),0),COUNT(*)
 INTO v_historical_sales,v_historical_tickets,v_historical_days
 FROM public.cash_closings c
 WHERE c.tpv_terminal='HIST_BDP_PDF'
   AND c.closing_date BETWEEN p_start_date AND p_end_date;

 IF v_historical_days>0 THEN
   v_sales := COALESCE((v_report->'summary'->>'totalSales')::numeric,0)
               +v_historical_sales;
   v_tickets := COALESCE((v_report->'summary'->>'count')::bigint,0)
                 +v_historical_tickets;
   v_report := jsonb_set(v_report,'{summary}',jsonb_build_object(
     'totalSales',v_sales,'count',v_tickets,
     'avgTicket',CASE WHEN v_tickets>0 THEN v_sales/v_tickets ELSE 0 END
   ),true);
   v_report := jsonb_set(v_report,'{historicalCoverage}',jsonb_build_object(
     'source','BDP financial daily PDF','days',v_historical_days,
     'grossSales',v_historical_sales,'tickets',v_historical_tickets,
     'productAndHourDetailAvailable',false
   ),true);
 END IF;
 RETURN v_report;
END;
$body$;

REVOKE ALL ON FUNCTION public.get_ventas_crossfilter(date,date,integer,integer,text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_full_period_ticket_sales_detail(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ventas_crossfilter(date,date,integer,integer,text,integer,integer)
TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_full_period_ticket_sales_detail(date,date)
TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_sales_stats(date)
TO anon,authenticated,service_role;
