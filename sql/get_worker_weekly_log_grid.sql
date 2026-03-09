-- =================================================================
-- RPC: get_worker_weekly_log_grid (VERSIÓN ORIGINAL - restaurar si se rompió)
-- Ejecutar en Supabase SQL Editor para revertir cualquier cambio.
-- =================================================================

CREATE OR REPLACE FUNCTION public.get_worker_weekly_log_grid(
    p_user_id uuid,
    p_start_date date,
    p_contracted_hours numeric DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    i INT;
    v_accumulated NUMERIC := 0;
    v_day_hours NUMERIC;
    v_day_extras NUMERIC;
    v_date DATE;
    v_result JSONB := '[]'::jsonb;
    v_clock_in TEXT;
    v_clock_out TEXT;
    v_has_log BOOLEAN;
BEGIN
    FOR i IN 0..6 LOOP
        v_date := p_start_date + i;
        
        SELECT 
            COALESCE(SUM(public.fn_calculate_rounded_hours(total_hours)), 0),
            MIN(clock_in)::time::text,
            MAX(clock_out)::time::text,
            COUNT(id) > 0
        INTO v_day_hours, v_clock_in, v_clock_out, v_has_log
        FROM public.time_logs 
        WHERE user_id = p_user_id AND DATE(clock_in) = v_date;
        
        v_day_extras := 0;
        IF (v_accumulated + v_day_hours) > p_contracted_hours THEN
            IF v_accumulated >= p_contracted_hours THEN
                v_day_extras := v_day_hours;
            ELSE
                v_day_extras := (v_accumulated + v_day_hours) - p_contracted_hours;
            END IF;
        END IF;
        
        v_accumulated := v_accumulated + v_day_hours;
        
        v_result := v_result || jsonb_build_object(
            'date', v_date,
            'hasLog', v_has_log,
            'clockIn', COALESCE(SUBSTRING(v_clock_in FROM 1 FOR 5), ''),
            'clockOut', COALESCE(SUBSTRING(v_clock_out FROM 1 FOR 5), ''),
            'totalHours', v_day_hours,
            'extraHours', v_day_extras
        );
    END LOOP;
    
    RETURN v_result;
END;
$$;
