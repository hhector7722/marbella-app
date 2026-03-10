-- ==============================================================================
-- FIX: Staff no puede ver/descargar sus nóminas (solo managers sí)
-- Causa probable: subquery en política storage puede tener problemas con RLS.
-- Solución: función SECURITY DEFINER que evita recursión RLS.
-- ==============================================================================

-- 1. Función helper: staff puede leer objeto si existe fila en employee_documents
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

-- 2. Función helper: staff puede leer si existe en tabla nominas (legacy)
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

-- 3. Eliminar política legacy duplicada (ahora integrada en nominas_staff_read_own)
DROP POLICY IF EXISTS "nominas_storage_from_legacy_table" ON storage.objects;

-- 4. Recrear política storage para staff (usa funciones que evitan problemas RLS)
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
