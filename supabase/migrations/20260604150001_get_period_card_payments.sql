-- Insights: cobros tarjeta del periodo con fallback a cash_closings cuando tickets no tienen desglose BDP.

CREATE OR REPLACE FUNCTION public.get_period_card_payments(p_start date, p_end date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
BEGIN
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'get_period_card_payments: p_start y p_end son obligatorios';
  END IF;

  IF p_start > p_end THEN
    RAISE EXCEPTION 'get_period_card_payments: rango inválido (% > %)', p_start, p_end;
  END IF;

  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH days AS (
    SELECT d::date AS dia
    FROM generate_series(p_start, p_end, '1 day'::interval) AS d
  ),
  tickets_by_day AS (
    SELECT
      (t.fecha)::date AS dia,
      COALESCE(round(sum(t.cobro_tarjeta)::numeric, 2), 0) AS tarjeta_tickets
    FROM public.tickets_marbella t
    WHERE (t.fecha)::date BETWEEN p_start AND p_end
    GROUP BY (t.fecha)::date
  ),
  closings_by_day AS (
    SELECT
      c.closing_date AS dia,
      COALESCE(round(sum(c.card_payments)::numeric, 2), 0) AS card_payments
    FROM public.cash_closings c
    WHERE c.closing_date BETWEEN p_start AND p_end
    GROUP BY c.closing_date
  ),
  per_day AS (
    SELECT
      d.dia,
      COALESCE(tb.tarjeta_tickets, 0) AS tarjeta_tickets,
      COALESCE(cb.card_payments, 0) AS card_payments
    FROM days d
    LEFT JOIN tickets_by_day tb ON tb.dia = d.dia
    LEFT JOIN closings_by_day cb ON cb.dia = d.dia
  )
  SELECT COALESCE(round(sum(
    CASE
      WHEN tarjeta_tickets > 0 THEN tarjeta_tickets
      WHEN card_payments > 0 THEN card_payments
      ELSE 0
    END
  )::numeric, 2), 0)
  INTO v_total
  FROM per_day;

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.get_period_card_payments(date, date) IS
  'Suma cobros tarjeta del periodo: por día usa SUM(tickets_marbella.cobro_tarjeta) si > 0, si no cash_closings.card_payments.';

GRANT EXECUTE ON FUNCTION public.get_period_card_payments(date, date) TO authenticated, service_role;
