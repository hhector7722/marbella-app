-- =================================================================
-- FIX: fn_recalc_and_propagate_snapshots (v5 - Selective Carry-over)
-- 1. Horas NEGATIVAS se arrastran SIEMPRE.
-- 2. Horas POSITIVAS solo se arrastran en modo BOLSA y si no están pagadas.
-- 3. No ponemos a 0 el final_balance del snapshot para que se vea el Importe (dinero).
-- =================================================================

CREATE OR REPLACE FUNCTION public.fn_recalc_and_propagate_snapshots(p_user_id uuid, p_start_date date)
RETURNS void AS $$
DECLARE
    v_cursor CURSOR FOR 
        SELECT 
            ad.week_start,
            COALESCE(ws.contracted_hours_snapshot, v_profile_contract) as effective_contract,
            COALESCE(ws.is_paid, false) as is_paid,
            ws.prefer_stock_hours_override,
            ad.week_total_hours
        FROM (
            SELECT 
                DATE_TRUNC('week', d_date)::date as week_start,
                SUM(COALESCE(tl.total_hours, 0)) as week_total_hours
            FROM generate_series(DATE_TRUNC('week', p_start_date), (CURRENT_DATE + INTERVAL '1 month'), '1 day') d_date
            LEFT JOIN public.time_logs tl 
                ON DATE(tl.clock_in AT TIME ZONE 'Europe/Madrid') = d_date::date 
                AND tl.user_id = p_user_id
            GROUP BY 1
        ) ad
        LEFT JOIN public.weekly_snapshots ws 
            ON ws.week_start = ad.week_start 
            AND ws.user_id = p_user_id
        ORDER BY ad.week_start ASC;

    v_current_week_start DATE;
    v_snapshot_contracted_hours NUMERIC;
    v_snapshot_is_paid BOOLEAN;
    v_snapshot_prefer_override BOOLEAN;
    v_logs_sum NUMERIC;

    v_pending_balance NUMERIC := 0;
    v_weekly_balance NUMERIC;
    v_final_balance NUMERIC;
    v_prev_final_balance NUMERIC := NULL;
    v_prev_is_paid BOOLEAN := NULL;
    v_prev_prefer_stock BOOLEAN := NULL;

    v_profile_contract NUMERIC;
    v_profile_prefer_stock BOOLEAN;
    v_is_fixed BOOLEAN;
    v_role TEXT;
    v_target_week_start DATE := DATE_TRUNC('week', CURRENT_DATE)::DATE;
BEGIN
    -- 1. Obtener datos base del perfil
    SELECT contracted_hours_weekly, prefer_stock_hours, is_fixed_salary, role
    INTO v_profile_contract, v_profile_prefer_stock, v_is_fixed, v_role
    FROM public.profiles WHERE id = p_user_id;

    -- 2. Buscar saldo inicial ANTES de la fecha de inicio (si existe)
    SELECT final_balance, is_paid, COALESCE(prefer_stock_hours_override, v_profile_prefer_stock)
    INTO v_prev_final_balance, v_prev_is_paid, v_prev_prefer_stock
    FROM public.weekly_snapshots
    WHERE user_id = p_user_id AND week_start < DATE_TRUNC('week', p_start_date)
    ORDER BY week_start DESC LIMIT 1;

    OPEN v_cursor;
    LOOP
        FETCH NEXT FROM v_cursor INTO v_current_week_start, v_snapshot_contracted_hours, v_snapshot_is_paid, v_snapshot_prefer_override, v_logs_sum;
        EXIT WHEN NOT FOUND;

        -- A. Determinar SALDO PENDIENTE (lo que viene de la semana anterior)
        v_pending_balance := 0;
        IF v_prev_final_balance IS NOT NULL THEN
            IF v_prev_final_balance < 0 THEN
                -- DEUDA: siempre se arrastra
                v_pending_balance := v_prev_final_balance;
            ELSE
                -- CRÉDITO: solo arrastra si la semana anterior era BOLSA y no fue pagada
                IF v_prev_prefer_stock AND NOT COALESCE(v_prev_is_paid, false) THEN
                    v_pending_balance := v_prev_final_balance;
                ELSE
                    v_pending_balance := 0; -- Pago o pagada: las horas se liquidaron o cobran
                END IF;
            END IF;
        END IF;

        -- B. Calcular BALANCE SEMANAL
        -- Regla: Agosto, Manager o Fijo -> contrato 0 para extras
        IF EXTRACT(MONTH FROM v_current_week_start) = 8 OR v_role = 'manager' OR v_is_fixed THEN
            v_weekly_balance := v_logs_sum;
        ELSE
            v_weekly_balance := v_logs_sum - COALESCE(v_snapshot_contracted_hours, v_profile_contract, 0);
        END IF;

        -- C. Calcular SALDO FINAL de esta semana
        v_final_balance := v_pending_balance + v_weekly_balance;

        -- D. UPSERT Snapshot
        INSERT INTO public.weekly_snapshots (
            user_id, week_start, week_end, 
            total_hours, balance_hours, pending_balance, final_balance,
            is_paid, contracted_hours_snapshot, prefer_stock_hours_override
        ) VALUES (
            p_user_id, v_current_week_start, (v_current_week_start + INTERVAL '6 days')::date,
            v_logs_sum, v_weekly_balance, v_pending_balance, v_final_balance,
            v_snapshot_is_paid, v_snapshot_contracted_hours, v_snapshot_prefer_override
        )
        ON CONFLICT (user_id, week_start) DO UPDATE SET
            total_hours = EXCLUDED.total_hours,
            balance_hours = EXCLUDED.balance_hours,
            pending_balance = EXCLUDED.pending_balance,
            final_balance = EXCLUDED.final_balance,
            is_paid = EXCLUDED.is_paid,
            contracted_hours_snapshot = EXCLUDED.contracted_hours_snapshot,
            prefer_stock_hours_override = EXCLUDED.prefer_stock_hours_override,
            updated_at = NOW();

        -- E. Actualizar perfil si llegamos a la semana actual
        IF v_current_week_start = v_target_week_start THEN
            DECLARE
                v_sync_balance NUMERIC;
            BEGIN
                -- El balance del perfil representa "lo ahorrado" (Bolsa)
                -- Si es PAGO y es positivo, el ahorro es 0
                IF v_final_balance > 0 AND (NOT COALESCE(v_snapshot_prefer_override, v_profile_prefer_stock) OR v_snapshot_is_paid) THEN
                    v_sync_balance := 0;
                ELSE
                    v_sync_balance := v_final_balance;
                END IF;

                UPDATE public.profiles SET hours_balance = v_sync_balance WHERE id = p_user_id;
            END;
        END IF;

        -- Preparar para siguiente iteración
        v_prev_final_balance := v_final_balance;
        v_prev_is_paid := v_snapshot_is_paid;
        v_prev_prefer_stock := COALESCE(v_snapshot_prefer_override, v_profile_prefer_stock);
    END LOOP;
    CLOSE v_cursor;
END;
$$ LANGUAGE plpgsql;
