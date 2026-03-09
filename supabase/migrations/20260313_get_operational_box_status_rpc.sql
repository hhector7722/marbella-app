-- =============================================
-- RPC: Estado de caja operativa (sin cálculo en frontend)
-- Devuelve theoretical_balance, physical_balance, difference calculados en DB.
-- =============================================

CREATE OR REPLACE FUNCTION public.get_operational_box_status()
RETURNS TABLE (
    box_id BIGINT,
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
    v_box_id BIGINT;
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
