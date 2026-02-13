-- =============================================
-- SQL MIGRATION: Expanding Profile & Documents (V2)
-- =============================================

-- 1. Asegurar columnas en profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS dni TEXT,
ADD COLUMN IF NOT EXISTS bank_account TEXT;

-- 2. Crear tabla de documentos
CREATE TABLE IF NOT EXISTS employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('contract', 'payroll')),
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    period TEXT, -- Ejemplo: '2026-02'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Habilitar RLS en la nueva tabla
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Seguridad (RLS)
-- Eliminar si ya existen para evitar errores al re-ejecutar
DROP POLICY IF EXISTS "Employees can view own documents" ON employee_documents;
DROP POLICY IF EXISTS "Managers can manage all documents" ON employee_documents;

-- Los empleados pueden ver sus propios documentos
CREATE POLICY "Employees can view own documents" 
ON employee_documents FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

-- Los managers pueden ver y gestionar todos los documentos
CREATE POLICY "Managers can manage all documents" 
ON employee_documents FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'manager'
  )
);

-- 5. Actualizar función de creación de trabajador para incluir nuevos campos
DROP FUNCTION IF EXISTS create_worker_profile(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION create_worker_profile(
    p_first_name TEXT,
    p_last_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_role TEXT DEFAULT 'staff',
    p_contracted_hours_weekly NUMERIC DEFAULT 40,
    p_overtime_cost_per_hour NUMERIC DEFAULT 0,
    p_dni TEXT DEFAULT NULL,
    p_bank_account TEXT DEFAULT NULL
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

    -- 3. Crear perfil
    INSERT INTO profiles (
        id, first_name, last_name, role, 
        contracted_hours_weekly, overtime_cost_per_hour, 
        hours_balance, dni, bank_account
    )
    VALUES (
        new_id, p_first_name, p_last_name, p_role, 
        p_contracted_hours_weekly, p_overtime_cost_per_hour, 
        0, p_dni, p_bank_account
    );

    RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_worker_profile TO authenticated;
