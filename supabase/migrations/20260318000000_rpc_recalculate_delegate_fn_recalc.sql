-- =================================================================
-- rpc_recalculate_all_balances: Delegar en fn_recalc_and_propagate_snapshots
-- Single Source of Truth: misma lógica que triggers y propagación
-- =================================================================

CREATE OR REPLACE FUNCTION public.rpc_recalculate_all_balances()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_first_log_date date;
    v_user_id uuid;
BEGIN
    -- Obtener la fecha del primer fichaje histórico
    SELECT MIN(clock_in::date) INTO v_first_log_date FROM public.time_logs;
    IF v_first_log_date IS NULL THEN
        RETURN '{"success": true, "message": "No hay fichajes que procesar."}'::jsonb;
    END IF;

    -- Iterar sobre cada usuario con fichajes y delegar en fn_recalc
    FOR v_user_id IN 
        SELECT DISTINCT user_id FROM public.time_logs
    LOOP
        PERFORM public.fn_recalc_and_propagate_snapshots(v_user_id, v_first_log_date);
    END LOOP;

    RETURN '{"success": true, "message": "Recálculo global completado con éxito vía fn_recalc_and_propagate_snapshots."}'::jsonb;
END;
$$;

COMMENT ON FUNCTION public.rpc_recalculate_all_balances() IS 
'Recálculo global de balances. Delega en fn_recalc_and_propagate_snapshots para consistencia con triggers.';
