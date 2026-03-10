-- 1. Crear la tabla manager_ledger
CREATE TABLE public.manager_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'salida')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    concept TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid()
);
ALTER TABLE public.manager_ledger ENABLE ROW LEVEL SECURITY;

-- 2. Políticas RLS Optimizadas (Solo Lectura e Inserción)
CREATE POLICY "Managers can view ledger" ON public.manager_ledger
FOR SELECT TO authenticated
USING ( (auth.jwt() ->> 'role')::text = 'manager' );

CREATE POLICY "Managers can insert to ledger" ON public.manager_ledger
FOR INSERT TO authenticated
WITH CHECK ( (auth.jwt() ->> 'role')::text = 'manager' );

-- 3. Función RPC para cálculo exacto y eficiente del balance
CREATE OR REPLACE FUNCTION get_manager_ledger_balance()
RETURNS NUMERIC(10,2)
LANGUAGE sql
SECURITY DEFINER
AS $$
SELECT COALESCE(
SUM(CASE WHEN movement_type = 'entrada' THEN amount ELSE -amount END),
0.00
)
FROM public.manager_ledger;
$$;
