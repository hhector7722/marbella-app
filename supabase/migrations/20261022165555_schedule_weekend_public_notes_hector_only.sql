-- Nota general del sábado/domingo: lectura para cualquier usuario autenticado;
-- edición exclusiva de la identidad real de Héctor.
BEGIN;
CREATE TABLE IF NOT EXISTS public.schedule_weekend_public_notes (
  note_date date PRIMARY KEY,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_weekend_public_notes_weekend_chk CHECK (extract(isodow FROM note_date) IN (6, 7))
);
ALTER TABLE public.schedule_weekend_public_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_weekend_public_notes FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.schedule_weekend_public_notes TO authenticated;
GRANT UPDATE (content, updated_at) ON public.schedule_weekend_public_notes TO authenticated;
CREATE POLICY schedule_weekend_public_notes_read ON public.schedule_weekend_public_notes
 FOR SELECT TO authenticated USING (true);
CREATE POLICY schedule_weekend_public_notes_insert_hector ON public.schedule_weekend_public_notes
 FOR INSERT TO authenticated WITH CHECK (
 (SELECT auth.uid()) = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid AND
 EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid())
  AND lower(btrim(p.email)) = 'hhector7722@gmail.com')
);
CREATE POLICY schedule_weekend_public_notes_update_hector ON public.schedule_weekend_public_notes
 FOR UPDATE TO authenticated
 USING ((SELECT auth.uid()) = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid)
 WITH CHECK ((SELECT auth.uid()) = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid);
CREATE POLICY schedule_weekend_public_notes_delete_hector ON public.schedule_weekend_public_notes
 FOR DELETE TO authenticated
 USING ((SELECT auth.uid()) = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid);
NOTIFY pgrst, 'reload schema';
COMMIT;
