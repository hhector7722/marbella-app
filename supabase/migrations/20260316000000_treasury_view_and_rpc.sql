-- =============================================
-- Vista y RPC para /dashboard/movements
-- - v_treasury_movements_balance: movimientos con saldo acumulado
-- - get_treasury_period_summary: ingresos/gastos del periodo
-- =============================================

-- 1. VISTA: Movimientos con running_balance (saldo acumulado)
-- DROP primero: la vista existente puede tener distinto orden de columnas
DROP VIEW IF EXISTS public.v_treasury_movements_balance;

CREATE VIEW public.v_treasury_movements_balance AS
SELECT
    id,
    box_id,
    type,
    amount,
    breakdown,
    notes,
    created_at,
    user_id,
    closing_id,
    SUM(
        CASE
            WHEN type IN ('IN', 'CLOSE_ENTRY') THEN amount
            WHEN type = 'OUT' THEN -amount
            ELSE 0
        END
    ) OVER (ORDER BY created_at, id ROWS UNBOUNDED PRECEDING) AS running_balance
FROM public.treasury_log
WHERE type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT', 'SWAP');

-- 2. RPC: Resumen del periodo (ingresos/gastos)
-- p_box_id NULL = todas las cajas (compatible con box_id BIGINT o UUID)
CREATE OR REPLACE FUNCTION public.get_treasury_period_summary(
    p_box_id BIGINT DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (income NUMERIC, expense NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN type IN ('IN', 'CLOSE_ENTRY') THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END), 0)
    FROM public.treasury_log
    WHERE type IN ('IN', 'OUT', 'CLOSE_ENTRY')
    AND (p_box_id IS NULL OR box_id = p_box_id)
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);
END;
$$;
