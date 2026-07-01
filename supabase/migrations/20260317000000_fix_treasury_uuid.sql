-- =============================================
-- FIX: cash_boxes.id es UUID, no BIGINT
-- Corrige get_operational_box_status y get_treasury_period_summary
-- =============================================

-- 1. get_operational_box_status: devolver UUID (cambiar tipo requiere DROP primero)
DROP FUNCTION IF EXISTS public.get_operational_box_status();

CREATE OR REPLACE FUNCTION public.get_operational_box_status()
RETURNS TABLE (
    box_id UUID,
    box_name TEXT,
    theoretical_balance NUMERIC,
    physical_balance NUMERIC,
    difference NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_box_id UUID;
    v_box_name TEXT;
    v_theoretical NUMERIC;
    v_physical NUMERIC;
BEGIN
    SELECT id, name, COALESCE(current_balance, 0)
    INTO v_box_id, v_box_name, v_theoretical
    FROM cash_boxes
    WHERE type = 'operational'
    LIMIT 1;

    IF v_box_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(denomination * quantity), 0)
    INTO v_physical
    FROM cash_box_inventory
    WHERE cash_box_inventory.box_id = v_box_id;

    RETURN QUERY SELECT
        v_box_id,
        v_box_name,
        v_theoretical,
        COALESCE(v_physical, 0),
        COALESCE(v_physical, 0) - v_theoretical;
END;
$$;

-- 2. get_treasury_period_summary: una sola versión con UUID (elimina ambigüedad)
DROP FUNCTION IF EXISTS public.get_treasury_period_summary(BIGINT, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_treasury_period_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.get_treasury_period_summary(
    p_box_id UUID DEFAULT NULL,
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
