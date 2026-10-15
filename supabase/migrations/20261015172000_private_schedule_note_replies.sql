-- Respuestas privadas de Héctor a las notas del horario.
-- Una respuesta por nota; solo Héctor puede contestar y únicamente el autor
-- de la nota original y Héctor pueden leerla, incluso si otro manager ve la nota.
BEGIN;

CREATE TABLE IF NOT EXISTS public.schedule_day_note_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL UNIQUE REFERENCES public.schedule_day_notes(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_day_note_replies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.schedule_day_note_replies FROM anon, authenticated;
GRANT SELECT, INSERT ON public.schedule_day_note_replies TO authenticated;

DROP POLICY IF EXISTS schedule_day_note_replies_read_private
  ON public.schedule_day_note_replies;
CREATE POLICY schedule_day_note_replies_read_private
  ON public.schedule_day_note_replies
  FOR SELECT TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.schedule_day_notes n
      WHERE n.id = note_id AND n.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS schedule_day_note_replies_hector_write
  ON public.schedule_day_note_replies;
CREATE POLICY schedule_day_note_replies_hector_write
  ON public.schedule_day_note_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
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

-- El aviso en campana se crea en la misma transacción que la respuesta.
-- Una actualización de la nota original no provoca una nueva notificación.
CREATE OR REPLACE FUNCTION public.fn_notify_private_schedule_note_reply()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_note public.schedule_day_notes%ROWTYPE;
BEGIN
  SELECT * INTO v_note
  FROM public.schedule_day_notes
  WHERE id = NEW.note_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la nota original';
  END IF;

  INSERT INTO public.user_notifications (
    user_id, type, title, body, action_url, entity_type, entity_id, expires_at
  ) VALUES (
    v_note.user_id,
    'schedule_note_reply',
    'Héctor ha respondido a tu nota',
    left(btrim(NEW.content), 180),
    '/staff/dashboard?scheduleDate=' || v_note.date::text,
    'schedule_day_note',
    NEW.note_id,
    now() + interval '30 days'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_notify_private_schedule_note_reply()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_private_schedule_note_reply
  ON public.schedule_day_note_replies;
CREATE TRIGGER trg_notify_private_schedule_note_reply
AFTER INSERT ON public.schedule_day_note_replies
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_private_schedule_note_reply();

NOTIFY pgrst, 'reload schema';
COMMIT;
