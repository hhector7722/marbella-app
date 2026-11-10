-- Defensa adicional de RLS para los buckets de documentos laborales:
-- incluso si una política permisiva global se añadiera por error, estas
-- políticas restrictivas impiden acceso cruzado o subidas ajenas al manager.
-- No alteran las políticas del bucket albaranes ni de otros buckets.
DROP POLICY IF EXISTS payroll_private_read_guard ON storage.objects;
CREATE POLICY payroll_private_read_guard ON storage.objects
  AS RESTRICTIVE FOR SELECT TO public
  USING (
    bucket_id NOT IN ('employee-documents', 'nominas')
    OR (
      auth.role() = 'authenticated'
      AND (
        (
          bucket_id = 'employee-documents'
          AND (
            EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid() AND p.role IN ('manager', 'admin')
            )
            OR (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
              SELECT 1 FROM public.employee_documents ed
              WHERE ed.storage_path = name AND ed.user_id = auth.uid()
            )
          )
        )
        OR (
          bucket_id = 'nominas'
          AND (
            EXISTS (
              SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid() AND p.role IN ('manager', 'admin')
            )
            OR public.fn_staff_can_read_nomina(name)
            OR public.fn_staff_can_read_nomina_legacy(name)
            OR name LIKE (
              (SELECT p.codigo_empleado FROM public.profiles p WHERE p.id = auth.uid()) || '/%'
            )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS payroll_private_insert_guard ON storage.objects;
CREATE POLICY payroll_private_insert_guard ON storage.objects
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    bucket_id NOT IN ('employee-documents', 'nominas')
    OR (
      auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (p.role = 'manager' OR (bucket_id = 'employee-documents' AND p.role = 'admin'))
      )
    )
  );

DROP POLICY IF EXISTS payroll_private_update_guard ON storage.objects;
CREATE POLICY payroll_private_update_guard ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (
    bucket_id NOT IN ('employee-documents', 'nominas')
    OR (
      auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (p.role = 'manager' OR (bucket_id = 'employee-documents' AND p.role = 'admin'))
      )
    )
  )
  WITH CHECK (
    bucket_id NOT IN ('employee-documents', 'nominas')
    OR (
      auth.role() = 'authenticated'
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (p.role = 'manager' OR (bucket_id = 'employee-documents' AND p.role = 'admin'))
      )
    )
  );
