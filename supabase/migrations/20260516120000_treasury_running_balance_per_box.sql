-- =============================================
-- running_balance por caja (no global)
-- Evita que movimientos de cajas cambio distorsionen
-- el saldo mostrado en /dashboard/movements (caja operativa).
-- =============================================

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
    ) OVER (
        PARTITION BY box_id
        ORDER BY created_at, id
        ROWS UNBOUNDED PRECEDING
    ) AS running_balance
FROM public.treasury_log
WHERE type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT', 'SWAP');
