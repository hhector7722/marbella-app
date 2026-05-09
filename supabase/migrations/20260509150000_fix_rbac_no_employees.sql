-- =============================================================================
-- Reparación del Sistema de Roles (RBAC)
-- Migra current_employee_role y get_employee_role para usar public.profiles
-- eliminando la dependencia de la tabla legacy public.employees.
-- =============================================================================

BEGIN;

-- 1. Reparar get_employee_role
CREATE OR REPLACE FUNCTION public.get_employee_role(user_id uuid) 
RETURNS text
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM public.profiles
  WHERE id = user_id
  LIMIT 1;
$$;

-- 2. Reparar current_employee_role
CREATE OR REPLACE FUNCTION public.current_employee_role() 
RETURNS text
LANGUAGE sql 
STABLE
AS $$
  SELECT public.get_employee_role(auth.uid());
$$;

-- 3. Reparar debug_me
CREATE OR REPLACE FUNCTION public.debug_me() 
RETURNS TABLE("my_auth_id" uuid, "my_employee_id" uuid, "my_role" text, "is_mgr" boolean)
LANGUAGE sql 
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        auth.uid(),
        (SELECT id FROM public.profiles WHERE id = auth.uid() LIMIT 1),
        (SELECT role::text FROM public.profiles WHERE id = auth.uid() LIMIT 1),
        public.is_manager()
$$;

-- 4. Reparar get_my_employee_id
CREATE OR REPLACE FUNCTION public.get_my_employee_id() 
RETURNS uuid
LANGUAGE sql 
STABLE
AS $$
    SELECT auth.uid();
$$;

COMMIT;
