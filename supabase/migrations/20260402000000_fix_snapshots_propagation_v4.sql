-- =====================================================
-- FIX: fn_recalc_and_propagate_snapshots V4
-- CAMBIOS CLAVE:
-- 1. Crédito positivo SÓLO se arrastra si la semana anterior era BOLSA (prefer_stock=true)
--    Y NO tenía is_paid=true (ya pagada => no arrastrar).
-- 2. Deudas siempre se arrastran.
-- 3. Trigger ampliado: dispara propagación en cambio de prefer_stock_hours_override
--    y contracted_hours_snapshot, no sólo en is_paid.
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_recalc_and_propagate_snapshots(p_user_id uuid, p_start_date date)
RETURNS void AS $$
DECLARE
    v_current_week              date;
    v_last_week                 date;
    v_end_date                  date;
    v_logs_sum                  numeric;
    v_total_hours_week          numeric;
    v_weekly_balance            numeric;
    v_pending_balance           numeric := 0;
    v_final_balance             numeric;
    v_current_contracted_hours  numeric;
    v_profile_prefer_stock      boolean;
    v_is_fixed_salary           boolean;
    v_role                      text;
    v_snapshot_contracted_hours numeric;
    v_snapshot_prefer_override  boolean;
    v_is_paid_current           boolean;
    v_prev_final_balance        numeric;
    v_prev_is_paid              boolean;
    v_prev_prefer_override      boolean;
    v_prev_prefer_stock         boolean;
    v_first_clock_in            date;
BEGIN
    -- Perfil actual
    SELECT contracted_hours_weekly, prefer_stock_hours, is_fixed_salary, role
    INTO v_current_contracted_hours, v_profile_prefer_stock, v_is_fixed_salary, v_role
    FROM public.profiles WHERE id = p_user_id;

    v_current_contracted_hours := COALESCE(v_current_contracted_hours, 0);
    v_profile_prefer_stock     := COALESCE(v_profile_prefer_stock, false);
    v_role                     := COALESCE(v_role, 'staff');

    SELECT MIN(clock_in::date) INTO v_first_clock_in
    FROM public.time_logs WHERE user_id = p_user_id;

    IF v_first_clock_in IS NULL THEN RETURN; END IF;

    v_current_week := public.get_iso_week_start(GREATEST(p_start_date, v_first_clock_in));
    v_end_date     := public.get_iso_week_start(current_date) + 7;

    WHILE v_current_week <= v_end_date LOOP
        -- 1. Suma de horas de la semana
        SELECT COALESCE(SUM(public.fn_round_marbella_hours(total_hours)), 0)
        INTO v_logs_sum
        FROM public.time_logs
        WHERE user_id = p_user_id
          AND clock_in::date >= v_current_week
          AND clock_in::date <  (v_current_week + 7);

        -- 2. Snapshot existente (preservar override del usuario)
        SELECT contracted_hours_snapshot, is_paid, prefer_stock_hours_override
        INTO v_snapshot_contracted_hours, v_is_paid_current, v_snapshot_prefer_override
        FROM public.weekly_snapshots
        WHERE user_id = p_user_id AND week_start = v_current_week;

        v_snapshot_contracted_hours := COALESCE(v_snapshot_contracted_hours, v_current_contracted_hours);
        v_is_paid_current           := COALESCE(v_is_paid_current, false);

        -- 3. Balance semanal bruto
        IF extract(month from v_current_week) = 8 THEN
            v_total_hours_week := v_logs_sum;
            v_weekly_balance   := v_logs_sum;
        ELSIF v_role = 'manager' THEN
            v_total_hours_week := v_snapshot_contracted_hours + v_logs_sum;
            v_weekly_balance   := v_logs_sum;
        ELSE
            v_total_hours_week := v_logs_sum;
            v_weekly_balance   := v_logs_sum - v_snapshot_contracted_hours;
        END IF;

        -- 4. Balance pendiente de semana anterior
        v_last_week := v_current_week - 7;
        SELECT final_balance, is_paid, prefer_stock_hours_override
        INTO v_prev_final_balance, v_prev_is_paid, v_prev_prefer_override
        FROM public.weekly_snapshots
        WHERE user_id = p_user_id AND week_start = v_last_week;

        -- prefer_stock efectivo de la semana anterior (override > perfil)
        v_prev_prefer_stock := COALESCE(v_prev_prefer_override, v_profile_prefer_stock);

        v_pending_balance := 0;
        IF v_prev_final_balance IS NOT NULL THEN
            IF v_prev_final_balance > 0 THEN
                -- CRÉDITO: solo arrastra si la semana anterior era BOLSA y no fue pagada ya
                IF v_prev_prefer_stock AND NOT COALESCE(v_prev_is_paid, false) THEN
                    v_pending_balance := v_prev_final_balance;
                ELSE
                    v_pending_balance := 0; -- PAGO o ya pagada: las horas se liquidaron
                END IF;
            ELSE
                -- DEUDA: siempre se arrastra
                v_pending_balance := v_prev_final_balance;
            END IF;
        END IF;

        -- 5. Balance final
        v_final_balance := v_pending_balance + v_weekly_balance;

        -- 6. Upsert snapshot
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
            total_hours                 = EXCLUDED.total_hours,
            balance_hours               = EXCLUDED.balance_hours,
            pending_balance             = EXCLUDED.pending_balance,
            final_balance               = EXCLUDED.final_balance,
            week_end                    = EXCLUDED.week_end,
            is_paid                     = EXCLUDED.is_paid,
            contracted_hours_snapshot   = EXCLUDED.contracted_hours_snapshot,
            prefer_stock_hours_override = EXCLUDED.prefer_stock_hours_override;

        v_current_week := v_current_week + 7;
    END LOOP;

    -- 7. Sincronizar profiles.hours_balance con la semana anterior completa
    SELECT ws.final_balance,
           COALESCE(ws.prefer_stock_hours_override, p.prefer_stock_hours, false),
           COALESCE(ws.is_paid, false)
    INTO v_final_balance, v_prev_prefer_stock, v_prev_is_paid
    FROM public.weekly_snapshots ws
    JOIN public.profiles p ON p.id = p_user_id
    WHERE ws.user_id = p_user_id
      AND ws.week_start = public.get_iso_week_start(current_date - 6);

    IF v_final_balance IS NOT NULL THEN
        -- Si la semana anterior era PAGO o ya fue pagada, no arrastrar positivo al perfil
        IF (NOT v_prev_prefer_stock OR v_prev_is_paid) AND v_final_balance > 0 THEN
            v_final_balance := 0;
        END IF;
        UPDATE public.profiles SET hours_balance = v_final_balance WHERE id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.fn_recalc_and_propagate_snapshots(uuid, date) IS
'V4: Crédito positivo solo se arrastra si prefer_stock=true Y is_paid=false en la semana anterior. Deuda siempre arrastra.';

-- =====================================================
-- Ampliar trigger: propagar en cambio de cualquier config semanal
-- =====================================================
DROP TRIGGER IF EXISTS trigger_propagate_on_paid_change ON public.weekly_snapshots;
DROP TRIGGER IF EXISTS trigger_propagate_on_config_change ON public.weekly_snapshots;

CREATE OR REPLACE FUNCTION public.fn_trigger_propagate_from_snapshot()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.fn_recalc_and_propagate_snapshots(NEW.user_id, (NEW.week_start + 7)::date);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_propagate_on_config_change
AFTER UPDATE ON public.weekly_snapshots
FOR EACH ROW
WHEN (OLD.is_paid                     IS DISTINCT FROM NEW.is_paid
   OR OLD.prefer_stock_hours_override IS DISTINCT FROM NEW.prefer_stock_hours_override
   OR OLD.contracted_hours_snapshot   IS DISTINCT FROM NEW.contracted_hours_snapshot)
EXECUTE FUNCTION public.fn_trigger_propagate_from_snapshot();
