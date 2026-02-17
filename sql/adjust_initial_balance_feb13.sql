-- AJUSTE DE SALDO INICIAL PARA BAR LA MARBELLA --
-- Objetivo: Saldo de 336.21€ al cierre del 13 de febrero.

DO $$
DECLARE
    v_box_id UUID;
    v_adjustment_amount NUMERIC := -1828.53; -- Diferencia calculada para llegar a 336.21€
BEGIN
    -- 1. Obtener el ID de la caja operativa
    SELECT id INTO v_box_id FROM public.cash_boxes WHERE type = 'operational' LIMIT 1;

    IF v_box_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró la caja de tipo operational';
    END IF;

    -- 2. Insertar el log de ajuste con fecha 13 de Febrero
    -- El trigger fn_sync_box_inventory actualizará automáticamente el current_balance de la caja.
    INSERT INTO public.treasury_log (
        box_id, 
        type, 
        amount, 
        notes, 
        created_at
    )
    VALUES (
        v_box_id, 
        'ADJUSTMENT', 
        v_adjustment_amount, 
        'Ajuste saldo inicial (Manual a 336.21€ al día 13)', 
        '2026-02-13 23:59:59+00'
    );

    RAISE NOTICE 'Ajuste de %€ aplicado a la caja operativa con éxito.', v_adjustment_amount;
END $$;
