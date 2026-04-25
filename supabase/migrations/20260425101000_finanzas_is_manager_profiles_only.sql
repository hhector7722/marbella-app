-- Fuente de verdad RBAC: public.profiles.role
-- Evita dependencia de tablas legacy como public.employees.

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'manager'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;

