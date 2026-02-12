-- =================================================================
-- SISTEMA DE FICHAJES LA MARBELLA - LÓGICA DE PROPAGACIÓN V3 (FINAL)
-- =================================================================

-- 1. Actualizar Restricción de Tipos de Evento para admitir correcciones manuales
DO $$ 
BEGIN 
    ALTER TABLE public.time_logs DROP CONSTRAINT IF EXISTS time_logs_event_type_check;
    ALTER TABLE public.time_logs ADD CONSTRAINT time_logs_event_type_check 
    CHECK (event_type IN ('regular', 'overtime', 'weekend', 'holiday', 'personal', 'adjustment'));
END $$;

-- 2. Función de redondeo (Correcta según operativa)
CREATE OR REPLACE FUNCTION public.fn_round_marbella_hours(total_hours numeric) 
RETURNS numeric AS $$
DECLARE
    h numeric;
    m numeric;
BEGIN
    IF total_hours IS NULL OR total_hours <= 0 THEN RETURN 0; END IF;
    h := floor(total_hours);
    m := (total_hours - h) * 60;
    
    IF m <= 20 THEN RETURN h;
    ELSIF m <= 50 THEN RETURN h + 0.5;
    ELSE RETURN h + 1;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Helper de Fechas
CREATE OR REPLACE FUNCTION public.get_iso_week_start(d date) 
RETURNS date AS $$
BEGIN
    RETURN date_trunc('week', d)::date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. FUNCIÓN MAESTRA DE PROPAGACIÓN (LÓGICA V3)
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
    v_prefer_stock boolean;
    v_is_fixed_salary boolean;
    v_role text;
    
    -- Variables Históricas (Snapshot)
    v_snapshot_contracted_hours numeric;
    v_is_paid_current boolean;
    v_prev_final_balance numeric;
    v_prev_is_paid boolean;
BEGIN
    -- A. Obtener configuración ACTUAL del perfil
    SELECT contracted_hours_weekly, prefer_stock_hours, is_fixed_salary, role
    INTO v_current_contracted_hours, v_prefer_stock, v_is_fixed_salary, v_role
    FROM public.profiles WHERE id = p_user_id;

    v_current_contracted_hours := COALESCE(v_current_contracted_hours, 40);
    v_prefer_stock := COALESCE(v_prefer_stock, false);
    v_role := COALESCE(v_role, 'staff');

    -- B. Definir rango de fechas
    v_current_week := public.get_iso_week_start(p_start_date);
    v_end_date := public.get_iso_week_start(current_date) + 7; -- Cubrir semana actual + margen

    -- C. BUCLE DE PROPAGACIÓN
    WHILE v_current_week <= v_end_date LOOP
        
        -- 1. Sumar Fichajes (Incluye 'regular', 'overtime', 'holiday', 'adjustment', etc.)
        SELECT COALESCE(SUM(public.fn_round_marbella_hours(total_hours)), 0)
        INTO v_logs_sum
        FROM public.time_logs
        WHERE user_id = p_user_id 
          AND clock_in::date >= v_current_week 
          AND clock_in::date < (v_current_week + 7);

        -- 2. Obtener Contrato Histórico (EVITAR REESCRIBIR EL PASADO)
        SELECT contracted_hours_snapshot, is_paid 
        INTO v_snapshot_contracted_hours, v_is_paid_current
        FROM public.weekly_snapshots
        WHERE user_id = p_user_id AND week_start = v_current_week;

        -- Si no existe snapshot, usamos el actual. Si existe, lo respetamos.
        v_snapshot_contracted_hours := COALESCE(v_snapshot_contracted_hours, v_current_contracted_hours);
        v_is_paid_current := COALESCE(v_is_paid_current, false);

        -- 3. Calcular Balance Semanal según Rol (CORRECCIÓN MANAGER)
        IF v_role = 'manager' THEN
            -- Manager: Sueldo fijo. Solo lo fichado cuenta como extra/balance.
            v_total_hours_week := 40 + v_logs_sum; 
            v_weekly_balance := v_logs_sum; 
        ELSE
            -- Staff: Trabajado - Contrato
            v_total_hours_week := v_logs_sum;
            v_weekly_balance := v_logs_sum - v_snapshot_contracted_hours;
        END IF;

        -- 4. Arrastre de Deuda/Crédito (LÓGICA ASIMÉTRICA)
        v_last_week := v_current_week - 7;
        
        SELECT final_balance, is_paid 
        INTO v_prev_final_balance, v_prev_is_paid
        FROM public.weekly_snapshots
        WHERE user_id = p_user_id AND week_start = v_last_week;

        IF v_prev_final_balance IS NOT NULL THEN
            IF v_prev_final_balance > 0 THEN
                -- CRÉDITO (Empresa debe dinero): Se borra si se pagó, salvo Stock.
                IF v_prefer_stock THEN
                    v_pending_balance := v_prev_final_balance;
                ELSE
                    IF v_prev_is_paid THEN v_pending_balance := 0;
                    ELSE v_pending_balance := v_prev_final_balance;
                    END IF;
                END IF;
            ELSE
                -- DEUDA (Empleado debe horas): INDESTRUCTIBLE. Se arrastra siempre.
                v_pending_balance := v_prev_final_balance;
            END IF;
        ELSE
            v_pending_balance := 0; 
        END IF;

        -- 5. Balance Final
        v_final_balance := v_pending_balance + v_weekly_balance;

        -- 6. Upsert (Guardar)
        INSERT INTO public.weekly_snapshots (
            user_id, week_start, week_end, 
            total_hours, balance_hours, pending_balance, final_balance, 
            contracted_hours_snapshot, is_paid
        ) VALUES (
            p_user_id, v_current_week, (v_current_week + 6),
            v_total_hours_week, v_weekly_balance, v_pending_balance, v_final_balance,
            v_snapshot_contracted_hours, v_is_paid_current
        )
        ON CONFLICT (user_id, week_start) DO UPDATE SET
            total_hours = EXCLUDED.total_hours,
            balance_hours = EXCLUDED.balance_hours,
            pending_balance = EXCLUDED.pending_balance,
            final_balance = EXCLUDED.final_balance,
            week_end = EXCLUDED.week_end,
            is_paid = EXCLUDED.is_paid,
            contracted_hours_snapshot = EXCLUDED.contracted_hours_snapshot;

        -- Avanzar semana
        v_current_week := v_current_week + 7;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger Function: Detectar cambio en logs
CREATE OR REPLACE FUNCTION public.recalc_snapshots_on_log_change()
RETURNS TRIGGER AS $$
DECLARE
    v_affected_user_id uuid;
    v_affected_date date;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_affected_user_id := OLD.user_id;
        v_affected_date := OLD.clock_in::date;
    ELSE
        v_affected_user_id := NEW.user_id;
        v_affected_date := NEW.clock_in::date;
    END IF;
    
    -- Propagar cambios
    PERFORM public.fn_recalc_and_propagate_snapshots(v_affected_user_id, v_affected_date);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger Function: Detectar cambio en PAGO (is_paid)
CREATE OR REPLACE FUNCTION public.fn_trigger_propagate_from_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    -- Si cambia el estado de pago, recalcular desde la SEMANA SIGUIENTE
    -- para ver si se limpia la deuda o no.
    PERFORM public.fn_recalc_and_propagate_snapshots(NEW.user_id, NEW.week_start + 7);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Activación de Triggers
DROP TRIGGER IF EXISTS trigger_recalc_snapshots ON public.time_logs;
CREATE TRIGGER trigger_recalc_snapshots
AFTER INSERT OR UPDATE OR DELETE ON public.time_logs
FOR EACH ROW EXECUTE FUNCTION public.recalc_snapshots_on_log_change();

DROP TRIGGER IF EXISTS trigger_propagate_on_paid_change ON public.weekly_snapshots;
CREATE TRIGGER trigger_propagate_on_paid_change
AFTER UPDATE OF is_paid ON public.weekly_snapshots
FOR EACH ROW
WHEN (OLD.is_paid IS DISTINCT FROM NEW.is_paid)
EXECUTE FUNCTION public.fn_trigger_propagate_from_snapshot();
