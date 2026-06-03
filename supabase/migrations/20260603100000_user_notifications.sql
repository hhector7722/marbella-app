-- In-app notifications (campana Navbar) — RLS por usuario + realtime

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  action_url text NOT NULL,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON public.user_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx
  ON public.user_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_notifications FROM PUBLIC;
GRANT SELECT, UPDATE ON TABLE public.user_notifications TO authenticated;

DROP POLICY IF EXISTS user_notifications_select_own ON public.user_notifications;
CREATE POLICY user_notifications_select_own
  ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notifications_update_own ON public.user_notifications;
CREATE POLICY user_notifications_update_own
  ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Inserciones solo vía funciones SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.create_user_notifications_bulk(
  p_user_ids uuid[],
  p_type text,
  p_title text,
  p_body text,
  p_action_url text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_count integer;
BEGIN
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN 0;
  END IF;

  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF v_caller_role NOT IN ('manager', 'admin', 'supervisor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.user_notifications (
    user_id, type, title, body, action_url, entity_type, entity_id
  )
  SELECT
    uid,
    p_type,
    p_title,
    NULLIF(trim(both from coalesce(p_body, '')), ''),
    p_action_url,
    p_entity_type,
    p_entity_id
  FROM unnest(p_user_ids) AS uid
  WHERE uid IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_notifications_bulk(uuid[], text, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_notifications_bulk(uuid[], text, text, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_notify_reservation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
BEGIN
  v_body := trim(concat(
    NEW.customer_name,
    ' · ',
    NEW.pax::text,
    ' pax · ',
    to_char(NEW.reservation_date, 'DD/MM/YYYY'),
    ' ',
    to_char(NEW.reservation_time, 'HH24:MI')
  ));

  INSERT INTO public.user_notifications (
    user_id, type, title, body, action_url, entity_type, entity_id
  )
  SELECT
    p.id,
    'reservation_new',
    'Nueva reserva',
    v_body,
    '/staff/reservas?id=' || NEW.id::text,
    'reservation',
    NEW.id
  FROM public.profiles p
  WHERE p.role IN ('staff', 'supervisor', 'manager', 'admin', 'chef');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservations_notify_insert ON public.reservations;
CREATE TRIGGER trg_reservations_notify_insert
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_reservation_insert();

ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END $$;

COMMIT;
