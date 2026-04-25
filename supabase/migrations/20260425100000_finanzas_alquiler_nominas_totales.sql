-- Finanzas: alquiler mensual (devengo) + totales nóminas (devengo mensual)
-- RLS obligatorio: acceso solo manager (public.is_manager()).

-- 1) Totales mensuales de nóminas (coste empresa) desde PDF resumen
CREATE TABLE IF NOT EXISTS public.payroll_monthly_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_ym text NOT NULL UNIQUE, -- YYYY-MM
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_company_cost numeric(10,2) NOT NULL CHECK (total_company_cost >= 0),
  file_path text NOT NULL,
  email_date text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_monthly_totals ENABLE ROW LEVEL SECURITY;

-- Idempotencia: si ya existen (reintentos), recrearlas sin fallar.
DROP POLICY IF EXISTS "manager_select_payroll_monthly_totals" ON public.payroll_monthly_totals;
DROP POLICY IF EXISTS "manager_write_payroll_monthly_totals" ON public.payroll_monthly_totals;
DROP POLICY IF EXISTS "manager_update_payroll_monthly_totals" ON public.payroll_monthly_totals;

CREATE POLICY "manager_select_payroll_monthly_totals"
ON public.payroll_monthly_totals
FOR SELECT
TO authenticated
USING (public.is_manager());

CREATE POLICY "manager_write_payroll_monthly_totals"
ON public.payroll_monthly_totals
FOR INSERT
TO authenticated
WITH CHECK (public.is_manager());

CREATE POLICY "manager_update_payroll_monthly_totals"
ON public.payroll_monthly_totals
FOR UPDATE
TO authenticated
USING (public.is_manager())
WITH CHECK (public.is_manager());

-- 2) Costes fijos mensuales (ej. alquiler) por devengo, sin prorrateo
CREATE TABLE IF NOT EXISTS public.fixed_monthly_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  active_from date NOT NULL DEFAULT CURRENT_DATE,
  active_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fixed_monthly_costs_active_to_check CHECK (active_to IS NULL OR active_to >= active_from)
);

ALTER TABLE public.fixed_monthly_costs ENABLE ROW LEVEL SECURITY;

-- Idempotencia: si ya existen (reintentos), recrearlas sin fallar.
DROP POLICY IF EXISTS "manager_select_fixed_monthly_costs" ON public.fixed_monthly_costs;
DROP POLICY IF EXISTS "manager_write_fixed_monthly_costs" ON public.fixed_monthly_costs;
DROP POLICY IF EXISTS "manager_update_fixed_monthly_costs" ON public.fixed_monthly_costs;

CREATE POLICY "manager_select_fixed_monthly_costs"
ON public.fixed_monthly_costs
FOR SELECT
TO authenticated
USING (public.is_manager());

CREATE POLICY "manager_write_fixed_monthly_costs"
ON public.fixed_monthly_costs
FOR INSERT
TO authenticated
WITH CHECK (public.is_manager());

CREATE POLICY "manager_update_fixed_monthly_costs"
ON public.fixed_monthly_costs
FOR UPDATE
TO authenticated
USING (public.is_manager())
WITH CHECK (public.is_manager());

