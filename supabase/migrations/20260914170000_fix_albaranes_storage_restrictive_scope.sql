-- Las policies RESTRICTIVE de K1 sobre storage.objects estaban mal acotadas:
-- exigían bucket_id = 'albaranes' para CUALQUIER fila. En Postgres, las
-- restrictive se AND-ean: eso denegaba SELECT/INSERT/UPDATE en el resto de
-- buckets privados (pavilion_activities, cash_closings, nominas, …) aunque
-- tuvieran policies permisivas correctas. createSignedUrl devolvía
-- «Object not found» (NoSuchKey) con JWT autenticado.
--
-- Forma correcta de una restrictive por bucket: dejar pasar el resto
-- (bucket_id <> 'albaranes' OR <regla del bucket>).

DROP POLICY IF EXISTS k1_r_albaranes_storage_select_authenticated ON storage.objects;
CREATE POLICY k1_r_albaranes_storage_select_authenticated ON storage.objects
  AS RESTRICTIVE FOR SELECT TO public
  USING (
    bucket_id <> 'albaranes'
    OR auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS k1_r_albaranes_storage_insert_owner ON storage.objects;
CREATE POLICY k1_r_albaranes_storage_insert_owner ON storage.objects
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (
    bucket_id <> 'albaranes'
    OR (
      auth.role() = 'authenticated'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS k1_r_albaranes_storage_update_actor ON storage.objects;
CREATE POLICY k1_r_albaranes_storage_update_actor ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (
    bucket_id <> 'albaranes'
    OR (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_manager_or_admin()
    )
  )
  WITH CHECK (
    bucket_id <> 'albaranes'
    OR (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_manager_or_admin()
    )
  );

DROP POLICY IF EXISTS k1_r2_albaranes_storage_update_actor ON storage.objects;
CREATE POLICY k1_r2_albaranes_storage_update_actor ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (
    bucket_id <> 'albaranes'
    OR (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_purchase_manager_or_admin()
    )
  )
  WITH CHECK (
    bucket_id <> 'albaranes'
    OR (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_purchase_manager_or_admin()
    )
  );
