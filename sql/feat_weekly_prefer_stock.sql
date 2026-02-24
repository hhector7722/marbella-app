-- =================================================================
-- FEAT: AGILIDAD CONTROL 'PREFER STOCK' SEMANAL
-- Permite decidir semana a semana si las horas extra se pagan o van a bolsa.
-- =================================================================

-- 1. Añadir columna de override a snapshots
ALTER TABLE public.weekly_snapshots 
ADD COLUMN IF NOT EXISTS prefer_stock_hours_override boolean DEFAULT NULL;

COMMENT ON COLUMN public.weekly_snapshots.prefer_stock_hours_override 
IS 'NULL = Usa perfil, TRUE = Bolsa de Horas, FALSE = Pagar en Nómina';

-- 2. Actualizar Función Maestra de Propagación
CREATE OR REPLACE FUNCTION public.fn_recalc_and_propagate_snapshots(p_user_id uuid, p_start_date date)
RETURNS void AS $$
DECLARE
    v_current_week date;
    v_last_week date;
    v_end_date date;
    
    v_logs_sum numeric; 
    v_total_hours_week numeric; 
    v_weekly_balance numeric;
    v_pending_balance numeric := 0;
    v_final_balance numeric;
    
    -- Perfil Actual
    v_current_contracted_hours numeric;
    v_profile_prefer_stock boolean;
    v_is_fixed_salary boolean;
    v_role text;
    
    -- Variables Históricas (Snapshot)
    v_snapshot_contracted_hours numeric;
    v_snapshot_prefer_stock_override boolean;
    v_active_prefer_stock boolean;
    v_is_paid_current boolean;
    v_prev_final_balance numeric;
    v_prev_is_paid boolean;
BEGIN
    -- A. Obtener configuración ACTUAL del perfil
    SELECT contracted_hours_weekly, prefer_stock_hours, is_fixed_salary, role
    INTO v_current_contracted_hours, v_profile_prefer_stock, v_is_fixed_salary, v_role
    FROM public.profiles WHERE id = p_user_id;

    v_current_contracted_hours := COALESCE(v_current_contracted_hours, 0);
    v_profile_prefer_stock := COALESCE(v_profile_prefer_stock, false);
    v_role := COALESCE(v_role, 'staff');

    -- Detectar fecha de incorporación real
    DECLARE
        v_first_clock_in date;
    BEGIN
        SELECT MIN(clock_in::date) INTO v_first_clock_in
        FROM public.time_logs WHERE user_id = p_user_id;

        IF v_first_clock_in IS NULL THEN
            RETURN;
        END IF;

        v_current_week := public.get_iso_week_start(GREATEST(p_start_date, v_first_clock_in));
    END;

    -- B. Definir rango de fechas
    v_end_date := public.get_iso_week_start(current_date) + 7;

    -- C. BUCLE DE PROPAGACIÓN
    WHILE v_current_week <= v_end_date LOOP
        
        -- 1. Sumar Fichajes
        SELECT COALESCE(SUM(public.fn_round_marbella_hours(total_hours)), 0)
        INTO v_logs_sum
        FROM public.time_logs
        WHERE user_id = p_user_id 
          AND clock_in::date >= v_current_week 
          AND clock_in::date < (v_current_week + 7);

        -- 2. Obtener Snapshot Actual (Override y Contrato Histórico)
        SELECT contracted_hours_snapshot, is_paid, prefer_stock_hours_override
        INTO v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_stock_override
        FROM public.weekly_snapshots
        WHERE user_id = p_user_id AND week_start = v_current_week;

        v_snapshot_contracted_hours := COALESCE(v_snapshot_contracted_hours, v_current_contracted_hours);
        v_is_paid_current := COALESCE(v_is_paid_current, false);
        
        -- LÓGICA DE PREFER_STOCK: Override (si existe) PRIORIZA sobre el perfil
        v_active_prefer_stock := COALESCE(v_snapshot_prefer_stock_override, v_profile_prefer_stock);

        -- 3. Calcular Balance Semanal
        IF extract(month from v_current_week) = 8 THEN
            v_total_hours_week := v_logs_sum;
            v_weekly_balance := v_logs_sum;
        ELSIF v_role = 'manager' THEN
            v_total_hours_week := 40 + v_logs_sum; 
            v_weekly_balance := v_logs_sum; 
        ELSE
            v_total_hours_week := v_logs_sum;
            v_weekly_balance := v_logs_sum - v_snapshot_contracted_hours;
        END IF;

        -- 4. Arrastre de Deuda/Crédito
        v_last_week := v_current_week - 7;
        
        SELECT final_balance INTO v_prev_final_balance
        FROM public.weekly_snapshots
        WHERE user_id = p_user_id AND week_start = v_last_week;

        IF v_prev_final_balance IS NOT NULL THEN
            IF v_prev_final_balance > 0 THEN
                -- CRÉDITO: Solo si es Bolsa (v_active_prefer_stock)
                IF v_active_prefer_stock THEN
                    v_pending_balance := v_prev_final_balance;
                ELSE
                    v_pending_balance := 0; 
                END IF;
            ELSE
                -- DEUDA: Arrastre siempre
                v_pending_balance := v_prev_final_balance;
            END IF;
        ELSE
            v_pending_balance := 0; 
        END IF;

        -- 5. Balance Final
        v_final_balance := v_pending_balance + v_weekly_balance;

        -- 6. Upsert
        INSERT INTO public.weekly_snapshots (
            user_id, week_start, week_end, 
            total_hours, balance_hours, pending_balance, final_balance, 
            contracted_hours_snapshot, is_paid, prefer_stock_hours_override
        ) VALUES (
            p_user_id, v_current_week, (v_current_week + 6),
            v_total_hours_week, v_weekly_balance, v_pending_balance, v_final_balance,
            v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_stock_override
        )
        ON CONFLICT (user_id, week_start) DO UPDATE SET
            total_hours = EXCLUDED.total_hours,
            balance_hours = EXCLUDED.balance_hours,
            pending_balance = EXCLUDED.pending_balance,
            final_balance = EXCLUDED.final_balance,
            is_paid = EXCLUDED.is_paid,
            contracted_hours_snapshot = EXCLUDED.contracted_hours_snapshot,
            prefer_stock_hours_override = EXCLUDED.prefer_stock_hours_override;

        v_current_week := v_current_week + 7;
    END LOOP;

    -- D. Sincronizar Balance Actual en Perfil
    SELECT final_balance INTO v_final_balance
    FROM public.weekly_snapshots
    WHERE user_id = p_user_id AND week_start = public.get_iso_week_start(current_date - 7);

    IF v_final_balance IS NOT NULL THEN
Updated public.profiles SET hours_balance = v_final_balance WHERE id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Actualizar RPC de Estadísticas (get_weekly_worker_stats) para devolver la flag activa
CREATE OR REPLACE FUNCTION public.get_weekly_worker_stats(
    p_start_date date, 
    p_end_date date,
    p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
BEGIN
    WITH weekly_user_logs AS (
        SELECT 
            date_trunc('week', clock_in AT TIME ZONE 'UTC')::date as week_start,
            user_id,
            SUM(public.fn_round_marbella_hours(total_hours)) as week_logs_sum
        FROM public.time_logs
        WHERE (clock_in AT TIME ZONE 'UTC')::date >= p_start_date 
          AND (clock_in AT TIME ZONE 'UTC')::date <= p_end_date
          AND total_hours IS NOT NULL
          AND (p_user_id IS NULL OR user_id = p_user_id)
        GROUP BY 1, 2
    ),
    staff_stats AS (
        SELECT 
            wl.week_start,
            p.id as user_id,
            p.first_name || ' ' || COALESCE(p.last_name, '') as name,
            p.role,
            p.overtime_cost_per_hour as over_price,
            -- PRIORIDAD: Semanal > Perfil
            COALESCE(s.prefer_stock_hours_override, p.prefer_stock_hours, false) as active_prefer_stock,
            COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0) as limit_hours,
            wl.week_logs_sum,
            COALESCE(s.is_paid, false) as is_paid,
            CASE 
                WHEN extract(month from wl.week_start) = 8 OR p.role = 'manager' OR p.is_fixed_salary = true 
                THEN wl.week_logs_sum 
                ELSE (wl.week_logs_sum - COALESCE(s.contracted_hours_snapshot, p.contracted_hours_weekly, 0))
            END as weekly_balance,
            COALESCE(s.pending_balance, 0) as pending_balance,
            COALESCE(s.final_balance, 0) as final_balance
        FROM weekly_user_logs wl
        JOIN public.profiles p ON wl.user_id = p.id
        LEFT JOIN public.weekly_snapshots s ON wl.user_id = s.user_id AND wl.week_start = s.week_start
    ),
    formatted_staff AS (
        SELECT 
            week_start,
            jsonb_agg(
                jsonb_build_object(
                    'id', user_id,
                    'name', name,
                    'role', role,
                    'totalHours', CASE WHEN role = 'manager' THEN (limit_hours + week_logs_sum) ELSE week_logs_sum END,
                    'regularHours', CASE WHEN role = 'manager' THEN limit_hours ELSE (week_logs_sum - CASE WHEN final_balance > 0 THEN final_balance ELSE 0 END) END,
                    'overtimeHours', CASE WHEN final_balance > 0 THEN final_balance ELSE 0 END,
                    -- Coste es 0 si es Bolsa (active_prefer_stock)
                    'totalCost', CASE WHEN final_balance > 0 AND NOT active_prefer_stock THEN (final_balance * over_price) ELSE 0 END,
                    'isPaid', is_paid,
                    'preferStock', active_prefer_stock
                ) ORDER BY (CASE WHEN final_balance > 0 AND NOT active_prefer_stock THEN (final_balance * over_price) ELSE 0 END) DESC
            ) as staff_list,
            SUM(CASE WHEN final_balance > 0 AND NOT active_prefer_stock THEN (final_balance * over_price) ELSE 0 END) as week_overtime_cost,
            SUM(CASE WHEN role = 'manager' THEN (limit_hours + week_logs_sum) ELSE week_logs_sum END) as week_total_hours
        FROM staff_stats
        GROUP BY week_start
    ),
    weeks_array AS (
        SELECT 
            jsonb_agg(
                jsonb_build_object(
                    'weekId', week_start::text,
                    'label', 'Semana del ' || to_char(week_start, 'DD "de" TMMonth'),
                    'startDate', week_start::text,
                    'totalAmount', week_overtime_cost,
                    'totalHours', week_total_hours,
                    'staff', staff_list
                ) ORDER BY week_start DESC
            ) as weeks
        FROM formatted_staff
    )
    SELECT 
        jsonb_build_object(
            'weeksResult', COALESCE((SELECT weeks FROM weeks_array), '[]'::jsonb),
            'summary', jsonb_build_object(
                'totalCost', COALESCE((SELECT SUM(week_overtime_cost) FROM formatted_staff), 0),
                'totalHours', COALESCE((SELECT SUM(week_total_hours) FROM formatted_staff), 0),
                'totalOvertimeCost', COALESCE((SELECT SUM(week_overtime_cost) FROM formatted_staff), 0)
            )
        )
    INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
