-- Protección a nivel de base de datos de las RPC base de ventas/cierres.
-- El control del chatbot, por sí solo, no protege la Data API.
CREATE OR REPLACE FUNCTION public.get_daily_sales_stats(target_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_sales numeric;
  v_tickets bigint;
BEGIN
  IF NOT (
    (auth.uid() IS NOT NULL AND public.current_employee_role() IN ('manager','admin'))
    OR COALESCE(auth.jwt()->>'role','')='service_role'
  ) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;

  SELECT c.tpv_sales, c.tickets_count
  INTO v_sales, v_tickets
  FROM public.cash_closings c
  WHERE c.closing_date=target_date AND c.tpv_terminal='HIST_BDP_PDF'
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'total_ventas',v_sales,
      'recuento_tickets',v_tickets,
      'ticket_medio',CASE WHEN v_tickets>0 THEN v_sales/v_tickets ELSE 0 END,
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
$f$;

CREATE OR REPLACE FUNCTION public.get_cash_closings_summary(p_start_date date,p_end_date date)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $f$
  SELECT CASE WHEN (
    (auth.uid() IS NOT NULL AND public.current_employee_role() IN ('manager','admin'))
    OR COALESCE(auth.jwt()->>'role','')='service_role'
  ) THEN (
    SELECT jsonb_build_object(
      'totalNet',COALESCE(SUM(net_sales),0),
      'totalGross',COALESCE(SUM(tpv_sales),0),
      'totalTickets',COALESCE(SUM(tickets_count),0),
      'avgTicket',CASE WHEN SUM(tickets_count)>0
        THEN COALESCE(SUM(tpv_sales)/SUM(tickets_count),0) ELSE 0 END,
      'count',COUNT(id)
    )
    FROM public.cash_closings
    WHERE closing_date>=p_start_date AND closing_date<=p_end_date
  ) ELSE jsonb_build_object('error','forbidden') END;
$f$;

REVOKE EXECUTE ON FUNCTION public.get_daily_sales_stats(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_daily_sales_stats(date) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.get_cash_closings_summary(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_cash_closings_summary(date,date) TO authenticated,service_role;
