-- =============================================
-- Función para crear un trabajador completo
-- Crea entry en auth.users + profiles
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- Primero eliminar la función anterior si existe
DROP FUNCTION IF EXISTS create_worker_profile(TEXT, TEXT, TEXT, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION create_worker_profile(
    p_first_name TEXT,
    p_last_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_role TEXT DEFAULT 'staff',
    p_contracted_hours_weekly NUMERIC DEFAULT 40,
    p_overtime_cost_per_hour NUMERIC DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_id uuid := gen_random_uuid();
    worker_email TEXT;
BEGIN
    -- Usar email proporcionado o generar uno dummy
    worker_email := COALESCE(NULLIF(TRIM(p_email), ''), lower(replace(p_first_name, ' ', '.')) || '.' || substr(new_id::text, 1, 8) || '@marbella.internal');

    -- 1. Crear entrada en auth.users (requerida por FK)
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
        updated_at
    ) VALUES (
        new_id,
        '00000000-0000-0000-0000-000000000000',
        worker_email,
        crypt('Marbella2026', gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('first_name', p_first_name, 'last_name', COALESCE(p_last_name, '')),
        'authenticated',
        'role',
        now(),
        now()
    );

    -- 2. Crear perfil
    INSERT INTO profiles (id, first_name, last_name, role, contracted_hours_weekly, overtime_cost_per_hour, hours_balance)
    VALUES (new_id, p_first_name, p_last_name, p_role, p_contracted_hours_weekly, p_overtime_cost_per_hour, 0);

    RETURN new_id;
END;
$$;

-- Dar permisos a usuarios autenticados (managers)
GRANT EXECUTE ON FUNCTION create_worker_profile TO authenticated;
