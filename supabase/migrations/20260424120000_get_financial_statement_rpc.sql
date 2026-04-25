-- Financial Statement (Devengo vs Caja)
-- RPC: public.get_financial_statement(p_start_date date, p_end_date date) -> jsonb
-- NOTE: Seguridad: solo manager (public.is_manager()).

CREATE OR REPLACE FUNCTION public.get_financial_statement(p_start_date date, p_end_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sales_positive numeric := 0;
  v_sales_refunds numeric := 0;
  v_sales_net numeric := 0;

  v_purchases_total numeric := 0;
  v_payroll_total numeric := 0;
  v_rent_total numeric := 0;
  v_pyg_expenses_total numeric := 0;
  v_pyg_net numeric := 0;

  v_cash_in numeric := 0;
  v_cash_out numeric := 0;
  v_cash_bank_transfer_out numeric := 0;
  v_cash_adjustment numeric := 0;
  v_cash_swap numeric := 0;
  v_cash_net numeric := 0;

  v_meta jsonb;
  v_pyg jsonb;
  v_cashflow jsonb;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'get_financial_statement: p_start_date y p_end_date son obligatorios';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'get_financial_statement: rango inválido (% > %)', p_start_date, p_end_date;
  END IF;

  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- PY&L (Devengo): Ventas desde tickets_marbella por fecha (Fuente de verdad).
  SELECT
    COALESCE(SUM(CASE WHEN t.total_documento > 0 THEN t.total_documento ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.total_documento < 0 THEN t.total_documento ELSE 0 END), 0),
    COALESCE(SUM(t.total_documento), 0)
  INTO v_sales_positive, v_sales_refunds, v_sales_net
  FROM public.tickets_marbella t
  WHERE t.fecha >= p_start_date
    AND t.fecha <= p_end_date;

  -- PY&L (Devengo): Compras verificadas (no "processing").
  -- Estados terminales válidos confirmados por negocio: mapped/completed.
  SELECT
    COALESCE(SUM(pi.total_amount), 0)
  INTO v_purchases_total
  FROM public.purchase_invoices pi
  WHERE pi.invoice_date IS NOT NULL
    AND pi.total_amount IS NOT NULL
    AND pi.invoice_date >= p_start_date
    AND pi.invoice_date <= p_end_date
    AND pi.status IN ('mapped', 'completed');

  -- PY&L (Devengo): Nóminas (coste empresa) desde PDF resumen mensual.
  SELECT
    COALESCE(SUM(pmt.total_company_cost), 0)
  INTO v_payroll_total
  FROM public.payroll_monthly_totals pmt
  WHERE pmt.period_start <= p_end_date
    AND pmt.period_end >= p_start_date;

  -- PY&L (Devengo): Costes fijos mensuales (sin prorrateo). Se cuentan solo meses COMPLETOS dentro del rango.
  WITH bounds AS (
    SELECT
      -- primer mes completo:
      CASE
        WHEN p_start_date > date_trunc('month', p_start_date)::date
          THEN (date_trunc('month', p_start_date)::date + interval '1 month')::date
        ELSE date_trunc('month', p_start_date)::date
      END AS first_month_start,
      -- último mes completo:
      CASE
        WHEN p_end_date < ((date_trunc('month', p_end_date)::date + interval '1 month')::date - interval '1 day')::date
          THEN (date_trunc('month', p_end_date)::date - interval '1 month')::date
        ELSE date_trunc('month', p_end_date)::date
      END AS last_month_start
  ),
  months AS (
    SELECT gs::date AS month_start
    FROM bounds b
    CROSS JOIN LATERAL generate_series(b.first_month_start, b.last_month_start, interval '1 month') gs
  )
  SELECT
    COALESCE(SUM(fmc.amount), 0)
  INTO v_rent_total
  FROM months m
  JOIN public.fixed_monthly_costs fmc
    ON (fmc.active_from <= (m.month_start + interval '1 month' - interval '1 day')::date)
   AND (fmc.active_to IS NULL OR fmc.active_to >= m.month_start)
  WHERE lower(fmc.name) = 'alquiler';

  v_pyg_expenses_total := COALESCE(v_purchases_total, 0) + COALESCE(v_payroll_total, 0) + COALESCE(v_rent_total, 0);
  v_pyg_net := COALESCE(v_sales_net, 0) - COALESCE(v_pyg_expenses_total, 0);

  -- CASH FLOW (Caja): treasury_log por created_at convertido a fecha Europe/Madrid.
  -- Entradas: IN + CLOSE_ENTRY
  -- Salidas: OUT (orgánico). Excluye retiradas/transferencias a banco detectadas por nota (banc/a banc).
  -- Other: ADJUSTMENT + SWAP (separado para no distorsionar orgánico)
  SELECT
    COALESCE(SUM(CASE WHEN tl.type IN ('IN', 'CLOSE_ENTRY') THEN tl.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tl.type = 'OUT' AND NOT (COALESCE(tl.notes,'') ILIKE '%banc%') THEN tl.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tl.type = 'OUT' AND (COALESCE(tl.notes,'') ILIKE '%banc%') THEN tl.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tl.type = 'ADJUSTMENT' THEN tl.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tl.type = 'SWAP' THEN tl.amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out, v_cash_bank_transfer_out, v_cash_adjustment, v_cash_swap
  FROM public.treasury_log tl
  WHERE ((tl.created_at AT TIME ZONE 'Europe/Madrid')::date) >= p_start_date
    AND ((tl.created_at AT TIME ZONE 'Europe/Madrid')::date) <= p_end_date;

  v_cash_net := COALESCE(v_cash_in, 0) - COALESCE(v_cash_out, 0);

  v_meta := jsonb_build_object(
    'startDate', p_start_date,
    'endDate', p_end_date,
    'generatedAt', now(),
    'timezone', 'Europe/Madrid',
    'sources', jsonb_build_object(
      'accrualIncome', 'tickets_marbella(total_documento) by fecha',
      'accrualPurchases', 'purchase_invoices(total_amount) by invoice_date, status IN (mapped, completed)',
      'accrualPayroll', 'payroll_monthly_totals(total_company_cost) by monthly period overlap',
      'accrualRent', 'fixed_monthly_costs(name=alquiler) by full months in range (no proration)',
      'cashFlow', 'treasury_log by created_at Europe/Madrid date'
    )
  );

  v_pyg := jsonb_build_object(
    'income', jsonb_build_object(
      'total', v_sales_net,
      'lines', jsonb_build_array(
        jsonb_build_object('key', 'sales_positive', 'label', 'Ventas (positivas)', 'amount', v_sales_positive),
        jsonb_build_object('key', 'refunds', 'label', 'Devoluciones (negativas)', 'amount', v_sales_refunds)
      )
    ),
    'expenses', jsonb_build_object(
      'total', v_pyg_expenses_total,
      'lines', jsonb_build_array(
        jsonb_build_object('key', 'purchases_invoices', 'label', 'Compras verificadas', 'amount', v_purchases_total),
        jsonb_build_object('key', 'payroll_total', 'label', 'Nóminas (coste empresa)', 'amount', v_payroll_total),
        jsonb_build_object('key', 'rent_monthly', 'label', 'Alquiler', 'amount', v_rent_total)
      )
    ),
    'net', v_pyg_net
  );

  v_cashflow := jsonb_build_object(
    'inflows', jsonb_build_object(
      'total', v_cash_in,
      'lines', jsonb_build_array(
        jsonb_build_object('key', 'treasury_in', 'label', 'Entradas (IN + CLOSE_ENTRY)', 'amount', v_cash_in)
      )
    ),
    'outflows', jsonb_build_object(
      'total', v_cash_out,
      'lines', jsonb_build_array(
        jsonb_build_object('key', 'treasury_out', 'label', 'Salidas (OUT)', 'amount', v_cash_out)
      )
    ),
    'other', jsonb_build_object(
      'bankTransferOut', v_cash_bank_transfer_out,
      'adjustment', v_cash_adjustment,
      'swap', v_cash_swap
    ),
    'net', v_cash_net
  );

  RETURN jsonb_build_object(
    'meta', v_meta,
    'pyg', v_pyg,
    'cashFlow', v_cashflow,
    'reconciliation', jsonb_build_object(
      'accrualNet', v_pyg_net,
      'cashNet', v_cash_net,
      'delta', (v_pyg_net - v_cash_net)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_statement(date, date) TO authenticated;

