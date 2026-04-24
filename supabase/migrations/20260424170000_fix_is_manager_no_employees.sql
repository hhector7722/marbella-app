-- Fix: public.is_manager() no debe depender de public.employees
-- Algunos entornos no tienen la tabla "employees" (fuente de verdad actual = public.profiles.role).
-- Esta función es usada en RLS y RPCs (incl. finanzas), así que debe ser robusta.

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Legacy / entornos antiguos: si existe public.employees, conservar compatibilidad
  IF to_regclass('public.employees') IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.auth_user_id = auth.uid()
        AND e.role = 'manager'
    );
  END IF;

  -- Fuente de verdad actual: public.profiles.role
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'manager'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;

