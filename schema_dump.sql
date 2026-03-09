


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'manager',
    'staff'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_time_log_hours"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.clock_out IS NOT NULL THEN
    NEW.total_hours = EXTRACT(EPOCH FROM (NEW.clock_out - NEW.clock_in)) / 3600.0;
  ELSE
    NEW.total_hours = 0;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_time_log_hours"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_week_for_all_users"("target_week_start" "date", "target_week_end" "date") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO weekly_snapshots (
        user_id, week_start, week_end,
        total_hours, ordinary_hours, extra_hours,
        contracted_hours_snapshot, overtime_price_snapshot,
        total_cost,
        balance_hours, pending_balance, final_balance
    )
    SELECT 
        p.id as user_id,
        target_week_start,
        target_week_end,
        
        -- 1. Horas (Usamos COALESCE para convertir NULL en 0 si no vino)
        COALESCE(SUM(v.total_hours), 0) as total_h,
        COALESCE(SUM(v.ordinary_hours), 0) as ord_h,
        COALESCE(SUM(v.extra_hours), 0) as extra_h,
        
        -- 2. Datos Contrato (Siempre existen en el perfil)
        p.contracted_hours_weekly, 
        p.overtime_cost_per_hour,
        
        -- 3. Coste
        (COALESCE(SUM(v.extra_hours), 0) * COALESCE(p.overtime_cost_per_hour, 0)),
        
        -- 4. BALANCE SEMANAL (Aquí es donde se aplica la deuda si es 0)
        CASE 
            WHEN p.is_fixed_salary THEN COALESCE(SUM(v.total_hours), 0) -- Manager (0 si no viene)
            ELSE COALESCE(SUM(v.total_hours), 0) - p.contracted_hours_weekly -- Staff (0 - 40 = -40)
        END as calculated_balance,

        -- 5. PENDIENTE (Buscar el saldo final de la semana anterior)
        COALESCE((
            SELECT ws.final_balance 
            FROM weekly_snapshots ws 
            WHERE ws.user_id = p.id 
            AND ws.week_start < target_week_start 
            ORDER BY ws.week_start DESC 
            LIMIT 1
        ), 0) as prev_bal,

        -- 6. SALDO FINAL (Pendiente + Balance)
        (
            COALESCE((
                SELECT ws.final_balance 
                FROM weekly_snapshots ws 
                WHERE ws.user_id = p.id 
                AND ws.week_start < target_week_start 
                ORDER BY ws.week_start DESC 
                LIMIT 1
            ), 0) 
            + 
            (CASE 
                WHEN p.is_fixed_salary THEN COALESCE(SUM(v.total_hours), 0)
                ELSE COALESCE(SUM(v.total_hours), 0) - p.contracted_hours_weekly
            END)
        )

    FROM 
        profiles p  -- <--- CAMBIO CLAVE: Empezamos por los perfiles
    LEFT JOIN 
        view_daily_hours_breakdown v ON p.id = v.user_id 
        AND v.clock_in >= target_week_start 
        AND v.clock_in <= target_week_end
    
    -- Opcional: Filtrar solo empleados activos si tienes columna 'status'
    -- WHERE p.status = 'active' 
    
    GROUP BY p.id, p.contracted_hours_weekly, p.overtime_cost_per_hour, p.is_fixed_salary
    
    ON CONFLICT (user_id, week_start) 
    DO UPDATE SET
        total_hours = EXCLUDED.total_hours,
        ordinary_hours = EXCLUDED.ordinary_hours,
        extra_hours = EXCLUDED.extra_hours,
        contracted_hours_snapshot = EXCLUDED.contracted_hours_snapshot,
        balance_hours = EXCLUDED.balance_hours,
        pending_balance = EXCLUDED.pending_balance,
        final_balance = EXCLUDED.final_balance,
        total_cost = EXCLUDED.total_cost,
        created_at = NOW();
END;
$$;


ALTER FUNCTION "public"."close_week_for_all_users"("target_week_start" "date", "target_week_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."close_weekly_hours"("target_date" "date" DEFAULT (CURRENT_DATE - '7 days'::interval)) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  employee RECORD;
  week_start_date DATE;
  week_end_date DATE;
  total_worked NUMERIC;
  contract_hours NUMERIC;
  week_diff NUMERIC;
BEGIN
  -- Definir fechas de la semana anterior
  week_start_date := date_trunc('week', target_date)::DATE;
  week_end_date := (week_start_date + INTERVAL '6 days')::DATE;

  -- SEGURIDAD: Si ya existe un cierre para esta fecha, NO HACER NADA.
  IF EXISTS (SELECT 1 FROM weekly_closings_log WHERE week_start = week_start_date) THEN
    RETURN;
  END IF;

  -- Bucle por empleado
  FOR employee IN SELECT * FROM profiles WHERE role = 'staff' LOOP
      
      -- Calcular horas trabajadas
      SELECT COALESCE(SUM(total_hours), 0) INTO total_worked 
      FROM time_logs 
      WHERE user_id = employee.id 
        AND clock_in >= week_start_date 
        AND clock_in < (week_end_date + INTERVAL '1 day');
      
      contract_hours := COALESCE(employee.contracted_hours_weekly, 40);
      week_diff := total_worked - contract_hours;

      -- Aplicar lógica de deuda/crédito
      IF week_diff < 0 OR employee.prefer_stock_hours = TRUE THEN
          UPDATE profiles 
          SET hours_balance = COALESCE(hours_balance, 0) + week_diff 
          WHERE id = employee.id;
      END IF;
  END LOOP;

  -- Registrar que hemos cerrado esta semana
  INSERT INTO weekly_closings_log (week_start, week_end) VALUES (week_start_date, week_end_date);
END;
$$;


ALTER FUNCTION "public"."close_weekly_hours"("target_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_role" "text", "p_contracted_hours_weekly" numeric, "p_overtime_cost_per_hour" numeric, "p_joining_date" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    new_user_id uuid;
BEGIN
    -- 1. Create entry in profiles (trigger will handle auth user creation if needed, 
    -- but usually we need auth user first. 
    -- ASSUMING this function is called by specific logic or we just insert into profiles 
    -- and let the system handle it, OR this wraps the whole thing.
    -- Actually, usually we create auth user via Supabase Auth API, but in this specific project context, 
    -- checking previous usage, it seems this is a custom function.
    
    -- Let's look at the existing function first.
    -- Since I cannot see it, I will assume a standard insert into profiles.
    
    INSERT INTO profiles (
        first_name, 
        last_name, 
        email, 
        role, 
        contracted_hours_weekly, 
        overtime_cost_per_hour,
        joining_date
    ) VALUES (
        p_first_name,
        p_last_name,
        p_email,
        p_role,
        p_contracted_hours_weekly,
        p_overtime_cost_per_hour,
        p_joining_date
    ) RETURNING id INTO new_user_id;
    RETURN new_user_id;
END;
$$;


ALTER FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_role" "text", "p_contracted_hours_weekly" numeric, "p_overtime_cost_per_hour" numeric, "p_joining_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text" DEFAULT NULL::"text", "p_email" "text" DEFAULT NULL::"text", "p_role" "text" DEFAULT 'staff'::"text", "p_contracted_hours_weekly" numeric DEFAULT 40, "p_overtime_cost_per_hour" numeric DEFAULT 0, "p_dni" "text" DEFAULT NULL::"text", "p_bank_account" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    new_id uuid := gen_random_uuid();
    worker_email TEXT;
BEGIN
    -- Usar email proporcionado o generar uno dummy
    worker_email := COALESCE(NULLIF(TRIM(p_email), ''), lower(replace(p_first_name, ' ', '.')) || '.' || substr(new_id::text, 1, 8) || '@marbella.internal');
    -- 1. Crear entrada en auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change
    ) VALUES (
        new_id,
        '00000000-0000-0000-0000-000000000000',
        worker_email,
        crypt('Marbella2026', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('first_name', p_first_name, 'last_name', COALESCE(p_last_name, '')),
        'authenticated',
        'authenticated',
        now(),
        now(),
        '',
        '',
        '',
        ''
    );
    -- 2. Crear entrada en auth.identities
    INSERT INTO auth.identities (
        id,
        user_id,
        provider_id,
        identity_data,
        provider,
        last_sign_in_at,
        created_at,
        updated_at
    ) VALUES (
        new_id::text,
        new_id,
        new_id::text,
        jsonb_build_object('sub', new_id::text, 'email', worker_email),
        'email',
        now(),
        now(),
        now()
    );
    -- 3. Crear perfil con needs_onboarding = true
    INSERT INTO profiles (
        id, first_name, last_name, role, 
        contracted_hours_weekly, overtime_cost_per_hour, 
        hours_balance, dni, bank_account, needs_onboarding
    )
    VALUES (
        new_id, p_first_name, p_last_name, p_role, 
        p_contracted_hours_weekly, p_overtime_cost_per_hour, 
        0, p_dni, p_bank_account, true
    );
    RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_role" "text", "p_contracted_hours_weekly" numeric, "p_overtime_cost_per_hour" numeric, "p_dni" "text", "p_bank_account" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_employee_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT get_employee_role(auth.uid());
$$;


ALTER FUNCTION "public"."current_employee_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."current_employee_role"() IS 'Returns role of currently authenticated user';



CREATE OR REPLACE FUNCTION "public"."debug_me"() RETURNS TABLE("my_auth_id" "uuid", "my_employee_id" "uuid", "my_role" "text", "is_mgr" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT 
        auth.uid(),
        (SELECT id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1),
        (SELECT role::text FROM employees WHERE auth_user_id = auth.uid() LIMIT 1),
        public.is_manager()
$$;


ALTER FUNCTION "public"."debug_me"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_before_treasury_log_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_current_balance NUMERIC;
BEGIN
    -- Get current balance of the box
    SELECT current_balance INTO v_current_balance FROM public.cash_boxes WHERE id = NEW.box_id;
    v_current_balance := COALESCE(v_current_balance, 0);
    IF NEW.type = 'ADJUSTMENT' THEN
        -- NEW.amount comes from frontend as "TOTAL COUNTED"
        -- We calculate the delta (descuadre) and save THAT as the amount.
        -- This way, current_balance + amount = NEW REAL BALANCE.
        NEW.amount := NEW.amount - v_current_balance;
        
        -- Add a note if not present
        IF NEW.notes IS NULL OR NEW.notes = '' THEN
            NEW.notes := 'Arqueo de caja (Descuadre: ' || NEW.amount || '€)';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_before_treasury_log_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_calculate_rounded_hours"("p_hours" numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
    v_integer_part numeric;
    v_decimal_part numeric;
    v_minutes numeric;
    v_fraction numeric;
BEGIN
    IF p_hours IS NULL THEN RETURN 0; END IF;
    
    -- Math.floor equivalente en PostgreSQL
    v_integer_part := floor(p_hours);
    v_decimal_part := p_hours - v_integer_part;
    v_minutes := v_decimal_part * 60;
    
    IF v_minutes <= 20 THEN
        v_fraction := 0.0;
    ELSIF v_minutes <= 50 THEN
        v_fraction := 0.5;
    ELSE
        v_fraction := 1.0;
    END IF;
    
    RETURN v_integer_part + v_fraction;
END;
$$;


ALTER FUNCTION "public"."fn_calculate_rounded_hours"("p_hours" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_on_cash_closing_confirmed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_op_box_id UUID;
BEGIN
    SELECT id INTO v_op_box_id FROM cash_boxes WHERE type = 'operational' LIMIT 1;
    
    IF TG_OP = 'INSERT' THEN
        IF v_op_box_id IS NOT NULL AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            VALUES (v_op_box_id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 'Cierre TPV: ' || NEW.closing_date, NEW.id);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE treasury_log SET amount = NEW.cash_withdrawn, breakdown = NEW.breakdown, notes = 'Cierre TPV: ' || NEW.closing_date || ' (Editado)'
        WHERE closing_id = NEW.id;
        
        IF NOT FOUND AND v_op_box_id IS NOT NULL AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            VALUES (v_op_box_id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 'Cierre TPV: ' || NEW.closing_date || ' (Editado)', NEW.id);
        ELSIF NEW.cash_withdrawn <= 0 THEN
            DELETE FROM treasury_log WHERE closing_id = NEW.id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM treasury_log WHERE closing_id = OLD.id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."fn_on_cash_closing_confirmed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_on_cash_closing_confirmed_v2"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            SELECT id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 'Cierre TPV: ' || NEW.closing_date, NEW.id
            FROM cash_boxes WHERE type = 'operational' LIMIT 1;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Simplemente actualizamos la fila existente. El trigger fn_sync_box_inventory_v2 hará el resto.
        UPDATE treasury_log 
        SET amount = NEW.cash_withdrawn, 
            breakdown = NEW.breakdown, 
            notes = 'Cierre TPV: ' || NEW.closing_date || ' (Editado)'
        WHERE closing_id = NEW.id;
        
        -- Si no existía y ahora hay monto, insertar
        IF NOT FOUND AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            SELECT id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 'Cierre TPV: ' || NEW.closing_date, NEW.id
            FROM cash_boxes WHERE type = 'operational' LIMIT 1;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM treasury_log WHERE closing_id = OLD.id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."fn_on_cash_closing_confirmed_v2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_recalc_and_propagate_snapshots"("p_user_id" "uuid", "p_start_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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

    -- Detectar fecha de incorporación real
    SELECT MIN(clock_in::date) INTO v_first_clock_in
    FROM public.time_logs WHERE user_id = p_user_id;

    IF v_first_clock_in IS NULL THEN
        RETURN;
    END IF;

    v_current_week := public.get_iso_week_start(GREATEST(p_start_date, v_first_clock_in));

    -- B. Definir rango de fechas
    v_end_date := public.get_iso_week_start(current_date) + 7;

    -- Limpieza de seguridad: Borrar snapshots huérfanos
    DELETE FROM public.weekly_snapshots 
    WHERE user_id = p_user_id 
      AND week_start < public.get_iso_week_start(v_first_clock_in);

    -- C. BUCLE DE PROPAGACIÓN
    WHILE v_current_week <= v_end_date LOOP
        
        -- 1. Sumar Fichajes
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

        -- 3. Calcular Balance Semanal según Rol
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
                -- Si la semana N eligió "pagar", esas horas ya se pagaron. NO arrastrar.
                IF v_prev_prefer_stock THEN
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
$$;


ALTER FUNCTION "public"."fn_recalc_and_propagate_snapshots"("p_user_id" "uuid", "p_start_date" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_recalc_and_propagate_snapshots"("p_user_id" "uuid", "p_start_date" "date") IS 'Propagación de balances semanales. FIX 2026-03-17: Crédito positivo solo se arrastra si la semana anterior tenía prefer_stock=TRUE. Sincronización profiles.hours_balance pone 0 cuando no acumula y balance positivo.';



CREATE OR REPLACE FUNCTION "public"."fn_round_marbella_hours"("total_hours" numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."fn_round_marbella_hours"("total_hours" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_box_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    b_key TEXT;
    b_val INT;
    v_amount_delta NUMERIC := 0;
BEGIN
    -- A. APPLY CHANGES (INSERT ONLY for now as we prefer immutable logs)
    -- If it's an UPDATE/DELETE, we'd need more complex logic, but treasury_log is mostly append-only.
    IF TG_OP = 'INSERT' THEN
        -- 1. Update Inventory for IN/OUT/CLOSE/ADJUSTMENT
        IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
            
            -- If it's an ADJUSTMENT, we FIRST clear the previous inventory 
            -- because the audit "PREVAILS" (overwrites).
            IF NEW.type = 'ADJUSTMENT' THEN
                DELETE FROM public.cash_box_inventory WHERE box_id = NEW.box_id;
            END IF;
            -- Process breakdown (breakdown is always the NEW/TOTAL state for ADJUSTMENT)
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                IF NEW.type IN ('IN', 'CLOSE_ENTRY') THEN
                    INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                    VALUES (NEW.box_id, b_key::numeric, b_val)
                    ON CONFLICT (box_id, denomination) 
                    DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
                
                ELSIF NEW.type = 'OUT' THEN
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity - b_val
                    WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                
                ELSIF NEW.type = 'ADJUSTMENT' THEN
                    -- For adjustments, we just insert the new counts (we already deleted old ones)
                    IF b_val > 0 THEN
                        INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                        VALUES (NEW.box_id, b_key::numeric, b_val);
                    END IF;
                END IF;
            END LOOP;
            
            -- 2. Update Box Balance
            -- Since NEW.amount is now ALWAYS the DELTA (thanks to BEFORE trigger for ADJUSTMENT),
            -- we just add it to the current balance.
            -- Note: OUT amount should be sent as positive from frontend if we handle signs here,
            -- or sent as negative. Usually treasury_log.amount is absolute.
            v_amount_delta := CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END;
            
            UPDATE public.cash_boxes SET current_balance = current_balance + v_amount_delta WHERE id = NEW.box_id;
        ELSIF NEW.type = 'SWAP' THEN
            -- Process IN part
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'in') LOOP
                INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                VALUES (NEW.box_id, b_key::numeric, b_val)
                ON CONFLICT (box_id, denomination) 
                DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
            END LOOP;
            -- Process OUT part
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'out') LOOP
                UPDATE public.cash_box_inventory 
                SET quantity = quantity - b_val
                WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
            END LOOP;
            -- No balance change for SWAP
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_sync_box_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_box_inventory_v2"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    b_key TEXT;
    b_val INT;
    v_theoretical_balance NUMERIC;
BEGIN
    -- A. REVERSAR CAMBIOS ANTERIORES (Update o Delete)
    -- Nota: Reversar un ADJUSTMENT (auditoría) es complejo porque es un snapshot.
    -- Por simplicidad, este motor atómico asume que los deltas son reversibles,
    -- pero los arqueos son "checkpoints". Borrar un arqueo NO restaura el inventario previo.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
            -- Reversar Inventario (Deltas)
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown) LOOP
                IF OLD.type IN ('IN', 'CLOSE_ENTRY') THEN
                    UPDATE cash_box_inventory 
                    SET quantity = quantity - b_val
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                ELSIF OLD.type = 'OUT' THEN
                    UPDATE cash_box_inventory 
                    SET quantity = quantity + b_val
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                END IF;
            END LOOP;
            
            -- Reversar Balance (Deltas)
            UPDATE cash_boxes 
            SET current_balance = current_balance + (CASE WHEN OLD.type = 'OUT' THEN OLD.amount ELSE -OLD.amount END)
            WHERE id = OLD.box_id;
        END IF;
    END IF;

    -- B. APLICAR NUEVOS CAMBIOS (Insert o Update)
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.type = 'ADJUSTMENT' THEN
            -- 1. ARQUEO (SNAPSHOT): Overwrite
            -- Reset inventory for this box first? 
            -- No, just update the specific denominations provided. (Usually Arqueo provides all).
            -- Protocolo: El Arqueo SOBREESCRIBE las cantidades.
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                VALUES (NEW.box_id, b_key::numeric, b_val)
                ON CONFLICT (box_id, denomination) 
                DO UPDATE SET quantity = EXCLUDED.quantity;
            END LOOP;
            
            -- Actualizar Balance Global al monto contado
            UPDATE cash_boxes SET current_balance = NEW.amount WHERE id = NEW.box_id;

        ELSIF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
            -- 2. FLUJO (DELTA): Accumulate
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                IF NEW.type IN ('IN', 'CLOSE_ENTRY') THEN
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (NEW.box_id, b_key::numeric, b_val)
                    ON CONFLICT (box_id, denomination) 
                    DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
                ELSIF NEW.type = 'OUT' THEN
                    UPDATE cash_box_inventory 
                    SET quantity = quantity - b_val
                    WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                END IF;
            END LOOP;
            
            -- Actualizar Balance (Delta)
            UPDATE cash_boxes 
            SET current_balance = current_balance + (CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END)
            WHERE id = NEW.box_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."fn_sync_box_inventory_v2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_box_inventory_v3"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    b_key TEXT;
    b_val INT;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
            IF OLD.breakdown IS NOT NULL AND OLD.breakdown != '{}'::jsonb THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown) LOOP
                    IF OLD.type IN ('IN', 'CLOSE_ENTRY') THEN
                        UPDATE cash_box_inventory SET quantity = quantity - b_val
                        WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                    ELSE
                        UPDATE cash_box_inventory SET quantity = quantity + b_val
                        WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                    END IF;
                END LOOP;
            END IF;
            UPDATE cash_boxes SET current_balance = current_balance + (CASE WHEN OLD.type = 'OUT' THEN OLD.amount ELSE -OLD.amount END)
            WHERE id = OLD.box_id;
        ELSIF OLD.type = 'ADJUSTMENT' THEN
            NULL;
        END IF;
    END IF;

    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
            IF NEW.breakdown IS NOT NULL AND NEW.breakdown != '{}'::jsonb THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                    IF NEW.type IN ('IN', 'CLOSE_ENTRY') THEN
                        INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                        VALUES (NEW.box_id, b_key::numeric, b_val)
                        ON CONFLICT (box_id, denomination)
                        DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
                    ELSIF NEW.type = 'OUT' THEN
                        UPDATE cash_box_inventory SET quantity = quantity - b_val
                        WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                    END IF;
                END LOOP;
            END IF;
            UPDATE cash_boxes SET current_balance = current_balance + (CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END)
            WHERE id = NEW.box_id;
        ELSIF NEW.type = 'ADJUSTMENT' THEN
            IF NEW.breakdown IS NOT NULL AND NEW.breakdown != '{}'::jsonb THEN
                DELETE FROM cash_box_inventory WHERE box_id = NEW.box_id;
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                    IF b_val::int > 0 THEN
                        INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                        VALUES (NEW.box_id, b_key::numeric, b_val::int);
                    END IF;
                END LOOP;
            END IF;
            UPDATE cash_boxes SET current_balance = NEW.amount WHERE id = NEW.box_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."fn_sync_box_inventory_v3"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_cash_box_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    key_val text;
    qty numeric;
    denom numeric;
BEGIN
    -- Handle DELETE or UPDATE (revert old impact)
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        -- If it was IN or CLOSE_ENTRY, subtract the old breakdown
        IF OLD.type IN ('IN', 'CLOSE_ENTRY') AND OLD.breakdown IS NOT NULL THEN
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(OLD.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = quantity - qty
                WHERE box_id = OLD.box_id AND denomination = denom;
            END LOOP;
        
        -- If it was OUT, add back the old breakdown
        ELSIF OLD.type = 'OUT' AND OLD.breakdown IS NOT NULL THEN
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(OLD.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = quantity + qty
                WHERE box_id = OLD.box_id AND denomination = denom;
            END LOOP;
            
        -- If it was SWAP, revert the in/out
        ELSIF OLD.type = 'SWAP' AND OLD.breakdown IS NOT NULL THEN
            -- Revert 'in' (subtract what came in)
            IF OLD.breakdown ? 'in' THEN
                FOR key_val, qty IN SELECT * FROM jsonb_each_text(OLD.breakdown->'in')
                LOOP
                    denom := key_val::numeric;
                    qty := qty::numeric;
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity - qty
                    WHERE box_id = OLD.box_id AND denomination = denom;
                END LOOP;
            END IF;
            -- Revert 'out' (add back what went out)
            IF OLD.breakdown ? 'out' THEN
                FOR key_val, qty IN SELECT * FROM jsonb_each_text(OLD.breakdown->'out')
                LOOP
                    denom := key_val::numeric;
                    qty := qty::numeric;
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity + qty
                    WHERE box_id = OLD.box_id AND denomination = denom;
                END LOOP;
            END IF;
            
        -- Arqueos (ADJUSTMENT) overwrites, so reverting a delete is complicated. Usually we don't delete arqueos.
        END IF;
    END IF;
    -- Handle INSERT or UPDATE (apply new impact)
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        
        -- Default to 0 values if row doesn't exist for standard denominations before adding/subtracting
        IF NEW.type IN ('IN', 'CLOSE_ENTRY', 'OUT', 'SWAP') THEN
            INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
            SELECT NEW.box_id, unnest(ARRAY[500,200,100,50,20,10,5,2,1,0.50,0.20,0.10,0.05,0.02,0.01]::numeric[]), 0
            ON CONFLICT (box_id, denomination) DO NOTHING;
        END IF;
        IF NEW.type IN ('IN', 'CLOSE_ENTRY') AND NEW.breakdown IS NOT NULL THEN
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = quantity + qty
                WHERE box_id = NEW.box_id AND denomination = denom;
            END LOOP;
            
        ELSIF NEW.type = 'OUT' AND NEW.breakdown IS NOT NULL THEN
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = quantity - qty
                WHERE box_id = NEW.box_id AND denomination = denom;
            END LOOP;
            
        ELSIF NEW.type = 'SWAP' AND NEW.breakdown IS NOT NULL THEN
            -- Apply 'in'
            IF NEW.breakdown ? 'in' THEN
                FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown->'in')
                LOOP
                    denom := key_val::numeric;
                    qty := qty::numeric;
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity + qty
                    WHERE box_id = NEW.box_id AND denomination = denom;
                END LOOP;
            END IF;
            -- Apply 'out'
            IF NEW.breakdown ? 'out' THEN
                FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown->'out')
                LOOP
                    denom := key_val::numeric;
                    qty := qty::numeric;
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity - qty
                    WHERE box_id = NEW.box_id AND denomination = denom;
                END LOOP;
            END IF;
        ELSIF NEW.type = 'ADJUSTMENT' AND NEW.breakdown IS NOT NULL THEN
            -- For Arqueo (Adjustments), the breakdown IS the new absolute state of the box
            -- First, ensure all default denominations exist for this box setting them to 0
            INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
            SELECT NEW.box_id, unnest(ARRAY[500,200,100,50,20,10,5,2,1,0.50,0.20,0.10,0.05,0.02,0.01]::numeric[]), 0
            ON CONFLICT (box_id, denomination) DO UPDATE SET quantity = 0;
            
            -- Then, update with the specific counts from the Arqueo
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = qty
                WHERE box_id = NEW.box_id AND denomination = denom;
            END LOOP;
        END IF;
    END IF;
    -- Return appropriately
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_sync_cash_box_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_sync_cash_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    k text;
    v integer;
BEGIN
    -- Si no hay desglose de billetes, no tocamos el inventario físico
    IF NEW.breakdown IS NULL OR NEW.breakdown = '{}'::jsonb THEN
        RETURN NEW;
    END IF;

    IF NEW.type = 'ADJUSTMENT' THEN
        -- Arqueo: Sobrescribir la realidad física por completo
        UPDATE public.cash_box_inventory SET quantity = 0 WHERE box_id = NEW.box_id;
        
        FOR k, v IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
            INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
            VALUES (NEW.box_id, k::numeric, v::integer)
            ON CONFLICT (box_id, denomination) DO UPDATE SET quantity = EXCLUDED.quantity;
        END LOOP;

    ELSIF NEW.type IN ('IN', 'CLOSE_ENTRY') THEN
        -- Entrada: Sumar billetes
        FOR k, v IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
            UPDATE public.cash_box_inventory
            SET quantity = quantity + v::integer
            WHERE box_id = NEW.box_id AND denomination = k::numeric;
        END LOOP;

    ELSIF NEW.type = 'OUT' THEN
        -- Salida: Restar billetes
        FOR k, v IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
            UPDATE public.cash_box_inventory
            SET quantity = quantity - v::integer
            WHERE box_id = NEW.box_id AND denomination = k::numeric;
        END LOOP;
    END IF;

    -- Actualizar el caché de dinero total físico de la tabla cash_boxes
    UPDATE public.cash_boxes
    SET current_balance = (
        SELECT COALESCE(SUM(denomination * quantity), 0)
        FROM public.cash_box_inventory
        WHERE box_id = NEW.box_id
    )
    WHERE id = NEW.box_id;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_sync_cash_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_trigger_propagate_from_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Si cambia el estado de pago, recalcular desde la SEMANA SIGUIENTE
    -- para ver si se limpia la deuda o no.
    PERFORM public.fn_recalc_and_propagate_snapshots(NEW.user_id, NEW.week_start + 7);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_trigger_propagate_from_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cash_closings_summary"("p_start_date" "date", "p_end_date" "date") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT jsonb_build_object(
    'totalNet', COALESCE(SUM(net_sales), 0),
    'totalGross', COALESCE(SUM(tpv_sales), 0),
    'totalTickets', COALESCE(SUM(tickets_count), 0),
    'avgTicket', CASE WHEN SUM(tickets_count) > 0 THEN COALESCE(SUM(tpv_sales) / SUM(tickets_count), 0) ELSE 0 END,
    'count', COUNT(id)
  )
  FROM public.cash_closings
  WHERE closing_date >= p_start_date AND closing_date <= p_end_date;
$$;


ALTER FUNCTION "public"."get_cash_closings_summary"("p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_labor_cost"("p_target_date" "date") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_total_cost NUMERIC := 0;
    v_user record;
    v_hours NUMERIC;
    v_daily_contracted NUMERIC;
    v_reg_price NUMERIC;
    v_over_price NUMERIC;
BEGIN
    -- Iteramos sobre los perfiles para calcular el coste diario
    FOR v_user IN SELECT id, role, contracted_hours_weekly, regular_cost_per_hour, overtime_cost_per_hour FROM public.profiles LOOP
        v_daily_contracted := COALESCE(v_user.contracted_hours_weekly, 0) / 5.0;
        v_reg_price := COALESCE(v_user.regular_cost_per_hour, 0);
        v_over_price := COALESCE(v_user.overtime_cost_per_hour, v_reg_price);

        -- Obtenemos y redondeamos las horas trabajadas en la fecha objetivo para este usuario
        SELECT COALESCE(SUM(public.fn_calculate_rounded_hours(total_hours)), 0)
        INTO v_hours
        FROM public.time_logs
        WHERE user_id = v_user.id AND DATE(clock_in) = p_target_date;

        -- Lógica de cálculo de coste (idéntica al frontend)
        IF v_user.role = 'manager' THEN
            v_total_cost := v_total_cost + (v_daily_contracted * v_reg_price) + (v_hours * v_over_price);
        ELSE
            IF v_hours > 0 THEN
                IF v_hours > v_daily_contracted THEN
                    v_total_cost := v_total_cost + (v_daily_contracted * v_reg_price) + ((v_hours - v_daily_contracted) * v_over_price);
                ELSE
                    v_total_cost := v_total_cost + (v_hours * v_reg_price);
                END IF;
            END IF;
        END IF;
    END LOOP;

    RETURN v_total_cost;
END;
$$;


ALTER FUNCTION "public"."get_daily_labor_cost"("p_target_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_sales_stats"("target_date" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT jsonb_build_object(
    'total_ventas', COALESCE(SUM(total_documento), 0),
    'ticket_medio', CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_documento) / COUNT(*), 0) ELSE 0 END,
    'recuento_tickets', COUNT(*)
  )
  FROM public.tickets_marbella
  WHERE fecha = target_date;
$$;


ALTER FUNCTION "public"."get_daily_sales_stats"("target_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_employee_role"("user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role
  FROM employees
  WHERE auth_user_id = user_id
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_employee_role"("user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_employee_role"("user_id" "uuid") IS 'Returns employee role (manager/chef/staff) for given auth user ID';



CREATE OR REPLACE FUNCTION "public"."get_hourly_sales"("p_start_date" "date", "p_end_date" "date") RETURNS TABLE("fecha" "date", "hora" integer, "total" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (t.fecha)::date,
        EXTRACT(HOUR FROM (t.hora_cierre::time))::INT as hora,
        ROUND(SUM(t.total_documento)::numeric, 2) as total
    FROM tickets_marbella t
    WHERE (t.fecha)::date >= p_start_date AND (t.fecha)::date <= p_end_date
    GROUP BY (t.fecha)::date, EXTRACT(HOUR FROM (t.hora_cierre::time))
    ORDER BY (t.fecha)::date, hora;
END;
$$;


ALTER FUNCTION "public"."get_hourly_sales"("p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_iso_week_start"("d" "date") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
    RETURN date_trunc('week', d)::date;
END;
$$;


ALTER FUNCTION "public"."get_iso_week_start"("d" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_manager_ledger_balance"() RETURNS numeric
    LANGUAGE "sql"
    AS $$
SELECT COALESCE(
    SUM(CASE WHEN movement_type = 'entrada' THEN amount ELSE -amount END),
    0.00
)
FROM public.manager_ledger;
$$;


ALTER FUNCTION "public"."get_manager_ledger_balance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_monthly_timesheet"("p_user_id" "uuid", "p_year" integer, "p_month" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
    v_result JSONB;
    v_profile RECORD;
    v_eff_contract NUMERIC;
BEGIN
    -- 1. Obtener perfil
    SELECT contracted_hours_weekly, is_fixed_salary, prefer_stock_hours, hours_balance, overtime_cost_per_hour, role
    INTO v_profile
    FROM public.profiles
    WHERE id = p_user_id;

    -- 2. Calcular contrato efectivo (Tu regla de negocio: Agosto, Manager o Fijo = 0)
    IF p_month = 8 OR v_profile.role = 'manager' OR v_profile.is_fixed_salary THEN
        v_eff_contract := 0;
    ELSE
        v_eff_contract := COALESCE(v_profile.contracted_hours_weekly, 0);
    END IF;

    -- 3. Límites del calendario
    v_start_date := DATE_TRUNC('week', MAKE_DATE(p_year, p_month, 1))::DATE;
    v_end_date := (DATE_TRUNC('week', MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month - 1 day') + INTERVAL '6 days')::DATE;

    WITH RECURSIVE
    calendar_days AS (
        SELECT generate_series(v_start_date, v_end_date, '1 day'::interval)::date AS d_date
    ),
    daily_logs AS (
        SELECT
            cd.d_date,
            DATE_TRUNC('week', cd.d_date)::date AS week_start,
            tl.id AS log_id,
            tl.clock_in,
            tl.clock_out,
            COALESCE(tl.total_hours, 0) AS daily_hours,
            tl.event_type
        FROM calendar_days cd
        LEFT JOIN public.time_logs tl 
            ON DATE(tl.clock_in AT TIME ZONE 'Europe/Madrid') = cd.d_date 
            AND tl.user_id = p_user_id
    ),
    running_logs AS (
        -- Suma acumulada de horas en la semana para detectar cuándo se supera el contrato
        SELECT 
            *,
            SUM(daily_hours) OVER (PARTITION BY week_start ORDER BY d_date) AS running_weekly_hours
        FROM daily_logs
    ),
    calculated_days AS (
        -- Asignación de horas extra por día exacto
        SELECT 
            *,
            CASE 
                WHEN (running_weekly_hours - daily_hours) >= v_eff_contract THEN daily_hours
                WHEN running_weekly_hours > v_eff_contract THEN running_weekly_hours - v_eff_contract
                ELSE 0
            END AS daily_extra_hours
        FROM running_logs
    ),
    aggregated_days AS (
        SELECT
            week_start,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'date', d_date,
                    'dayName', CASE EXTRACT(ISODOW FROM d_date)
                                  WHEN 1 THEN 'LUN' WHEN 2 THEN 'MAR' WHEN 3 THEN 'MIE'
                                  WHEN 4 THEN 'JUE' WHEN 5 THEN 'VIE' WHEN 6 THEN 'SAB' WHEN 7 THEN 'DOM' END,
                    'dayNumber', EXTRACT(DAY FROM d_date),
                    'hasLog', log_id IS NOT NULL,
                    'clockIn', TO_CHAR(clock_in AT TIME ZONE 'Europe/Madrid', 'HH24:MI'),
                    'clockOut', TO_CHAR(clock_out AT TIME ZONE 'Europe/Madrid', 'HH24:MI'),
                    'totalHours', daily_hours,
                    'extraHours', daily_extra_hours,
                    'eventType', COALESCE(event_type, 'regular'),
                    'isToday', d_date = CURRENT_DATE
                ) ORDER BY d_date
            ) AS days_json,
            SUM(daily_hours) AS week_total_hours
        FROM calculated_days
        GROUP BY week_start
    ),
    weekly_data AS (
        SELECT
            ad.week_start,
            EXTRACT(WEEK FROM ad.week_start) AS week_number,
            ad.days_json,
            ad.week_total_hours,
            ws.total_hours AS snap_total,
            ws.pending_balance AS snap_start_balance,
            ws.balance_hours AS snap_balance,
            ws.final_balance AS snap_final_balance,
            ws.is_paid
        FROM aggregated_days ad
        LEFT JOIN public.weekly_snapshots ws 
            ON ws.week_start = ad.week_start 
            AND ws.user_id = p_user_id
    )
    SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
            'weekNumber', week_number,
            'startDate', week_start,
            'isCurrentWeek', week_start = DATE_TRUNC('week', CURRENT_DATE)::date,
            'days', days_json,
            'summary', JSONB_BUILD_OBJECT(
                'totalHours', COALESCE(snap_total, week_total_hours),
                'startBalance', COALESCE(snap_start_balance, CASE WHEN NOT COALESCE(v_profile.prefer_stock_hours, false) THEN 0 ELSE COALESCE(v_profile.hours_balance, 0) END),
                'weeklyBalance', COALESCE(snap_balance, week_total_hours - v_eff_contract),
                'finalBalance', COALESCE(snap_final_balance, 0),
                'estimatedValue', COALESCE(snap_final_balance, 0) * COALESCE(v_profile.overtime_cost_per_hour, 0),
                'isPaid', COALESCE(is_paid, false)
            )
        ) ORDER BY week_start
    ) INTO v_result
    FROM weekly_data;

    RETURN COALESCE(v_result, '[]');
END;
$$;


ALTER FUNCTION "public"."get_monthly_timesheet"("p_user_id" "uuid", "p_year" integer, "p_month" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_employee_id"() RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT id FROM employees WHERE auth_user_id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_employee_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_operational_box_status"() RETURNS TABLE("box_id" "uuid", "box_name" "text", "theoretical_balance" numeric, "physical_balance" numeric, "difference" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_box_id UUID;
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


ALTER FUNCTION "public"."get_operational_box_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_product_sales_ranking"("p_start_date" "date", "p_end_date" "date") RETURNS TABLE("nombre_articulo" "text", "cantidad_total" numeric, "precio_medio" numeric, "total_ingresos" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(a.nombre, 'Artículo Desconocido (' || tl.articulo_id || ')') as nombre_articulo,
        SUM(tl.unidades) as cantidad_total,
        CASE WHEN SUM(tl.unidades) > 0 THEN SUM(tl.importe_total) / SUM(tl.unidades) ELSE 0 END as precio_medio,
        SUM(tl.importe_total) as total_ingresos
    FROM ticket_lines_marbella tl
    LEFT JOIN bdp_articulos a ON a.id = tl.articulo_id
    WHERE tl.fecha_negocio >= p_start_date 
      AND tl.fecha_negocio <= p_end_date
    GROUP BY a.nombre, tl.articulo_id
    ORDER BY total_ingresos DESC;
END;
$$;


ALTER FUNCTION "public"."get_product_sales_ranking"("p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_theoretical_balance"("target_date" timestamp with time zone) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_balance NUMERIC;
BEGIN
    SELECT COALESCE(SUM(
        CASE 
            WHEN type IN ('IN', 'CLOSE_ENTRY') THEN amount 
            WHEN type = 'OUT' THEN -amount 
            ELSE 0 
        END
    ), 0) INTO v_balance
    FROM public.treasury_log
    WHERE created_at <= target_date;
    
    RETURN v_balance;
END;
$$;


ALTER FUNCTION "public"."get_theoretical_balance"("target_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ticket_lines"("p_numero_documento" "text") RETURNS TABLE("cantidad" numeric, "articulo_nombre" "text", "precio_unidad" numeric, "importe_total" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tl.unidades,
        COALESCE(a.nombre, 'Producto Desconocido'),
        tl.precio_unidad,
        tl.importe_total
    FROM ticket_lines_marbella tl
    LEFT JOIN bdp_articulos a ON tl.articulo_id = a.id
    WHERE tl.numero_documento = p_numero_documento
    ORDER BY tl.linea;
END;
$$;


ALTER FUNCTION "public"."get_ticket_lines"("p_numero_documento" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_treasury_period_summary"("p_box_id" "uuid" DEFAULT NULL::"uuid", "p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_end_date" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("income" numeric, "expense" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(CASE WHEN type IN ('IN', 'CLOSE_ENTRY') THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END), 0)
    FROM public.treasury_log
    WHERE type IN ('IN', 'OUT', 'CLOSE_ENTRY')
    AND (p_box_id IS NULL OR box_id = p_box_id)
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);
END;
$$;


ALTER FUNCTION "public"."get_treasury_period_summary"("p_box_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_weekly_worker_stats"("p_start_date" "date", "p_end_date" "date", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
    v_result jsonb;
BEGIN
    WITH weeks_in_range AS (
        SELECT DISTINCT date_trunc('week', d::timestamp)::date AS week_start
        FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d
    ),
    weekly_user_logs AS (
        SELECT 
            date_trunc('week', clock_in AT TIME ZONE 'Europe/Madrid')::date AS week_start,
            user_id,
            SUM(public.fn_round_marbella_hours(total_hours)) AS week_logs_sum
        FROM public.time_logs
        WHERE date_trunc('week', clock_in AT TIME ZONE 'Europe/Madrid')::date IN (SELECT week_start FROM weeks_in_range)
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
            COALESCE(s.prefer_stock_hours_override, p.prefer_stock_hours, false) as prefer_stock,
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
                    'totalCost', CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END,
                    'regularCost', 0,
                    'overtimeCost', CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END,
                    'isPaid', is_paid,
                    'preferStock', prefer_stock
                ) ORDER BY (CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END) DESC
            ) as staff_list,
            SUM(CASE WHEN final_balance > 0 AND NOT prefer_stock THEN (final_balance * over_price) ELSE 0 END) as week_overtime_cost,
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
$$;


ALTER FUNCTION "public"."get_weekly_worker_stats"("p_start_date" "date", "p_end_date" "date", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_worker_weekly_log_grid"("p_user_id" "uuid", "p_start_date" "date", "p_contracted_hours" numeric DEFAULT 40) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_worker_weekly_log_grid"("p_user_id" "uuid", "p_start_date" "date", "p_contracted_hours" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_working_date"("ts" timestamp with time zone) RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    AS $$
    SELECT (ts AT TIME ZONE 'Europe/Madrid')::DATE;
$$;


ALTER FUNCTION "public"."get_working_date"("ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_invoice_line"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    found_ingredient_id UUID;
    v_conversion_factor NUMERIC;
BEGIN
    -- Intentar encontrar un mapeo existente para este proveedor y este nombre de producto
    -- Nota: suppliers.id es BIGINT en tu DB
    SELECT ingredient_id, conversion_factor 
    INTO found_ingredient_id, v_conversion_factor
    FROM public.supplier_item_mappings
    WHERE supplier_id = (SELECT supplier_id FROM public.purchase_invoices WHERE id = NEW.invoice_id)
      AND supplier_item_name = NEW.original_name;

    -- Si encontramos el mapeo, actualizamos la línea y el precio del ingrediente
    IF found_ingredient_id IS NOT NULL THEN
        -- Actualizar la línea de la factura con el ID del ingrediente
        UPDATE public.purchase_invoice_lines
        SET mapped_ingredient_id = found_ingredient_id,
            status = 'mapped'
        WHERE id = NEW.id;

        -- Actualizar el precio actual en la tabla de ingredientes (precio_unitario / factor)
        -- Ejemplo: Si el precio es 24€ y el factor es 24 (caja), el ingrediente sube a 1€
        UPDATE public.ingredients
        SET current_price = (NEW.unit_price / COALESCE(NULLIF(v_conversion_factor, 0), 1)),
            updated_at = NOW()
        WHERE id = found_ingredient_id;
        
        -- Registrar en el historial de precios (usando tu tabla existente ingredient_price_history)
        INSERT INTO public.ingredient_price_history (ingredient_id, old_price, new_price, changed_at)
        SELECT id, current_price, (NEW.unit_price / COALESCE(NULLIF(v_conversion_factor, 0), 1)), NOW()
        FROM public.ingredients WHERE id = found_ingredient_id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_invoice_line"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."init_box_inventory"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    denom NUMERIC;
BEGIN
    FOREACH denom IN ARRAY ARRAY[500, 200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01]
    LOOP
        INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
        VALUES (NEW.id, denom, 0);
    END LOOP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."init_box_inventory"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_manager"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM employees
        WHERE auth_user_id = auth.uid()
        AND role = 'manager'
    );
$$;


ALTER FUNCTION "public"."is_manager"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_price_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.current_price != NEW.current_price THEN
    INSERT INTO ingredient_price_history (ingredient_id, old_price, new_price)
    VALUES (NEW.id, OLD.current_price, NEW.current_price);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_price_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_snapshots_on_log_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
$$;


ALTER FUNCTION "public"."recalc_snapshots_on_log_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_recipe_financials"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ 
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY recipe_financials;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."refresh_recipe_financials"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_recalculate_all_balances"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_first_log_date timestamp;
    v_current_monday date;
    v_current_week_monday date;
    v_next_monday date;
    v_week_end_str date;
    v_user record;
    v_existing record;
    v_hours_worked numeric;
    v_limit numeric;
    v_weekly_balance numeric;
    v_pending_from_prev numeric;
    v_final_balance numeric;
    v_carry_over_balance numeric;
    v_was_paid boolean;
BEGIN
    -- 1. Obtener la fecha del primer fichaje histórico
    SELECT clock_in INTO v_first_log_date FROM public.time_logs ORDER BY clock_in ASC LIMIT 1;
    IF v_first_log_date IS NULL THEN
        RETURN '{"success": true, "message": "No hay fichajes que procesar."}'::jsonb;
    END IF;
    
    -- Ajustar a Lunes
    v_current_monday := date_trunc('week', v_first_log_date)::date;
    v_current_week_monday := date_trunc('week', current_date)::date;
    
    -- 2. Crear mapa de estado en memoria (Temp Table)
    CREATE TEMP TABLE tmp_user_state (
        user_id uuid PRIMARY KEY,
        role text,
        contracted_hours_weekly numeric,
        prefer_stock_hours boolean,
        is_fixed_salary boolean,
        start_date date,
        current_balance numeric DEFAULT 0
    ) ON COMMIT DROP;
    
    INSERT INTO tmp_user_state (user_id, role, contracted_hours_weekly, prefer_stock_hours, is_fixed_salary)
    SELECT id, role, contracted_hours_weekly, prefer_stock_hours, is_fixed_salary FROM public.profiles;
    
    -- Auto-discovery de fecha de inicio por trabajador
    UPDATE tmp_user_state t
    SET start_date = (
        SELECT date_trunc('day', clock_in)::date 
        FROM public.time_logs 
        WHERE user_id = t.user_id 
        ORDER BY clock_in ASC LIMIT 1
    );
    
    -- 3. Bucle Histórico Transaccional
    WHILE v_current_monday < v_current_week_monday LOOP
        v_next_monday := v_current_monday + interval '1 week';
        v_week_end_str := (v_next_monday - interval '1 day')::date;
        
        FOR v_user IN SELECT * FROM tmp_user_state LOOP
            -- Ignorar semanas antes de que el trabajador empezara
            IF v_user.start_date IS NULL OR v_week_end_str < v_user.start_date THEN
                DELETE FROM public.weekly_snapshots WHERE user_id = v_user.user_id AND week_start = v_current_monday::text;
                CONTINUE;
            END IF;
            
            -- Obtener y redondear horas de esta semana
            SELECT COALESCE(SUM(public.fn_calculate_rounded_hours(total_hours)), 0)
            INTO v_hours_worked
            FROM public.time_logs
            WHERE user_id = v_user.user_id 
              AND clock_in >= v_current_monday::timestamp
              AND clock_in < v_next_monday::timestamp;
              
            -- Obtener snapshot existente (priorizar overrides)
            v_existing := NULL;
            SELECT contracted_hours_snapshot, is_paid INTO v_existing
            FROM public.weekly_snapshots
            WHERE user_id = v_user.user_id AND week_start = v_current_monday::text;
            
            -- Lógica estricta de límites
            IF v_user.contracted_hours_weekly = 0 THEN
                v_limit := 0;
            ELSIF v_existing.contracted_hours_snapshot IS NOT NULL THEN
                v_limit := v_existing.contracted_hours_snapshot;
            ELSIF v_user.contracted_hours_weekly IS NOT NULL THEN
                v_limit := v_user.contracted_hours_weekly;
            ELSE
                v_limit := 0;
            END IF;
            
            -- Balance Semanal (Agosto = mes 8)
            IF EXTRACT(MONTH FROM v_current_monday) = 8 OR v_user.role = 'manager' OR COALESCE(v_user.is_fixed_salary, false) THEN
                v_weekly_balance := v_hours_worked;
            ELSE
                v_weekly_balance := v_hours_worked - v_limit;
            END IF;
            v_weekly_balance := public.fn_calculate_rounded_hours(v_weekly_balance);
            
            -- Arrastre previo (Solo negativo si no hay stock_hours)
            v_pending_from_prev := v_user.current_balance;
            IF NOT COALESCE(v_user.prefer_stock_hours, false) AND v_pending_from_prev > 0 THEN
                v_pending_from_prev := 0;
            END IF;
            
            v_was_paid := COALESCE(v_existing.is_paid, false);
            v_final_balance := v_pending_from_prev + v_weekly_balance;
            
            -- Limpiar arrastre si hubo pago del sobrante
            v_carry_over_balance := v_final_balance;
            IF v_was_paid AND v_weekly_balance > 0 THEN
                v_carry_over_balance := v_pending_from_prev;
            END IF;
            
            -- Actualizar mapa stateful
            UPDATE tmp_user_state SET current_balance = v_carry_over_balance WHERE user_id = v_user.user_id;
            
            -- Upsert Snapshot Atómico
            INSERT INTO public.weekly_snapshots (
                user_id, week_start, week_end, contracted_hours_snapshot, 
                total_hours, balance_hours, pending_balance, final_balance, is_paid
            ) VALUES (
                v_user.user_id, v_current_monday::text, v_week_end_str::text, v_limit,
                v_hours_worked, v_weekly_balance, v_pending_from_prev, v_final_balance, v_was_paid
            ) ON CONFLICT (user_id, week_start) DO UPDATE SET
                week_end = EXCLUDED.week_end,
                contracted_hours_snapshot = EXCLUDED.contracted_hours_snapshot,
                total_hours = EXCLUDED.total_hours,
                balance_hours = EXCLUDED.balance_hours,
                pending_balance = EXCLUDED.pending_balance,
                final_balance = EXCLUDED.final_balance,
                is_paid = EXCLUDED.is_paid;
                
        END LOOP;
        
        v_current_monday := v_next_monday;
    END LOOP;
    
    RETURN '{"success": true, "message": "Recálculo global completado con éxito vía DB transaccional."}'::jsonb;
END;
$$;


ALTER FUNCTION "public"."rpc_recalculate_all_balances"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_weekly_target"("p_employee_id" "uuid", "p_week_start" "date", "p_new_target" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Insert/Update the target
  INSERT INTO weekly_balances (employee_id, week_start, target_hours)
  VALUES (p_employee_id, p_week_start, p_new_target)
  ON CONFLICT (employee_id, week_start)
  DO UPDATE SET 
    target_hours = EXCLUDED.target_hours,
    -- Recalculate balance strictly on new target
    balance_delta = weekly_balances.worked_hours - EXCLUDED.target_hours,
    updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."set_weekly_target"("p_employee_id" "uuid", "p_week_start" "date", "p_new_target" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ingredient_stock_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- ENTRADAS: Compras o Ajustes Positivos
  IF NEW.movement_type IN ('PURCHASE', 'ADJUSTMENT', 'INVENTORY_COUNT') THEN
    UPDATE ingredients 
    SET stock_current = COALESCE(stock_current, 0) + ABS(NEW.quantity) -- Suma siempre el absoluto
    WHERE id = NEW.ingredient_id;
  
  -- SALIDAS: Ventas o Mermas
  ELSIF NEW.movement_type IN ('SALE', 'WASTE') THEN
     UPDATE ingredients 
     SET stock_current = COALESCE(stock_current, 0) - ABS(NEW.quantity) -- Resta siempre el absoluto
     WHERE id = NEW.ingredient_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ingredient_stock_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_weekly_bank"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  target_emp UUID;
  target_ts TIMESTAMPTZ;
  wk_start DATE;
  
  default_target DECIMAL(10,2);
  current_target DECIMAL(10,2);
  total_mins INTEGER;
  calc_worked DECIMAL(10,2);
  calc_balance DECIMAL(10,2);
BEGIN
  -- 1. Identify Target
  IF (TG_OP = 'DELETE') THEN
    target_emp := OLD.employee_id;
    target_ts := OLD.clock_in;
  ELSE
    target_emp := NEW.employee_id;
    target_ts := NEW.clock_in;
  END IF;
  wk_start := DATE_TRUNC('week', target_ts)::DATE;
  -- 2. Ensure Weekly Record Exists (First time setup)
  -- If row doesn't exist, we create it using the Default Contract from Financials
  SELECT contracted_hours INTO default_target 
  FROM employee_financials WHERE employee_id = target_emp;
  
  IF default_target IS NULL THEN default_target := 40; END IF;
  INSERT INTO weekly_balances (employee_id, week_start, target_hours)
  VALUES (target_emp, wk_start, default_target)
  ON CONFLICT (employee_id, week_start) DO NOTHING;
  -- 3. Calculate WORKED HOURS (Sum of logs)
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (clock_out - clock_in)) / 60 -- Minutes
    - COALESCE(break_minutes, 0)
  ), 0)
  INTO total_mins
  FROM time_logs
  WHERE employee_id = target_emp
    AND clock_out IS NOT NULL
    AND DATE_TRUNC('week', clock_in)::DATE = wk_start;
  calc_worked := ROUND((total_mins::DECIMAL / 60.0), 2);
  -- 4. Calculate BALANCE (Based on the CURRENT stored target, allowing edits)
  SELECT target_hours INTO current_target
  FROM weekly_balances
  WHERE employee_id = target_emp AND week_start = wk_start;
  calc_balance := calc_worked - current_target;
  -- 5. Update the Bank
  UPDATE weekly_balances
  SET 
    worked_hours = calc_worked,
    balance_delta = calc_balance,
    updated_at = NOW()
  WHERE employee_id = target_emp AND week_start = wk_start;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_weekly_bank"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_call_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "duration_seconds" integer DEFAULT 0,
    "raw_transcript" "text",
    "summary" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_call_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "text_content" "text",
    "media_url" "text",
    "voice_call_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_chat_messages_content_type_check" CHECK (("content_type" = ANY (ARRAY['text'::"text", 'image'::"text", 'audio_note'::"text", 'call_transcript'::"text"]))),
    CONSTRAINT "ai_chat_messages_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text", 'data'::"text"])))
);


ALTER TABLE "public"."ai_chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_chat_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."ai_chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bdp_articulos" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "departamento_id" integer,
    "familia_id" integer,
    "coste" numeric(10,4),
    "precio_base" numeric(10,2)
);


ALTER TABLE "public"."bdp_articulos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bdp_departamentos" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL
);


ALTER TABLE "public"."bdp_departamentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bdp_familias" (
    "id" integer NOT NULL,
    "departamento_id" integer,
    "nombre" "text" NOT NULL
);


ALTER TABLE "public"."bdp_familias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_box_inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "denomination" numeric NOT NULL,
    "quantity" integer DEFAULT 0
);


ALTER TABLE "public"."cash_box_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_boxes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "current_balance" numeric DEFAULT 0,
    "target_balance" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cash_boxes_type_check" CHECK (("type" = ANY (ARRAY['operational'::"text", 'change'::"text"])))
);


ALTER TABLE "public"."cash_boxes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_closings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "closing_date" "date" NOT NULL,
    "shift" character varying(50),
    "tpv_terminal" character varying(50),
    "tpv_sales" numeric(10,2) NOT NULL,
    "net_sales" numeric(10,2),
    "cash_expected" numeric(10,2),
    "cash_counted" numeric(10,2),
    "card_payments" numeric(10,2),
    "pending_payments" numeric(10,2),
    "collections" numeric(10,2),
    "difference" numeric(10,2),
    "status" character varying(50) DEFAULT 'open'::character varying,
    "weather" character varying(100),
    "operations_count" integer,
    "processed" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "sales_card" numeric DEFAULT 0,
    "sales_pending" numeric DEFAULT 0,
    "debt_recovered" numeric DEFAULT 0,
    "cash_withdrawn" numeric DEFAULT 0,
    "cash_left" numeric DEFAULT 100,
    "tickets_count" integer DEFAULT 0,
    "closed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "breakdown" "jsonb" DEFAULT '{}'::"jsonb",
    "closed_by" "uuid",
    CONSTRAINT "cash_closings_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['open'::character varying, 'closed'::character varying])::"text"[])))
);


ALTER TABLE "public"."cash_closings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."denominations_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "closing_id" "uuid",
    "ledger_entry_id" "uuid",
    "denomination" numeric(6,2) NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "count_type" character varying(50),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."denominations_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "codigo_empleado" "text" NOT NULL,
    "tipo" "text" DEFAULT 'nomina'::"text" NOT NULL,
    "mes" "text",
    "year" integer,
    "filename" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."employee_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredient_price_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "old_price" numeric(10,2) NOT NULL,
    "new_price" numeric(10,2) NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."ingredient_price_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "supplier" character varying(255),
    "unit_type" character varying(50) NOT NULL,
    "purchase_unit" character varying(50) NOT NULL,
    "current_price" numeric(10,2) NOT NULL,
    "waste_percentage" numeric(5,2) DEFAULT 0,
    "allergens" "text"[] DEFAULT '{}'::"text"[],
    "category" character varying(100) DEFAULT 'Alimentos'::character varying NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "image_url" "text",
    "stock_current" numeric(10,3) DEFAULT 0,
    "supplier_id" "uuid",
    "unit" character varying(50) DEFAULT 'ud'::character varying,
    "order_unit" "text",
    "recommended_stock" numeric(10,2),
    CONSTRAINT "ingredients_category_check" CHECK ((("category" IS NULL) OR (("category")::"text" = ANY ((ARRAY['Alimentos'::character varying, 'Packaging'::character varying, 'Bebidas'::character varying])::"text"[])))),
    CONSTRAINT "ingredients_current_price_check" CHECK (("current_price" >= (0)::numeric)),
    CONSTRAINT "ingredients_waste_percentage_check" CHECK ((("waste_percentage" >= (0)::numeric) AND ("waste_percentage" <= (100)::numeric)))
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."manager_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "movement_type" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "concept" "text" NOT NULL,
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    CONSTRAINT "manager_ledger_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "manager_ledger_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['entrada'::"text", 'salida'::"text"])))
);


ALTER TABLE "public"."manager_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."map_tpv_receta" (
    "articulo_id" integer NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "factor_porcion" numeric DEFAULT 1.0
);


ALTER TABLE "public"."map_tpv_receta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nominas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "empleado_id" "uuid" NOT NULL,
    "mes_anio" character varying(7) NOT NULL,
    "file_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"())
);


ALTER TABLE "public"."nominas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."nominas_excepciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "file_name" "text",
    "error_log" "text",
    "file_path_temp" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."nominas_excepciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_drafts" (
    "user_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "unit" "text",
    CONSTRAINT "order_drafts_quantity_check" CHECK (("quantity" > (0)::numeric))
);

ALTER TABLE ONLY "public"."order_drafts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."order_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "avatar_url" "text",
    "role" "text" DEFAULT 'staff'::"text",
    "monthly_cost" numeric(10,2) DEFAULT 0,
    "contracted_hours_weekly" integer DEFAULT 40,
    "overtime_cost_per_hour" numeric(10,2) DEFAULT 12.00,
    "hours_balance" numeric(10,2) DEFAULT 0,
    "prefer_stock_hours" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_fixed_salary" boolean DEFAULT false,
    "is_supervisor" boolean DEFAULT false,
    "dni" "text",
    "bank_account" "text",
    "needs_onboarding" boolean DEFAULT false,
    "joining_date" "date" DEFAULT CURRENT_DATE,
    "preferred_language" "text" DEFAULT 'es'::"text",
    "ai_greeting_style" "text" DEFAULT 'profesional'::"text",
    "codigo_empleado" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['manager'::"text", 'staff'::"text", 'chef'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."joining_date" IS 'Fecha de incorporación del empleado. Los cálculos de nómina ignorarán semanas anteriores a esta fecha.';



COMMENT ON COLUMN "public"."profiles"."preferred_language" IS 'Idioma preferido del usuario (es, ca)';



COMMENT ON COLUMN "public"."profiles"."ai_greeting_style" IS 'Estilo de saludo de la IA (jefe, colega, profesional)';



CREATE TABLE IF NOT EXISTS "public"."purchase_invoice_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid",
    "original_name" "text" NOT NULL,
    "quantity" numeric(10,3),
    "unit_price" numeric(10,4),
    "total_price" numeric(10,2),
    "mapped_ingredient_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text"
);


ALTER TABLE "public"."purchase_invoice_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" bigint,
    "invoice_number" "text",
    "invoice_date" "date",
    "total_amount" numeric(10,2),
    "file_path" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."purchase_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purchase_order_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric(10,3) NOT NULL,
    "unit" character varying(50) NOT NULL,
    "unit_price" numeric(10,2),
    "line_total" numeric(10,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ingredient_name" "text",
    CONSTRAINT "purchase_order_items_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" character varying(50),
    "supplier_id" "text" NOT NULL,
    "order_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expected_delivery_date" "date",
    "status" character varying(50) DEFAULT 'DRAFT'::character varying NOT NULL,
    "voice_transcription" "text",
    "voice_recorded_at" timestamp with time zone,
    "total_amount" numeric(10,2),
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "supplier_name" "text",
    "pdf_url" "text",
    "total_items" integer DEFAULT 0,
    CONSTRAINT "purchase_orders_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['DRAFT'::character varying, 'SENT'::character varying, 'RECEIVED'::character varying, 'CANCELLED'::character varying])::"text"[])))
);


ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipe_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity_gross" numeric(10,3) NOT NULL,
    "quantity_net" numeric(10,3),
    "unit" character varying(50) NOT NULL,
    "quantity_half" double precision DEFAULT 0,
    CONSTRAINT "recipe_ingredients_quantity_gross_check" CHECK (("quantity_gross" > (0)::numeric))
);


ALTER TABLE "public"."recipe_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "category" character varying(100),
    "servings" integer DEFAULT 1,
    "preparation_time" integer,
    "photo_url" "text",
    "video_tutorial_url" "text",
    "sale_price" numeric(10,2),
    "embedding" "public"."vector"(1536),
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "sales_price_pavello" numeric DEFAULT 0,
    "elaboration" "text",
    "presentation" "text",
    "has_half_ration" boolean DEFAULT false,
    "sale_price_half" numeric DEFAULT 0,
    "sale_price_half_pavello" numeric DEFAULT 0,
    "target_food_cost_pct" numeric DEFAULT 30,
    "price_pavello_half" double precision DEFAULT 0,
    "articulo_id" integer,
    CONSTRAINT "recipes_preparation_time_check" CHECK (("preparation_time" >= 0)),
    CONSTRAINT "recipes_servings_check" CHECK (("servings" > 0))
);


ALTER TABLE "public"."recipes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."recipes"."sale_price" IS 'Precio de venta general (Barra) - INDEPENDIENTE de sales_price_pavello';



COMMENT ON COLUMN "public"."recipes"."sales_price_pavello" IS 'Precio de venta para Pavelló - INDEPENDIENTE de sale_price';



CREATE MATERIALIZED VIEW "public"."recipe_financials" AS
 SELECT "r"."id" AS "recipe_id",
    "r"."name" AS "recipe_name",
    COALESCE("sum"(
        CASE
            WHEN (("i"."category")::"text" <> 'Packaging'::"text") THEN (("ri"."quantity_gross" / 1000.0) * "i"."current_price")
            ELSE (0)::numeric
        END), (0)::numeric) AS "total_ingredient_cost",
    COALESCE("sum"(
        CASE
            WHEN (("i"."category")::"text" = 'Packaging'::"text") THEN (("ri"."quantity_gross" / 1000.0) * "i"."current_price")
            ELSE (0)::numeric
        END), (0)::numeric) AS "packaging_cost",
    COALESCE("sum"((("ri"."quantity_gross" / 1000.0) * "i"."current_price")), (0)::numeric) AS "total_cost",
        CASE
            WHEN ("r"."sale_price" > (0)::numeric) THEN ((COALESCE("sum"((("ri"."quantity_gross" / 1000.0) * "i"."current_price")), (0)::numeric) / "r"."sale_price") * (100)::numeric)
            ELSE NULL::numeric
        END AS "food_cost_percentage",
        CASE
            WHEN ("r"."sale_price" > (0)::numeric) THEN ("r"."sale_price" - COALESCE("sum"((("ri"."quantity_gross" / 1000.0) * "i"."current_price")), (0)::numeric))
            ELSE NULL::numeric
        END AS "net_margin",
    "now"() AS "last_updated"
   FROM (("public"."recipes" "r"
     LEFT JOIN "public"."recipe_ingredients" "ri" ON (("r"."id" = "ri"."recipe_id")))
     LEFT JOIN "public"."ingredients" "i" ON (("ri"."ingredient_id" = "i"."id")))
  GROUP BY "r"."id", "r"."name", "r"."sale_price"
  WITH NO DATA;


ALTER MATERIALIZED VIEW "public"."recipe_financials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "notes" "text",
    "is_published" boolean DEFAULT false,
    "activity" "text",
    "draft_start_time" timestamp with time zone,
    "draft_end_time" timestamp with time zone,
    "draft_activity" "text",
    "draft_notes" "text",
    "event_start_time" "text",
    "event_end_time" "text",
    "event_participants" integer
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "movement_type" character varying(50) NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "supplier_id" "uuid",
    "quantity" numeric(10,3) NOT NULL,
    "unit" character varying(50) NOT NULL,
    "unit_price" numeric(10,2),
    "total_amount" numeric(10,2),
    "movement_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reference_doc" character varying(255),
    "original_description" "text",
    "notes" "text",
    "processed_by" character varying(100),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stock_movements_movement_type_check" CHECK ((("movement_type")::"text" = ANY ((ARRAY['PURCHASE'::character varying, 'SALE'::character varying, 'WASTE'::character varying, 'ADJUSTMENT'::character varying, 'INVENTORY_COUNT'::character varying])::"text"[])))
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_item_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supplier_id" bigint,
    "supplier_item_name" "text" NOT NULL,
    "ingredient_id" "uuid",
    "conversion_factor" numeric(10,4) DEFAULT 1.0000 NOT NULL,
    "last_known_price" numeric(10,4),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."supplier_item_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "name" "text" NOT NULL,
    "delivery_schedule" "text",
    "lead_time" "text",
    "reliability" "text",
    "phone" "text",
    "notes" "text",
    "email_domains" "text"[]
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


ALTER TABLE "public"."suppliers" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."suppliers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ticket_lines_marbella" (
    "numero_documento" "text" NOT NULL,
    "linea" integer NOT NULL,
    "articulo_id" integer NOT NULL,
    "unidades" numeric(10,3) NOT NULL,
    "precio_unidad" numeric(10,2) NOT NULL,
    "importe_total" numeric(10,2) NOT NULL,
    "fecha_negocio" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ticket_lines_marbella" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets_marbella" (
    "numero_documento" "text" NOT NULL,
    "fecha" "date" NOT NULL,
    "hora_cierre" "text" NOT NULL,
    "total_documento" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."tickets_marbella" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "clock_in" timestamp with time zone NOT NULL,
    "clock_out" timestamp with time zone,
    "event_type" character varying(50),
    "total_hours" numeric(5,2),
    "location" character varying(100),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "input_lat" numeric(10,8),
    "input_lng" numeric(11,8),
    "is_manual_entry" boolean DEFAULT false,
    "clock_out_show_no_registrada" boolean DEFAULT false NOT NULL,
    CONSTRAINT "time_logs_event_type_check" CHECK ((("event_type")::"text" = ANY ((ARRAY['regular'::character varying, 'overtime'::character varying, 'weekend'::character varying, 'holiday'::character varying, 'personal'::character varying, 'adjustment'::character varying, 'no_registered'::character varying])::"text"[])))
);


ALTER TABLE "public"."time_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."time_logs"."event_type" IS 'Tipo de fichaje. no_registered = día sin fichaje (solo manager). Opciones y checkbox "No registrada" son de uso exclusivo manager.';



COMMENT ON COLUMN "public"."time_logs"."input_lat" IS 'Latitud capturada al fichar';



COMMENT ON COLUMN "public"."time_logs"."input_lng" IS 'Longitud capturada al fichar';



COMMENT ON COLUMN "public"."time_logs"."clock_out_show_no_registrada" IS 'Cuando true, en listados/calendario se muestra "No registrada" en lugar de la hora de salida. El manager decide cuándo activarlo (da igual si la hora fue manual o no).';



CREATE TABLE IF NOT EXISTS "public"."treasury_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "box_id" "uuid",
    "type" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "breakdown" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "user_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "closing_id" "uuid",
    CONSTRAINT "treasury_log_type_check" CHECK (("type" = ANY (ARRAY['IN'::"text", 'OUT'::"text", 'SWAP'::"text", 'CLOSE_ENTRY'::"text", 'ADJUSTMENT'::"text"])))
);


ALTER TABLE "public"."treasury_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_treasury_movements_balance" AS
 SELECT "id",
    "box_id",
    "type",
    "amount",
    "breakdown",
    "notes",
    "created_at",
    "user_id",
    "closing_id",
    "sum"(
        CASE
            WHEN ("type" = ANY (ARRAY['IN'::"text", 'CLOSE_ENTRY'::"text"])) THEN "amount"
            WHEN ("type" = 'OUT'::"text") THEN (- "amount")
            ELSE (0)::numeric
        END) OVER (ORDER BY "created_at", "id" ROWS UNBOUNDED PRECEDING) AS "running_balance"
   FROM "public"."treasury_log"
  WHERE ("type" = ANY (ARRAY['IN'::"text", 'OUT'::"text", 'CLOSE_ENTRY'::"text", 'ADJUSTMENT'::"text", 'SWAP'::"text"]));


ALTER VIEW "public"."v_treasury_movements_balance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ventas_marbella" (
    "id_linea" "text" NOT NULL,
    "fecha_hora" timestamp with time zone,
    "articulo" "text",
    "total_importe" numeric,
    "empleado" "text"
);


ALTER TABLE "public"."ventas_marbella" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_daily_accumulated" AS
 SELECT "t"."id",
    "t"."user_id",
    "t"."clock_in",
    "t"."total_hours",
    "p"."contracted_hours_weekly" AS "weekly_limit",
    "to_char"("t"."clock_in", 'IYYY-IW'::"text") AS "week_id",
    "sum"("t"."total_hours") OVER (PARTITION BY "t"."user_id", ("to_char"("t"."clock_in", 'IYYY-IW'::"text")) ORDER BY "t"."clock_in") AS "running_total"
   FROM ("public"."time_logs" "t"
     JOIN "public"."profiles" "p" ON (("t"."user_id" = "p"."id")));


ALTER VIEW "public"."view_daily_accumulated" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."view_daily_hours_breakdown" AS
 SELECT "id",
    "user_id",
    "clock_in",
    "week_id",
    "total_hours",
    "weekly_limit",
        CASE
            WHEN (("running_total" - "total_hours") >= ("weekly_limit")::numeric) THEN (0)::numeric
            WHEN ("running_total" > ("weekly_limit")::numeric) THEN (("weekly_limit")::numeric - ("running_total" - "total_hours"))
            ELSE "total_hours"
        END AS "ordinary_hours",
        CASE
            WHEN (("running_total" - "total_hours") >= ("weekly_limit")::numeric) THEN "total_hours"
            WHEN ("running_total" > ("weekly_limit")::numeric) THEN ("running_total" - ("weekly_limit")::numeric)
            ELSE (0)::numeric
        END AS "extra_hours"
   FROM "public"."view_daily_accumulated";


ALTER VIEW "public"."view_daily_hours_breakdown" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "week_end" "date" NOT NULL,
    "total_hours" numeric(10,2) DEFAULT 0,
    "ordinary_hours" numeric(10,2) DEFAULT 0,
    "extra_hours" numeric(10,2) DEFAULT 0,
    "contracted_hours_snapshot" numeric(10,2) NOT NULL,
    "overtime_price_snapshot" numeric(10,2) DEFAULT 0,
    "balance_hours" numeric(10,2) DEFAULT 0,
    "pending_balance" numeric(10,2) DEFAULT 0,
    "final_balance" numeric(10,2) DEFAULT 0,
    "total_cost" numeric(10,2) DEFAULT 0,
    "is_paid" boolean DEFAULT false,
    "prefer_stock_hours_override" boolean
);


ALTER TABLE "public"."weekly_snapshots" OWNER TO "postgres";


COMMENT ON COLUMN "public"."weekly_snapshots"."prefer_stock_hours_override" IS 'NULL = Usa perfil, TRUE = Bolsa de Horas, FALSE = Pagar en Nómina';



CREATE OR REPLACE VIEW "public"."view_payable_overtime" AS
 SELECT "ws"."id",
    "ws"."user_id",
    (("p"."first_name" || ' '::"text") || "p"."last_name") AS "full_name",
    "p"."role",
    "ws"."week_start",
    "ws"."week_end",
    "ws"."final_balance" AS "hours_to_pay",
    "ws"."is_paid"
   FROM ("public"."weekly_snapshots" "ws"
     JOIN "public"."profiles" "p" ON (("ws"."user_id" = "p"."id")))
  WHERE ("ws"."final_balance" > (0)::numeric)
  ORDER BY "ws"."week_start" DESC;


ALTER VIEW "public"."view_payable_overtime" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_closings_log" (
    "id" bigint NOT NULL,
    "closed_at" timestamp with time zone DEFAULT "now"(),
    "week_start" "date" NOT NULL,
    "week_end" "date" NOT NULL
);


ALTER TABLE "public"."weekly_closings_log" OWNER TO "postgres";


ALTER TABLE "public"."weekly_closings_log" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."weekly_closings_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."ai_call_logs"
    ADD CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_chat_messages"
    ADD CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bdp_articulos"
    ADD CONSTRAINT "bdp_articulos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bdp_departamentos"
    ADD CONSTRAINT "bdp_departamentos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bdp_familias"
    ADD CONSTRAINT "bdp_familias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_box_inventory"
    ADD CONSTRAINT "cash_box_inventory_box_id_denomination_key" UNIQUE ("box_id", "denomination");



ALTER TABLE ONLY "public"."cash_box_inventory"
    ADD CONSTRAINT "cash_box_inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_boxes"
    ADD CONSTRAINT "cash_boxes_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."cash_boxes"
    ADD CONSTRAINT "cash_boxes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."denominations_log"
    ADD CONSTRAINT "denominations_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredient_price_history"
    ADD CONSTRAINT "ingredient_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."manager_ledger"
    ADD CONSTRAINT "manager_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."map_tpv_receta"
    ADD CONSTRAINT "map_tpv_receta_pkey" PRIMARY KEY ("articulo_id");



ALTER TABLE ONLY "public"."nominas_excepciones"
    ADD CONSTRAINT "nominas_excepciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."nominas"
    ADD CONSTRAINT "nominas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_drafts"
    ADD CONSTRAINT "order_drafts_pkey" PRIMARY KEY ("user_id", "ingredient_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_codigo_empleado_key" UNIQUE ("codigo_empleado");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_invoice_lines"
    ADD CONSTRAINT "purchase_invoice_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."purchase_orders"
    ADD CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_ingredient_id_key" UNIQUE ("recipe_id", "ingredient_id");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."recipes"
    ADD CONSTRAINT "recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_item_mappings"
    ADD CONSTRAINT "supplier_item_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."supplier_item_mappings"
    ADD CONSTRAINT "supplier_item_mappings_supplier_id_supplier_item_name_key" UNIQUE ("supplier_id", "supplier_item_name");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_lines_marbella"
    ADD CONSTRAINT "ticket_lines_marbella_pkey" PRIMARY KEY ("numero_documento", "linea");



ALTER TABLE ONLY "public"."tickets_marbella"
    ADD CONSTRAINT "tickets_marbella_pkey" PRIMARY KEY ("numero_documento");



ALTER TABLE ONLY "public"."time_logs"
    ADD CONSTRAINT "time_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."treasury_log"
    ADD CONSTRAINT "treasury_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "uq_employee_doc" UNIQUE ("codigo_empleado", "tipo", "mes", "year");



ALTER TABLE ONLY "public"."ventas_marbella"
    ADD CONSTRAINT "ventas_marbella_pkey" PRIMARY KEY ("id_linea");



ALTER TABLE ONLY "public"."weekly_closings_log"
    ADD CONSTRAINT "weekly_closings_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_closings_log"
    ADD CONSTRAINT "weekly_closings_log_week_start_key" UNIQUE ("week_start");



ALTER TABLE ONLY "public"."weekly_snapshots"
    ADD CONSTRAINT "weekly_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_snapshots"
    ADD CONSTRAINT "weekly_snapshots_user_id_week_start_key" UNIQUE ("user_id", "week_start");



CREATE INDEX "idx_cash_closings_date" ON "public"."cash_closings" USING "btree" ("closing_date" DESC);



CREATE INDEX "idx_employee_docs_codigo" ON "public"."employee_documents" USING "btree" ("codigo_empleado");



CREATE INDEX "idx_employee_docs_tipo" ON "public"."employee_documents" USING "btree" ("tipo", "year", "mes");



CREATE INDEX "idx_employee_docs_user" ON "public"."employee_documents" USING "btree" ("user_id");



CREATE INDEX "idx_ingredients_allergens" ON "public"."ingredients" USING "gin" ("allergens");



CREATE INDEX "idx_ingredients_category" ON "public"."ingredients" USING "btree" ("category");



CREATE INDEX "idx_ingredients_updated_at" ON "public"."ingredients" USING "btree" ("updated_at" DESC);



CREATE UNIQUE INDEX "idx_one_shift_per_day" ON "public"."time_logs" USING "btree" ("user_id", "public"."get_working_date"("clock_in"));



CREATE UNIQUE INDEX "idx_recipe_financials_recipe_id" ON "public"."recipe_financials" USING "btree" ("recipe_id");



CREATE INDEX "idx_recipe_ingredients_ingredient_id" ON "public"."recipe_ingredients" USING "btree" ("ingredient_id");



CREATE INDEX "idx_recipe_ingredients_recipe" ON "public"."recipe_ingredients" USING "btree" ("recipe_id");



CREATE INDEX "idx_recipe_ingredients_recipe_id" ON "public"."recipe_ingredients" USING "btree" ("recipe_id");



CREATE INDEX "idx_recipes_bdp_id" ON "public"."recipes" USING "btree" ("articulo_id");



CREATE INDEX "idx_recipes_category" ON "public"."recipes" USING "btree" ("category");



CREATE INDEX "idx_recipes_embedding" ON "public"."recipes" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='100');



CREATE INDEX "idx_recipes_name_trgm" ON "public"."recipes" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_shifts_range" ON "public"."shifts" USING "btree" ("start_time", "end_time");



CREATE UNIQUE INDEX "idx_shifts_unique_user_day" ON "public"."shifts" USING "btree" ("user_id", ((("start_time" AT TIME ZONE 'UTC'::"text"))::"date"));



CREATE INDEX "idx_shifts_user" ON "public"."shifts" USING "btree" ("user_id");



CREATE INDEX "idx_stock_movements_date" ON "public"."stock_movements" USING "btree" ("movement_date" DESC);



CREATE INDEX "idx_stock_movements_ingredient" ON "public"."stock_movements" USING "btree" ("ingredient_id");



CREATE INDEX "idx_stock_movements_type" ON "public"."stock_movements" USING "btree" ("movement_type");



CREATE INDEX "idx_ticket_lines_articulo" ON "public"."ticket_lines_marbella" USING "btree" ("articulo_id");



CREATE INDEX "idx_ticket_lines_fecha" ON "public"."ticket_lines_marbella" USING "btree" ("fecha_negocio");



CREATE INDEX "idx_time_logs_clock_in" ON "public"."time_logs" USING "btree" ("clock_in");



CREATE INDEX "idx_time_logs_employee_id" ON "public"."time_logs" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "on_box_created" AFTER INSERT ON "public"."cash_boxes" FOR EACH ROW EXECUTE FUNCTION "public"."init_box_inventory"();



CREATE OR REPLACE TRIGGER "tr_auto_map_and_price" AFTER INSERT ON "public"."purchase_invoice_lines" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_invoice_line"();



CREATE OR REPLACE TRIGGER "trg_cash_closing_to_treasury_v2" AFTER INSERT OR DELETE OR UPDATE ON "public"."cash_closings" FOR EACH ROW EXECUTE FUNCTION "public"."fn_on_cash_closing_confirmed_v2"();



CREATE OR REPLACE TRIGGER "trg_sync_treasury_inventory_v3" AFTER INSERT OR DELETE OR UPDATE ON "public"."treasury_log" FOR EACH ROW EXECUTE FUNCTION "public"."fn_sync_box_inventory_v3"();



CREATE OR REPLACE TRIGGER "trigger_cash_closings_updated_at" BEFORE UPDATE ON "public"."cash_closings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_ingredients_updated_at" BEFORE UPDATE ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_log_price_history" BEFORE UPDATE OF "current_price" ON "public"."ingredients" FOR EACH ROW EXECUTE FUNCTION "public"."log_price_change"();



CREATE OR REPLACE TRIGGER "trigger_propagate_on_paid_change" AFTER UPDATE OF "is_paid" ON "public"."weekly_snapshots" FOR EACH ROW WHEN (("old"."is_paid" IS DISTINCT FROM "new"."is_paid")) EXECUTE FUNCTION "public"."fn_trigger_propagate_from_snapshot"();



CREATE OR REPLACE TRIGGER "trigger_purchase_orders_updated_at" BEFORE UPDATE ON "public"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_recalc_snapshots" AFTER INSERT OR DELETE OR UPDATE ON "public"."time_logs" FOR EACH ROW EXECUTE FUNCTION "public"."recalc_snapshots_on_log_change"();



CREATE OR REPLACE TRIGGER "trigger_recipes_updated_at" BEFORE UPDATE ON "public"."recipes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_refresh_financials_on_price_change" AFTER UPDATE OF "current_price" ON "public"."ingredients" FOR EACH STATEMENT EXECUTE FUNCTION "public"."refresh_recipe_financials"();



CREATE OR REPLACE TRIGGER "trigger_update_live_stock" AFTER INSERT ON "public"."stock_movements" FOR EACH ROW EXECUTE FUNCTION "public"."update_ingredient_stock_trigger"();



CREATE OR REPLACE TRIGGER "update_push_subscriptions_updated_at" BEFORE UPDATE ON "public"."push_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."ai_call_logs"
    ADD CONSTRAINT "ai_call_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_call_logs"
    ADD CONSTRAINT "ai_call_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_chat_messages"
    ADD CONSTRAINT "ai_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_chat_messages"
    ADD CONSTRAINT "ai_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_chat_sessions"
    ADD CONSTRAINT "ai_chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_box_inventory"
    ADD CONSTRAINT "cash_box_inventory_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."cash_boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_closings"
    ADD CONSTRAINT "cash_closings_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."denominations_log"
    ADD CONSTRAINT "denominations_log_closing_id_fkey" FOREIGN KEY ("closing_id") REFERENCES "public"."cash_closings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."map_tpv_receta"
    ADD CONSTRAINT "fk_recipe" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_lines_marbella"
    ADD CONSTRAINT "fk_ticket" FOREIGN KEY ("numero_documento") REFERENCES "public"."tickets_marbella"("numero_documento") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredient_price_history"
    ADD CONSTRAINT "ingredient_price_history_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."manager_ledger"
    ADD CONSTRAINT "manager_ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."nominas"
    ADD CONSTRAINT "nominas_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."order_drafts"
    ADD CONSTRAINT "order_drafts_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_drafts"
    ADD CONSTRAINT "order_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_invoice_lines"
    ADD CONSTRAINT "purchase_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchase_invoice_lines"
    ADD CONSTRAINT "purchase_invoice_lines_mapped_ingredient_id_fkey" FOREIGN KEY ("mapped_ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id");



ALTER TABLE ONLY "public"."purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recipe_ingredients"
    ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_item_mappings"
    ADD CONSTRAINT "supplier_item_mappings_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."supplier_item_mappings"
    ADD CONSTRAINT "supplier_item_mappings_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_logs"
    ADD CONSTRAINT "time_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treasury_log"
    ADD CONSTRAINT "treasury_log_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "public"."cash_boxes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treasury_log"
    ADD CONSTRAINT "treasury_log_closing_id_fkey" FOREIGN KEY ("closing_id") REFERENCES "public"."cash_closings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."treasury_log"
    ADD CONSTRAINT "treasury_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."weekly_snapshots"
    ADD CONSTRAINT "weekly_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated read on cash_box_inventory" ON "public"."cash_box_inventory" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated select closings" ON "public"."cash_closings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated select treasury" ON "public"."treasury_log" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read cash boxes" ON "public"."cash_boxes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view manager subscriptions" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "push_subscriptions"."user_id") AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Authenticated can read published shifts" ON "public"."shifts" FOR SELECT TO "authenticated" USING (("is_published" = true));



CREATE POLICY "Creación Manager" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."role" = 'manager'::"text")))) OR ("auth"."uid"() = "id")));



CREATE POLICY "Edición Segura" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "id") OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."role" = 'manager'::"text"))))));



CREATE POLICY "Enable ALL for authenticated" ON "public"."purchase_invoice_lines" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable ALL for authenticated" ON "public"."purchase_invoices" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable ALL for authenticated" ON "public"."supplier_item_mappings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Enable ALL for service_role" ON "public"."purchase_invoice_lines" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Enable ALL for service_role" ON "public"."purchase_invoices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Enable ALL for service_role" ON "public"."supplier_item_mappings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Lectura Global Autenticada" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Lectura propia nomina" ON "public"."nominas" FOR SELECT USING (("auth"."uid"() = "empleado_id"));



CREATE POLICY "Lectura pública autenticada" ON "public"."categories" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "MASTER_ALL_INGREDIENTS" ON "public"."ingredients" USING (true) WITH CHECK (true);



CREATE POLICY "MASTER_ALL_RECIPES" ON "public"."recipes" USING (true) WITH CHECK (true);



CREATE POLICY "MASTER_ALL_RELATIONS" ON "public"."recipe_ingredients" USING (true) WITH CHECK (true);



CREATE POLICY "Manager acceso total" ON "public"."profiles" USING (true);



CREATE POLICY "Manager_Full_Access_CashBoxes" ON "public"."cash_boxes" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Manager_Full_Access_Snapshots" ON "public"."weekly_snapshots" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Manager_Full_Access_Tickets" ON "public"."tickets_marbella" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Manager_Full_Access_Time_Logs" ON "public"."time_logs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Manager_Full_Access_Treasury" ON "public"."treasury_log" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Manager_Full_Access_Ventas" ON "public"."ventas_marbella" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Manager_Full_Access_Weekly_Closings" ON "public"."weekly_closings_log" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers can delete closings" ON "public"."cash_closings" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers can manage all order items" ON "public"."purchase_order_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers can manage all orders" ON "public"."purchase_orders" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers can update closings" ON "public"."cash_closings" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers can view all subscriptions" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers exact delete" ON "public"."manager_ledger" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers exact insert" ON "public"."manager_ledger" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers exact update" ON "public"."manager_ledger" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers exact view" ON "public"."manager_ledger" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers full access" ON "public"."shifts" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))));



CREATE POLICY "Managers pueden importar time_logs" ON "public"."time_logs" FOR INSERT WITH CHECK (("auth"."uid"() IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."role" = 'manager'::"text"))));



CREATE POLICY "Public Read Access" ON "public"."suppliers" FOR SELECT USING (true);



CREATE POLICY "Staff_View_Own_Snapshots" ON "public"."weekly_snapshots" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Staff_View_Own_Time_Logs" ON "public"."time_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Supervisores pueden gestionar logs" ON "public"."time_logs" USING ((( SELECT "profiles"."is_supervisor"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = true));



CREATE POLICY "Supervisores pueden ver todos los logs" ON "public"."time_logs" FOR SELECT USING ((( SELECT "profiles"."is_supervisor"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = true));



CREATE POLICY "Users can add items to own orders" ON "public"."purchase_order_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."purchase_orders"
  WHERE (("purchase_orders"."id" = "purchase_order_items"."purchase_order_id") AND ("purchase_orders"."created_by" = "auth"."uid"())))));



CREATE POLICY "Users can create orders" ON "public"."purchase_orders" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can delete their own subscriptions" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own subscriptions" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own drafts" ON "public"."order_drafts" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can only see and modify their own AI call logs" ON "public"."ai_call_logs" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can only see and modify their own AI messages" ON "public"."ai_chat_messages" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can only see and modify their own AI sessions" ON "public"."ai_chat_sessions" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own subscriptions" ON "public"."push_subscriptions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own order items" ON "public"."purchase_order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."purchase_orders"
  WHERE (("purchase_orders"."id" = "purchase_order_items"."purchase_order_id") AND (("purchase_orders"."created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text")))))))));



CREATE POLICY "Users can view own orders" ON "public"."purchase_orders" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "created_by") OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'manager'::"text"))))));



CREATE POLICY "Users can view own shifts" ON "public"."shifts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own subscriptions" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuarios pueden fichar entrada" ON "public"."time_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuarios pueden fichar salida" ON "public"."time_logs" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuarios ven sus propios fichajes" ON "public"."time_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "admin_delete_any_log" ON "public"."time_logs" FOR DELETE USING ("public"."is_manager"());



CREATE POLICY "admin_update_any_log" ON "public"."time_logs" FOR UPDATE USING ("public"."is_manager"());



ALTER TABLE "public"."ai_call_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_chat_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_box_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_boxes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cash_closings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cash_closings_all_policy" ON "public"."cash_closings" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "cash_closings_manager_only" ON "public"."cash_closings" USING (("public"."current_employee_role"() = 'manager'::"text"));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "categories_insert_policy" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "categories_select_policy" ON "public"."categories" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."denominations_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "denominations_log_all_policy" ON "public"."denominations_log" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "emergency_insert" ON "public"."time_logs" FOR INSERT WITH CHECK (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "emergency_select" ON "public"."time_logs" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."employee_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_own_documents" ON "public"."employee_documents" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."ingredient_price_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredient_price_history_all_policy" ON "public"."ingredient_price_history" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."manager_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "managers_all_documents" ON "public"."employee_documents" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = ANY (ARRAY['manager'::"text", 'supervisor'::"text"]))))));



ALTER TABLE "public"."nominas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_invoice_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."purchase_order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_order_items_all_policy" ON "public"."purchase_order_items" TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."purchase_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "purchase_orders_all_policy" ON "public"."purchase_orders" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "purchase_orders_manager_only" ON "public"."purchase_orders" USING (("public"."current_employee_role"() = 'manager'::"text"));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipe_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_insert_own_logs" ON "public"."time_logs" FOR INSERT WITH CHECK (("user_id" = "public"."get_my_employee_id"()));



CREATE POLICY "staff_update_own_logs" ON "public"."time_logs" FOR UPDATE USING (("user_id" = "public"."get_my_employee_id"()));



CREATE POLICY "stock_delete_manager" ON "public"."stock_movements" FOR DELETE USING (("public"."current_employee_role"() = 'manager'::"text"));



CREATE POLICY "stock_insert_all" ON "public"."stock_movements" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stock_movements_all_policy" ON "public"."stock_movements" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "stock_select_all" ON "public"."stock_movements" FOR SELECT USING (true);



CREATE POLICY "stock_update_supervisor" ON "public"."stock_movements" FOR UPDATE USING (("public"."current_employee_role"() = ANY (ARRAY['manager'::"text", 'supervisor'::"text", 'chef'::"text"])));



ALTER TABLE "public"."supplier_item_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tickets_marbella" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "time_logs_delete_policy" ON "public"."time_logs" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "time_logs_insert_policy" ON "public"."time_logs" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "time_logs_select_policy" ON "public"."time_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "time_logs_update_policy" ON "public"."time_logs" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."treasury_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ventas_marbella" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_closings_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_snapshots" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_time_log_hours"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_time_log_hours"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_time_log_hours"() TO "service_role";



GRANT ALL ON FUNCTION "public"."close_week_for_all_users"("target_week_start" "date", "target_week_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."close_week_for_all_users"("target_week_start" "date", "target_week_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_week_for_all_users"("target_week_start" "date", "target_week_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."close_weekly_hours"("target_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."close_weekly_hours"("target_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."close_weekly_hours"("target_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_role" "text", "p_contracted_hours_weekly" numeric, "p_overtime_cost_per_hour" numeric, "p_joining_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_role" "text", "p_contracted_hours_weekly" numeric, "p_overtime_cost_per_hour" numeric, "p_joining_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_role" "text", "p_contracted_hours_weekly" numeric, "p_overtime_cost_per_hour" numeric, "p_joining_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_role" "text", "p_contracted_hours_weekly" numeric, "p_overtime_cost_per_hour" numeric, "p_dni" "text", "p_bank_account" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_role" "text", "p_contracted_hours_weekly" numeric, "p_overtime_cost_per_hour" numeric, "p_dni" "text", "p_bank_account" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_worker_profile"("p_first_name" "text", "p_last_name" "text", "p_email" "text", "p_role" "text", "p_contracted_hours_weekly" numeric, "p_overtime_cost_per_hour" numeric, "p_dni" "text", "p_bank_account" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_employee_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_employee_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_employee_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."debug_me"() TO "anon";
GRANT ALL ON FUNCTION "public"."debug_me"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_me"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_before_treasury_log_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_before_treasury_log_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_before_treasury_log_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_calculate_rounded_hours"("p_hours" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_calculate_rounded_hours"("p_hours" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_calculate_rounded_hours"("p_hours" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_on_cash_closing_confirmed"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_on_cash_closing_confirmed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_on_cash_closing_confirmed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_on_cash_closing_confirmed_v2"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_on_cash_closing_confirmed_v2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_on_cash_closing_confirmed_v2"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_recalc_and_propagate_snapshots"("p_user_id" "uuid", "p_start_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_recalc_and_propagate_snapshots"("p_user_id" "uuid", "p_start_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_recalc_and_propagate_snapshots"("p_user_id" "uuid", "p_start_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_round_marbella_hours"("total_hours" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_round_marbella_hours"("total_hours" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_round_marbella_hours"("total_hours" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_box_inventory"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_box_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_box_inventory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_box_inventory_v2"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_box_inventory_v2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_box_inventory_v2"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_box_inventory_v3"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_box_inventory_v3"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_box_inventory_v3"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_cash_box_inventory"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_cash_box_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_cash_box_inventory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_sync_cash_inventory"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_sync_cash_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_sync_cash_inventory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_trigger_propagate_from_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_trigger_propagate_from_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_trigger_propagate_from_snapshot"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cash_closings_summary"("p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cash_closings_summary"("p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cash_closings_summary"("p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_daily_labor_cost"("p_target_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_labor_cost"("p_target_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_labor_cost"("p_target_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_daily_sales_stats"("target_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_sales_stats"("target_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_sales_stats"("target_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_employee_role"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_employee_role"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_employee_role"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hourly_sales"("p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_hourly_sales"("p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hourly_sales"("p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_iso_week_start"("d" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_iso_week_start"("d" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_iso_week_start"("d" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_manager_ledger_balance"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_manager_ledger_balance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_manager_ledger_balance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_monthly_timesheet"("p_user_id" "uuid", "p_year" integer, "p_month" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_monthly_timesheet"("p_user_id" "uuid", "p_year" integer, "p_month" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_monthly_timesheet"("p_user_id" "uuid", "p_year" integer, "p_month" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_employee_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_employee_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_employee_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_operational_box_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_operational_box_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_operational_box_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_product_sales_ranking"("p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_product_sales_ranking"("p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_product_sales_ranking"("p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_theoretical_balance"("target_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_theoretical_balance"("target_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_theoretical_balance"("target_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ticket_lines"("p_numero_documento" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_ticket_lines"("p_numero_documento" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ticket_lines"("p_numero_documento" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_treasury_period_summary"("p_box_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_treasury_period_summary"("p_box_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_treasury_period_summary"("p_box_id" "uuid", "p_start_date" timestamp with time zone, "p_end_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_weekly_worker_stats"("p_start_date" "date", "p_end_date" "date", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_weekly_worker_stats"("p_start_date" "date", "p_end_date" "date", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_weekly_worker_stats"("p_start_date" "date", "p_end_date" "date", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_worker_weekly_log_grid"("p_user_id" "uuid", "p_start_date" "date", "p_contracted_hours" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."get_worker_weekly_log_grid"("p_user_id" "uuid", "p_start_date" "date", "p_contracted_hours" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_worker_weekly_log_grid"("p_user_id" "uuid", "p_start_date" "date", "p_contracted_hours" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_working_date"("ts" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_working_date"("ts" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_working_date"("ts" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_invoice_line"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_invoice_line"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_invoice_line"() TO "service_role";



GRANT ALL ON FUNCTION "public"."init_box_inventory"() TO "anon";
GRANT ALL ON FUNCTION "public"."init_box_inventory"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."init_box_inventory"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_manager"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_manager"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_manager"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_price_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_price_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_price_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_snapshots_on_log_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_snapshots_on_log_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_snapshots_on_log_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_recipe_financials"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_recipe_financials"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_recipe_financials"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_recalculate_all_balances"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_recalculate_all_balances"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_recalculate_all_balances"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_weekly_target"("p_employee_id" "uuid", "p_week_start" "date", "p_new_target" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."set_weekly_target"("p_employee_id" "uuid", "p_week_start" "date", "p_new_target" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_weekly_target"("p_employee_id" "uuid", "p_week_start" "date", "p_new_target" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ingredient_stock_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ingredient_stock_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ingredient_stock_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_weekly_bank"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_weekly_bank"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_weekly_bank"() TO "service_role";



GRANT ALL ON TABLE "public"."ai_call_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_call_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_call_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."ai_chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."ai_chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."ai_chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_chat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."bdp_articulos" TO "anon";
GRANT ALL ON TABLE "public"."bdp_articulos" TO "authenticated";
GRANT ALL ON TABLE "public"."bdp_articulos" TO "service_role";



GRANT ALL ON TABLE "public"."bdp_departamentos" TO "anon";
GRANT ALL ON TABLE "public"."bdp_departamentos" TO "authenticated";
GRANT ALL ON TABLE "public"."bdp_departamentos" TO "service_role";



GRANT ALL ON TABLE "public"."bdp_familias" TO "anon";
GRANT ALL ON TABLE "public"."bdp_familias" TO "authenticated";
GRANT ALL ON TABLE "public"."bdp_familias" TO "service_role";



GRANT ALL ON TABLE "public"."cash_box_inventory" TO "anon";
GRANT ALL ON TABLE "public"."cash_box_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_box_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."cash_boxes" TO "anon";
GRANT ALL ON TABLE "public"."cash_boxes" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_boxes" TO "service_role";



GRANT ALL ON TABLE "public"."cash_closings" TO "anon";
GRANT ALL ON TABLE "public"."cash_closings" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_closings" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."denominations_log" TO "anon";
GRANT ALL ON TABLE "public"."denominations_log" TO "authenticated";
GRANT ALL ON TABLE "public"."denominations_log" TO "service_role";



GRANT ALL ON TABLE "public"."employee_documents" TO "anon";
GRANT ALL ON TABLE "public"."employee_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_documents" TO "service_role";



GRANT ALL ON TABLE "public"."ingredient_price_history" TO "anon";
GRANT ALL ON TABLE "public"."ingredient_price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredient_price_history" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."manager_ledger" TO "anon";
GRANT ALL ON TABLE "public"."manager_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."manager_ledger" TO "service_role";



GRANT ALL ON TABLE "public"."map_tpv_receta" TO "anon";
GRANT ALL ON TABLE "public"."map_tpv_receta" TO "authenticated";
GRANT ALL ON TABLE "public"."map_tpv_receta" TO "service_role";



GRANT ALL ON TABLE "public"."nominas" TO "anon";
GRANT ALL ON TABLE "public"."nominas" TO "authenticated";
GRANT ALL ON TABLE "public"."nominas" TO "service_role";



GRANT ALL ON TABLE "public"."nominas_excepciones" TO "anon";
GRANT ALL ON TABLE "public"."nominas_excepciones" TO "authenticated";
GRANT ALL ON TABLE "public"."nominas_excepciones" TO "service_role";



GRANT ALL ON TABLE "public"."order_drafts" TO "anon";
GRANT ALL ON TABLE "public"."order_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."order_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_invoice_lines" TO "anon";
GRANT ALL ON TABLE "public"."purchase_invoice_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_invoice_lines" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_invoices" TO "anon";
GRANT ALL ON TABLE "public"."purchase_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_order_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_orders" TO "anon";
GRANT ALL ON TABLE "public"."purchase_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_orders" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."recipe_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."recipes" TO "anon";
GRANT ALL ON TABLE "public"."recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."recipes" TO "service_role";



GRANT UPDATE("elaboration") ON TABLE "public"."recipes" TO "authenticated";



GRANT UPDATE("presentation") ON TABLE "public"."recipes" TO "authenticated";



GRANT ALL ON TABLE "public"."recipe_financials" TO "anon";
GRANT ALL ON TABLE "public"."recipe_financials" TO "authenticated";
GRANT ALL ON TABLE "public"."recipe_financials" TO "service_role";



GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_item_mappings" TO "anon";
GRANT ALL ON TABLE "public"."supplier_item_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_item_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."suppliers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_lines_marbella" TO "anon";
GRANT ALL ON TABLE "public"."ticket_lines_marbella" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_lines_marbella" TO "service_role";



GRANT ALL ON TABLE "public"."tickets_marbella" TO "anon";
GRANT ALL ON TABLE "public"."tickets_marbella" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets_marbella" TO "service_role";



GRANT ALL ON TABLE "public"."time_logs" TO "anon";
GRANT ALL ON TABLE "public"."time_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."time_logs" TO "service_role";



GRANT ALL ON TABLE "public"."treasury_log" TO "anon";
GRANT ALL ON TABLE "public"."treasury_log" TO "authenticated";
GRANT ALL ON TABLE "public"."treasury_log" TO "service_role";



GRANT ALL ON TABLE "public"."v_treasury_movements_balance" TO "anon";
GRANT ALL ON TABLE "public"."v_treasury_movements_balance" TO "authenticated";
GRANT ALL ON TABLE "public"."v_treasury_movements_balance" TO "service_role";



GRANT ALL ON TABLE "public"."ventas_marbella" TO "anon";
GRANT ALL ON TABLE "public"."ventas_marbella" TO "authenticated";
GRANT ALL ON TABLE "public"."ventas_marbella" TO "service_role";



GRANT ALL ON TABLE "public"."view_daily_accumulated" TO "anon";
GRANT ALL ON TABLE "public"."view_daily_accumulated" TO "authenticated";
GRANT ALL ON TABLE "public"."view_daily_accumulated" TO "service_role";



GRANT ALL ON TABLE "public"."view_daily_hours_breakdown" TO "anon";
GRANT ALL ON TABLE "public"."view_daily_hours_breakdown" TO "authenticated";
GRANT ALL ON TABLE "public"."view_daily_hours_breakdown" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."weekly_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."view_payable_overtime" TO "anon";
GRANT ALL ON TABLE "public"."view_payable_overtime" TO "authenticated";
GRANT ALL ON TABLE "public"."view_payable_overtime" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_closings_log" TO "anon";
GRANT ALL ON TABLE "public"."weekly_closings_log" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_closings_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."weekly_closings_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."weekly_closings_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."weekly_closings_log_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







