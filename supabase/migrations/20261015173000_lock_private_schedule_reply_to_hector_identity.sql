-- Evitar que otro perfil pueda hacerse pasar por Héctor cambiando su email.
-- No basta comprobar el nombre o el email: bloquear por UID autenticado real.
BEGIN;
DROP POLICY IF EXISTS schedule_day_note_replies_hector_write
  ON public.schedule_day_note_replies;
CREATE POLICY schedule_day_note_replies_hector_write
  ON public.schedule_day_note_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND author_id = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND lower(trim(p.email)) = 'hhector7722@gmail.com'
    )
    AND EXISTS (
      SELECT 1 FROM public.schedule_day_notes n
      WHERE n.id = note_id
        AND n.user_id <> (SELECT auth.uid())
    )
  );
COMMIT;
