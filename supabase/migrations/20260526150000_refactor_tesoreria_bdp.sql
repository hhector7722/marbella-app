-- Refactor tesorería TPV BDP: desglose de cobros en tickets + staging caja (concepto 107).

ALTER TABLE public.tickets_marbella
  ADD COLUMN IF NOT EXISTS cobro_efectivo numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cobro_tarjeta numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cobro_pendiente numeric(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tickets_marbella.cobro_efectivo IS 'Efectivo cobrado al cierre (Documentos_Pagos Forma_Pago=1).';
COMMENT ON COLUMN public.tickets_marbella.cobro_tarjeta IS 'Tarjeta cobrada al cierre (Documentos_Pagos Forma_Pago IN 2,3).';
COMMENT ON COLUMN public.tickets_marbella.cobro_pendiente IS 'Importe pendiente / a cuenta (Total - efectivo - tarjeta).';

CREATE TABLE IF NOT EXISTS public.bdp_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_negocio date NOT NULL,
  movement_date timestamptz NOT NULL,
  concept_code integer NOT NULL,
  amount numeric(10, 2) NOT NULL,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bdp_cash_movements_dedup UNIQUE (movement_date, concept_code, amount)
);

CREATE INDEX IF NOT EXISTS idx_bdp_cash_movements_fecha_negocio
  ON public.bdp_cash_movements (fecha_negocio);

CREATE INDEX IF NOT EXISTS idx_bdp_cash_movements_concept_fecha
  ON public.bdp_cash_movements (fecha_negocio, concept_code);

COMMENT ON TABLE public.bdp_cash_movements IS
  'Staging de movimientos de caja BDP (ej. cobros deuda concepto 107). No escribe en treasury_log.';

ALTER TABLE public.bdp_cash_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bdp_cash_movements_select_authenticated ON public.bdp_cash_movements;
CREATE POLICY bdp_cash_movements_select_authenticated
  ON public.bdp_cash_movements
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS bdp_cash_movements_service_role_all ON public.bdp_cash_movements;
CREATE POLICY bdp_cash_movements_service_role_all
  ON public.bdp_cash_movements
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.get_closing_sales_breakdown(p_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bruto numeric := 0;
  v_efectivo numeric := 0;
  v_tarjeta numeric := 0;
  v_pendiente numeric := 0;
  v_cobros_deuda numeric := 0;
  v_recuento integer := 0;
BEGIN
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'get_closing_sales_breakdown: p_date es obligatorio';
  END IF;

  SELECT
    COALESCE(round(sum(t.total_documento)::numeric, 2), 0),
    COALESCE(round(sum(t.cobro_efectivo)::numeric, 2), 0),
    COALESCE(round(sum(t.cobro_tarjeta)::numeric, 2), 0),
    COALESCE(round(sum(t.cobro_pendiente)::numeric, 2), 0),
    COALESCE(count(*) FILTER (WHERE t.total_documento <> 0), 0)::integer
  INTO v_bruto, v_efectivo, v_tarjeta, v_pendiente, v_recuento
  FROM public.tickets_marbella t
  WHERE (t.fecha)::date = p_date;

  SELECT COALESCE(round(sum(m.amount)::numeric, 2), 0)
  INTO v_cobros_deuda
  FROM public.bdp_cash_movements m
  WHERE m.fecha_negocio = p_date
    AND m.concept_code = 107;

  RETURN jsonb_build_object(
    'total_bruto', v_bruto,
    'total_efectivo', v_efectivo,
    'total_tarjeta', v_tarjeta,
    'total_pendiente', v_pendiente,
    'total_cobros_deuda', v_cobros_deuda,
    'recuento_tickets', v_recuento
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_closing_sales_breakdown(date) TO authenticated, service_role;
