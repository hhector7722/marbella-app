-- ==============================================================================
-- MUDULO CUENTA CORRIENTE (MANAGER LEDGER) - SCRIPT UNIFICADO
-- ==============================================================================

-- 1. Crear la tabla manager_ledger
CREATE TABLE IF NOT EXISTS public.manager_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'salida')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    concept TEXT NOT NULL,
    date TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Habilitar seguridad a nivel de fila
ALTER TABLE public.manager_ledger ENABLE ROW LEVEL SECURITY;

-- 2. Políticas RLS Optimizadas (Validación estricta JWT sin N+1)
-- Lectura
CREATE POLICY "Managers can view ledger" ON public.manager_ledger
FOR SELECT TO authenticated
USING ( (auth.jwt() ->> 'role')::text = 'manager' );

-- Inserción
CREATE POLICY "Managers can insert to ledger" ON public.manager_ledger
FOR INSERT TO authenticated
WITH CHECK ( (auth.jwt() ->> 'role')::text = 'manager' );

-- Actualización (Mutación Destructiva)
CREATE POLICY "Managers can update ledger" ON public.manager_ledger
FOR UPDATE TO authenticated
USING ( (auth.jwt() ->> 'role')::text = 'manager' )
WITH CHECK ( (auth.jwt() ->> 'role')::text = 'manager' );

-- Borrado (Mutación Destructiva)
CREATE POLICY "Managers can delete from ledger" ON public.manager_ledger
FOR DELETE TO authenticated
USING ( (auth.jwt() ->> 'role')::text = 'manager' );

-- 3. Función RPC para cálculo exacto y eficiente del balance general
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
