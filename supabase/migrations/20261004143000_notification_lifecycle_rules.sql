-- Reglas de vida útil de avisos de cabecera.
-- - albaranes: sin notificación in-app
-- - cierres: push únicamente, sin notificación in-app
-- - horario: el aviso nuevo sustituye al anterior y caduca al inicio del turno
-- - reservas/pedidos cliente: caducan al llegar su fecha y hora

BEGIN;

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN public.user_notifications.expires_at IS
  'Momento a partir del cual el aviso deja de estar activo en los badges/paneles.';

CREATE OR REPLACE FUNCTION public.fn_prepare_user_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule_date_text text;
  v_schedule_date date;
  v_schedule_start_text text;
  v_expires_at timestamptz;
  v_event_date date;
  v_event_time time;
BEGIN
  -- Estos eventos pueden seguir teniendo su propio canal (p. ej. push),
  -- pero nunca deben crear una fila in-app.
  IF NEW.type IN ('purchase_invoice_new', 'cash_closing') THEN
    RETURN NULL;
  END IF;

  IF NEW.type = 'schedule' THEN
    -- Un horario nuevo sustituye cualquier aviso de horario anterior
    -- del mismo trabajador.
    DELETE FROM public.user_notifications
    WHERE user_id = NEW.user_id
      AND type = 'schedule';

    v_schedule_date_text := substring(
      coalesce(NEW.action_url, '')
      from 'scheduleDate=([0-9]{4}-[0-9]{2}-[0-9]{2})'
    );

    IF v_schedule_date_text IS NOT NULL THEN
      v_schedule_date := v_schedule_date_text::date;

      -- Fuente preferida: el turno ya persistido/publicado.
      SELECT min(s.start_time)
      INTO v_expires_at
      FROM public.shifts s
      WHERE s.user_id = NEW.user_id
        AND (s.start_time AT TIME ZONE 'Europe/Madrid')::date = v_schedule_date
        AND coalesce(s.is_published, false) = true;

      -- Contingencia para avisos legacy: la hora también está en el body.
      IF v_expires_at IS NULL THEN
        v_schedule_start_text := substring(
          coalesce(NEW.body, '')
          from '^[[:space:]]*([0-9]{1,2}:[0-9]{2})'
        );

        IF v_schedule_start_text IS NOT NULL THEN
          v_expires_at :=
            (v_schedule_date + v_schedule_start_text::time)
            AT TIME ZONE 'Europe/Madrid';
        END IF;
      END IF;

      NEW.expires_at := v_expires_at;
    END IF;

  ELSIF NEW.type = 'reservation_new' AND NEW.entity_id IS NOT NULL THEN
    SELECT r.reservation_date, r.reservation_time
    INTO v_event_date, v_event_time
    FROM public.reservations r
    WHERE r.id = NEW.entity_id;

    IF v_event_date IS NOT NULL AND v_event_time IS NOT NULL THEN
      NEW.expires_at :=
        (v_event_date + v_event_time) AT TIME ZONE 'Europe/Madrid';
    END IF;

  ELSIF NEW.type = 'client_order_submitted' AND NEW.entity_id IS NOT NULL THEN
    SELECT e.event_date, e.event_time
    INTO v_event_date, v_event_time
    FROM public.events e
    WHERE e.id = NEW.entity_id;

    IF v_event_date IS NOT NULL AND v_event_time IS NOT NULL THEN
      NEW.expires_at :=
        (v_event_date + v_event_time) AT TIME ZONE 'Europe/Madrid';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_prepare_user_notification() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_prepare_user_notification
  ON public.user_notifications;

CREATE TRIGGER trg_prepare_user_notification
  BEFORE INSERT ON public.user_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prepare_user_notification();

-- El trigger de albaranes deja de existir; la protección anterior evita además
-- que cualquier inserción legacy vuelva a crear ese tipo de aviso.
DROP TRIGGER IF EXISTS trg_purchase_invoices_notify_insert
  ON public.purchase_invoices;

-- Backfill de avisos existentes.
UPDATE public.user_notifications n
SET expires_at =
  (r.reservation_date + r.reservation_time) AT TIME ZONE 'Europe/Madrid'
FROM public.reservations r
WHERE n.type = 'reservation_new'
  AND n.entity_id = r.id
  AND n.expires_at IS NULL;

UPDATE public.user_notifications n
SET expires_at =
  (e.event_date + e.event_time) AT TIME ZONE 'Europe/Madrid'
FROM public.events e
WHERE n.type = 'client_order_submitted'
  AND n.entity_id = e.id
  AND n.expires_at IS NULL
  AND e.event_date IS NOT NULL
  AND e.event_time IS NOT NULL;

UPDATE public.user_notifications n
SET expires_at = (
  SELECT min(s.start_time)
  FROM public.shifts s
  WHERE s.user_id = n.user_id
    AND (s.start_time AT TIME ZONE 'Europe/Madrid')::date =
      substring(
        coalesce(n.action_url, '')
        from 'scheduleDate=([0-9]{4}-[0-9]{2}-[0-9]{2})'
      )::date
    AND coalesce(s.is_published, false) = true
)
WHERE n.type = 'schedule'
  AND n.expires_at IS NULL
  AND substring(
        coalesce(n.action_url, '')
        from 'scheduleDate=([0-9]{4}-[0-9]{2}-[0-9]{2})'
      ) IS NOT NULL;

UPDATE public.user_notifications n
SET expires_at = (
  substring(
    coalesce(n.action_url, '')
    from 'scheduleDate=([0-9]{4}-[0-9]{2}-[0-9]{2})'
  )::date
  +
  substring(
    coalesce(n.body, '')
    from '^[[:space:]]*([0-9]{1,2}:[0-9]{2})'
  )::time
) AT TIME ZONE 'Europe/Madrid'
WHERE n.type = 'schedule'
  AND n.expires_at IS NULL
  AND substring(
        coalesce(n.action_url, '')
        from 'scheduleDate=([0-9]{4}-[0-9]{2}-[0-9]{2})'
      ) IS NOT NULL
  AND substring(
        coalesce(n.body, '')
        from '^[[:space:]]*([0-9]{1,2}:[0-9]{2})'
      ) IS NOT NULL;

-- Para cada trabajador solo conserva el aviso de horario más reciente.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.user_notifications
  WHERE type = 'schedule'
)
DELETE FROM public.user_notifications n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

-- Si quedaba alguno pendiente de los tipos que ya no pertenecen a la campana,
-- deja de existir como pendiente.
DELETE FROM public.user_notifications
WHERE type IN ('purchase_invoice_new', 'cash_closing')
  AND read_at IS NULL;

DROP VIEW IF EXISTS public.user_notifications_active;

CREATE VIEW public.user_notifications_active
WITH (security_invoker = true)
AS
SELECT *
FROM public.user_notifications
WHERE read_at IS NULL
  AND (expires_at IS NULL OR expires_at > now());

REVOKE ALL ON public.user_notifications_active FROM PUBLIC;
GRANT SELECT ON public.user_notifications_active TO authenticated;

COMMIT;
