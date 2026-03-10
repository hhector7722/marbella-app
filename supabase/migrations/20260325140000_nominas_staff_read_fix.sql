-- ==============================================================================
-- FIX: Empleados no pueden ver sus nóminas
-- Unificar políticas RLS en tabla nominas y asegurar que staff (authenticated)
-- pueda leer sus propias filas (empleado_id = auth.uid()).
-- ==============================================================================

-- 1. Eliminar políticas que puedan causar conflicto o tener condiciones incorrectas
DROP POLICY IF EXISTS "employees_view_own_nominas" ON public.nominas;
DROP POLICY IF EXISTS "Lectura propia nomina" ON public.nominas;
DROP POLICY IF EXISTS "nominas_staff_read_own" ON public.nominas;

-- 2. Política única y explícita: empleados autenticados ven solo sus nóminas
CREATE POLICY "nominas_staff_read_own"
ON public.nominas FOR SELECT
TO authenticated
USING (empleado_id = auth.uid());

-- 3. Managers/supervisores ya tienen nominas_table_managers_read (si existe)
--    Si no existe, crearla
DROP POLICY IF EXISTS "nominas_table_managers_read" ON public.nominas;
CREATE POLICY "nominas_table_managers_read"
ON public.nominas FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'supervisor')
    )
);

-- 4. Asegurar que las funciones de storage sigan operativas (por si se perdieron)
CREATE OR REPLACE FUNCTION public.fn_staff_can_read_nomina(p_storage_path text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employee_documents ed
    WHERE ed.storage_path = p_storage_path
      AND ed.user_id = auth.uid()
      AND ed.tipo = 'nomina'
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_staff_can_read_nomina_legacy(p_storage_path text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.nominas n
    WHERE n.file_path = p_storage_path
      AND n.empleado_id = auth.uid()
  );
$$;

-- 5. Política storage: staff puede leer archivos (employee_documents O nominas legacy)
DROP POLICY IF EXISTS "nominas_staff_read_own" ON storage.objects;
CREATE POLICY "nominas_staff_read_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'nominas'
    AND (
        public.fn_staff_can_read_nomina(name)
        OR public.fn_staff_can_read_nomina_legacy(name)
    )
);
