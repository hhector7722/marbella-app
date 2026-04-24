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
  v_labor_total numeric := 0;
  v_pyg_expenses_total numeric := 0;
  v_pyg_net numeric := 0;

  v_cash_in numeric := 0;
  v_cash_out numeric := 0;
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

  -- PY&L (Devengo): Coste laboral desde weekly_snapshots.total_cost (repositorio de coste real).
  -- Regla: sumar snapshots que solapen el rango (sin prorrateo intra-semana).
  SELECT
    COALESCE(SUM(ws.total_cost), 0)
  INTO v_labor_total
  FROM public.weekly_snapshots ws
  WHERE ws.week_start <= p_end_date
    AND ws.week_end >= p_start_date;

  v_pyg_expenses_total := COALESCE(v_purchases_total, 0) + COALESCE(v_labor_total, 0);
  v_pyg_net := COALESCE(v_sales_net, 0) - COALESCE(v_pyg_expenses_total, 0);

  -- CASH FLOW (Caja): treasury_log por created_at convertido a fecha Europe/Madrid.
  -- Entradas: IN + CLOSE_ENTRY
  -- Salidas: OUT
  -- Other: ADJUSTMENT + SWAP (separado para no distorsionar orgánico)
  SELECT
    COALESCE(SUM(CASE WHEN tl.type IN ('IN', 'CLOSE_ENTRY') THEN tl.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tl.type = 'OUT' THEN tl.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tl.type = 'ADJUSTMENT' THEN tl.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tl.type = 'SWAP' THEN tl.amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out, v_cash_adjustment, v_cash_swap
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
      'accrualLabor', 'weekly_snapshots(total_cost) by week_start/week_end overlap',
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
        jsonb_build_object('key', 'labor_cost', 'label', 'Coste laboral', 'amount', v_labor_total)
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

