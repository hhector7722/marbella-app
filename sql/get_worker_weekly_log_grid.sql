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
    v_joining_date DATE;
    v_week_limit NUMERIC := COALESCE(p_contracted_hours, 0);
    v_active_days INT;
BEGIN
    SELECT p.joining_date
    INTO v_joining_date
    FROM public.profiles p
    WHERE p.id = p_user_id;

    -- Ajuste automático de límite semanal si el empleado empieza a mitad de semana.
    -- Regla: si joining_date cae dentro de la semana (Mon..Sun), el "contrato" de esa semana
    -- se prorratea por días activos (incluyendo el día de incorporación).
    IF v_joining_date IS NOT NULL AND v_week_limit > 0 THEN
        IF v_joining_date <= p_start_date THEN
            -- Semana completa (sin prorrateo)
            v_week_limit := v_week_limit;
        ELSIF v_joining_date > (p_start_date + 6) THEN
            -- Aún no incorporado en esa semana
            v_week_limit := 0;
        ELSE
            v_active_days := GREATEST(0, 7 - (v_joining_date - p_start_date));
            v_week_limit := v_week_limit * (v_active_days::numeric / 7.0);
        END IF;
    END IF;

    FOR i IN 0..6 LOOP
        v_date := p_start_date + i;
        
        SELECT 
            COALESCE(SUM(public.fn_calculate_rounded_hours(total_hours)), 0),
            MIN(clock_in)::time::text,
            MAX(clock_out)::time::text,
            COUNT(id) > 0
        INTO v_day_hours, v_clock_in, v_clock_out, v_has_log
        FROM public.time_logs 
        WHERE user_id = p_user_id AND DATE(clock_in AT TIME ZONE 'Europe/Madrid') = v_date;
        
        v_day_extras := 0;
        IF v_joining_date IS NOT NULL AND v_date < v_joining_date THEN
            -- Antes de incorporarse: todo lo trabajado es "extra" y NO consume contrato.
            v_day_extras := v_day_hours;
        ELSE
            IF (v_accumulated + v_day_hours) > v_week_limit THEN
                IF v_accumulated >= v_week_limit THEN
                    v_day_extras := v_day_hours;
                ELSE
                    v_day_extras := (v_accumulated + v_day_hours) - v_week_limit;
                END IF;
            END IF;
            v_accumulated := v_accumulated + v_day_hours;
        END IF;
        
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
