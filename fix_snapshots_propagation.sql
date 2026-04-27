-- =================================================================
-- SISTEMA DE FICHAJES LA MARBELLA - LÓGICA DE PROPAGACIÓN V3 (FINAL)
-- Sincronizado con Supabase remoto - Incluye prefer_stock_hours_override
-- =================================================================

-- 1. Actualizar Restricción de Tipos de Evento para admitir correcciones manuales
DO $$ 
BEGIN 
    ALTER TABLE public.time_logs DROP CONSTRAINT IF EXISTS time_logs_event_type_check;
    ALTER TABLE public.time_logs ADD CONSTRAINT time_logs_event_type_check 
    CHECK (event_type IN ('regular', 'overtime', 'weekend', 'holiday', 'personal', 'adjustment', 'no_registered'));
END $$;

-- 2. Función de redondeo (Correcta según operativa)
CREATE OR REPLACE FUNCTION public.fn_round_marbella_hours(total_hours numeric) 
RETURNS numeric AS $$
DECLARE
    is_neg boolean := false;
    abs_hours numeric;
    h numeric;
    m numeric;
BEGIN
    IF total_hours IS NULL OR total_hours = 0 THEN RETURN 0; END IF;
    
    IF total_hours < 0 THEN
        is_neg := true;
        abs_hours := -total_hours;
    ELSE
        abs_hours := total_hours;
    END IF;

    h := floor(abs_hours);
    m := (abs_hours - h) * 60;
    
    IF m <= 20 THEN 
        abs_hours := h;
    ELSIF m <= 50 THEN 
        abs_hours := h + 0.5;
    ELSE 
        abs_hours := h + 1;
    END IF;
    
    IF is_neg THEN RETURN -abs_hours;
    ELSE RETURN abs_hours;
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

-- 4. FUNCIÓN MAESTRA DE PROPAGACIÓN (LÓGICA V3 - Con prefer_stock_hours_override)
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
    v_snapshot_prefer_override boolean;
    v_is_paid_current boolean;
    v_prev_final_balance numeric;
    v_prev_is_paid boolean;
    v_prev_prefer_override boolean;
    v_prev_prefer_stock boolean;  -- prefer_stock de la SEMANA que generó el balance
    v_first_clock_in date;
BEGIN
    -- A. Obtener configuración ACTUAL del perfil
    SELECT contracted_hours_weekly, prefer_stock_hours, is_fixed_salary, role
    INTO v_current_contracted_hours, v_profile_prefer_stock, v_is_fixed_salary, v_role
    FROM public.profiles WHERE id = p_user_id;

    v_current_contracted_hours := COALESCE(v_current_contracted_hours, 0);
    v_profile_prefer_stock := COALESCE(v_profile_prefer_stock, false);
    v_role := COALESCE(v_role, 'staff');

    -- Detectar fecha de incorporación real (primer fichaje)
    SELECT MIN(clock_in::date) INTO v_first_clock_in
    FROM public.time_logs WHERE user_id = p_user_id;

    IF v_first_clock_in IS NULL THEN
        RETURN;
    END IF;

    v_current_week := public.get_iso_week_start(GREATEST(p_start_date, v_first_clock_in));

    -- B. Definir rango de fechas
    v_end_date := public.get_iso_week_start(current_date) + 7; -- Cubrir semana actual + margen

    -- Limpieza de seguridad: Borrar snapshots huérfanos previos a su primer fichaje
    DELETE FROM public.weekly_snapshots 
    WHERE user_id = p_user_id 
      AND week_start < public.get_iso_week_start(v_first_clock_in);

    -- C. BUCLE DE PROPAGACIÓN
    WHILE v_current_week <= v_end_date LOOP
        
        -- 1. Sumar Fichajes (Incluye 'regular', 'overtime', 'holiday', 'adjustment', etc.)
        SELECT COALESCE(SUM(public.fn_round_marbella_hours(total_hours)), 0)
        INTO v_logs_sum
        FROM public.time_logs
        WHERE user_id = p_user_id 
          AND clock_in::date >= v_current_week 
          AND clock_in::date < (v_current_week + 7);

        -- 2. Obtener Snapshot Actual (contrato, override)
        SELECT contracted_hours_snapshot, is_paid, prefer_stock_hours_override
        INTO v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
        FROM public.weekly_snapshots
        WHERE user_id = p_user_id AND week_start = v_current_week;

        v_snapshot_contracted_hours := COALESCE(v_snapshot_contracted_hours, v_current_contracted_hours);
        v_is_paid_current := COALESCE(v_is_paid_current, false);

        -- 3. Calcular Balance Semanal según Rol (O Regla de Agosto)
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

        -- 4. Arrastre de Deuda/Crédito (LÓGICA ASIMÉTRICA CORREGIDA)
        -- CRÍTICO: Usar prefer_stock de la SEMANA ANTERIOR (la que generó el balance)
        v_last_week := v_current_week - 7;
        
        SELECT final_balance, is_paid, prefer_stock_hours_override
        INTO v_prev_final_balance, v_prev_is_paid, v_prev_prefer_override
        FROM public.weekly_snapshots
        WHERE user_id = p_user_id AND week_start = v_last_week;

        -- prefer_stock efectivo de la semana anterior (override > perfil)
        v_prev_prefer_stock := COALESCE(v_prev_prefer_override, v_profile_prefer_stock);

        IF v_prev_final_balance IS NOT NULL THEN
            IF v_prev_final_balance > 0 THEN
                -- CRÉDITO: Solo se arrastra si la SEMANA ANTERIOR tenía Bolsa (prefer_stock)
                -- y ADEMÁS NO está marcada como pagada/liquidada (is_paid=true implica que ya se liquidó).
                IF v_prev_prefer_stock THEN
                    v_pending_balance := CASE WHEN COALESCE(v_prev_is_paid, false) THEN 0 ELSE v_prev_final_balance END;
                ELSE
                    v_pending_balance := 0;
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

        -- 6. Upsert (incluir prefer_stock_hours_override para no perderlo)
        INSERT INTO public.weekly_snapshots (
            user_id, week_start, week_end, 
            total_hours, balance_hours, pending_balance, final_balance, 
            contracted_hours_snapshot, is_paid, prefer_stock_hours_override
        ) VALUES (
            p_user_id, v_current_week, (v_current_week + 6),
            v_total_hours_week, v_weekly_balance, v_pending_balance, v_final_balance,
            v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
        )
        ON CONFLICT (user_id, week_start) DO UPDATE SET
            total_hours = EXCLUDED.total_hours,
            balance_hours = EXCLUDED.balance_hours,
            pending_balance = EXCLUDED.pending_balance,
            final_balance = EXCLUDED.final_balance,
            week_end = EXCLUDED.week_end,
            is_paid = EXCLUDED.is_paid,
            contracted_hours_snapshot = EXCLUDED.contracted_hours_snapshot,
            prefer_stock_hours_override = EXCLUDED.prefer_stock_hours_override;

        v_current_week := v_current_week + 7;
    END LOOP;

    -- D. SINCRONIZACIÓN CON PERFIL (CORREGIDA)
    -- Si el empleado NO acumula y la semana pasada tuvo balance positivo,
    -- esas horas se PAGARON. hours_balance debe ser 0, no el valor positivo.
    SELECT ws.final_balance, COALESCE(ws.prefer_stock_hours_override, p.prefer_stock_hours, false)
    INTO v_final_balance, v_prev_prefer_stock
    FROM public.weekly_snapshots ws
    JOIN public.profiles p ON p.id = p_user_id
    WHERE ws.user_id = p_user_id 
      AND ws.week_start = public.get_iso_week_start(current_date - 7);

    IF v_final_balance IS NOT NULL THEN
        IF NOT v_prev_prefer_stock AND v_final_balance > 0 THEN
            v_final_balance := 0;  -- No acumula + positivo = se pagó, no arrastrar al perfil
        END IF;
        UPDATE public.profiles SET hours_balance = v_final_balance WHERE id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_recalc_and_propagate_snapshots(uuid, date) IS 
'Propagación de balances semanales. Crédito positivo solo se arrastra si la semana anterior tenía prefer_stock=TRUE. Sincronización profiles.hours_balance pone 0 cuando no acumula y balance positivo.';

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
    
    PERFORM public.fn_recalc_and_propagate_snapshots(v_affected_user_id, v_affected_date);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger Function: Detectar cambio en PAGO (is_paid)
CREATE OR REPLACE FUNCTION public.fn_trigger_propagate_from_snapshot()
RETURNS TRIGGER AS $$
BEGIN
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
