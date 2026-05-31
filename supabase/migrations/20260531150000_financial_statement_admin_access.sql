-- is_manager: incluir admin (alineado con is_manager_or_admin para RBAC finanzas)

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('manager', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;
