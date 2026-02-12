-- =============================================
-- Función para crear un trabajador (solo perfil)
-- Ejecutar en Supabase SQL Editor
-- =============================================

CREATE OR REPLACE FUNCTION create_worker_profile(
    p_first_name TEXT,
    p_last_name TEXT DEFAULT NULL,
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
BEGIN
    INSERT INTO profiles (id, first_name, last_name, role, contracted_hours_weekly, overtime_cost_per_hour, hours_balance)
    VALUES (new_id, p_first_name, p_last_name, p_role, p_contracted_hours_weekly, p_overtime_cost_per_hour, 0);
    
    RETURN new_id;
END;
$$;

-- Dar permisos a usuarios autenticados
GRANT EXECUTE ON FUNCTION create_worker_profile TO authenticated;
