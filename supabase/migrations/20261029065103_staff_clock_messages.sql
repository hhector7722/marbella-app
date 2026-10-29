-- Mensajes privados de Héctor entregados únicamente tras el siguiente fichaje
-- de entrada o salida real del usuario destinatario.
CREATE TABLE IF NOT EXISTS public.staff_clock_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  CONSTRAINT staff_clock_messages_ack_after_created CHECK (
    acknowledged_at IS NULL OR acknowledged_at >= created_at
  )
);

CREATE INDEX IF NOT EXISTS idx_staff_clock_messages_unread
  ON public.staff_clock_messages (recipient_id, created_at)
  WHERE acknowledged_at IS NULL;

ALTER TABLE public.staff_clock_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_clock_messages FROM public, anon, authenticated;
GRANT SELECT, INSERT ON public.staff_clock_messages TO authenticated;
GRANT UPDATE (acknowledged_at) ON public.staff_clock_messages TO authenticated;

-- El destinatario solo puede leer después de que haya fichado nuevamente,
-- contando exclusivamente fichajes reales (no registros manuales).
-- Se utiliza una expresión explícita en ambas políticas SELECT/UPDATE:
-- que se haya creado el mensaje no equivale a que pueda mostrarse.
CREATE POLICY staff_clock_messages_read_after_clock
  ON public.staff_clock_messages FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = recipient_id
    AND EXISTS (
      SELECT 1 FROM public.time_logs tl
      WHERE tl.user_id = recipient_id
        AND coalesce(tl.is_manual_entry, false) = false
        AND (
          tl.clock_in > staff_clock_messages.created_at
          OR tl.clock_out > staff_clock_messages.created_at
        )
    )
  );

CREATE POLICY staff_clock_messages_owner_read
  ON public.staff_clock_messages FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = sender_id
    AND lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com'
  );

CREATE POLICY staff_clock_messages_owner_insert
  ON public.staff_clock_messages FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND lower(coalesce((SELECT auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com'
  );

-- GRANT UPDATE solo sobre acknowledged_at; no puede cambiarse destinatario,
-- remitente, texto ni fecha desde un cliente autenticado.
CREATE POLICY staff_clock_messages_recipient_ack
  ON public.staff_clock_messages FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = recipient_id
    AND acknowledged_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.time_logs tl
      WHERE tl.user_id = recipient_id
        AND coalesce(tl.is_manual_entry, false) = false
        AND (
          tl.clock_in > staff_clock_messages.created_at
          OR tl.clock_out > staff_clock_messages.created_at
        )
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = recipient_id
    AND acknowledged_at IS NOT NULL
  );
