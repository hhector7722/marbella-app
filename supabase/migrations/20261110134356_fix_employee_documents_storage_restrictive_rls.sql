-- Corrige la regresión de RLS que impedía subir manualmente nóminas.
-- Las policies RESTRICTIVE de albaranes se estaban aplicando también a
-- employee-documents y nominas. Cada bucket conserva sus propias policies
-- permisivas: la restricción de albaranes debe evaluar únicamente albaranes.
ALTER POLICY k1_r_albaranes_storage_select_authenticated ON storage.objects
  USING (
    bucket_id <> 'albaranes'
    OR auth.role() = 'authenticated'
  );

ALTER POLICY k1_r_albaranes_storage_insert_owner ON storage.objects
  WITH CHECK (
    bucket_id <> 'albaranes'
    OR (auth.role() = 'authenticated'
      AND (storage.foldername(name))[1] = auth.uid()::text)
  );

ALTER POLICY k1_r_albaranes_storage_update_actor ON storage.objects
  USING (
    bucket_id <> 'albaranes'
    OR ((storage.foldername(name))[1] = auth.uid()::text
      OR public.is_manager_or_admin())
  )
  WITH CHECK (
    bucket_id <> 'albaranes'
    OR ((storage.foldername(name))[1] = auth.uid()::text
      OR public.is_manager_or_admin())
  );

ALTER POLICY k1_r2_albaranes_storage_update_actor ON storage.objects
  USING (
    bucket_id <> 'albaranes'
    OR ((storage.foldername(name))[1] = auth.uid()::text
      OR public.is_purchase_manager_or_admin())
  )
  WITH CHECK (
    bucket_id <> 'albaranes'
    OR ((storage.foldername(name))[1] = auth.uid()::text
      OR public.is_purchase_manager_or_admin())
  );

-- NominasModal sube con upsert:true. Permitir UPDATE únicamente al mismo
-- grupo administrativo que ya puede INSERT/SELECT/DELETE en este bucket.
-- No concede acceso al personal a nóminas de otras personas.
DROP POLICY IF EXISTS employee_docs_managers_update ON storage.objects;
CREATE POLICY employee_docs_managers_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('manager', 'admin')
    )
  );
