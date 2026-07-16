BEGIN;

-- Auditoría informativa (no afecta lógica)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS created_from text;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS filled_by text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_created_from_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_created_from_check
      CHECK (created_from IS NULL OR created_from IN ('reservation', 'standalone'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_filled_by_check'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_filled_by_check
      CHECK (filled_by IS NULL OR filled_by IN ('staff', 'client'));
  END IF;
END $$;

COMMENT ON COLUMN public.events.created_from IS
  'Auditoría: reservation | standalone. Quién originó el encargo.';
COMMENT ON COLUMN public.events.filled_by IS
  'Auditoría: staff | client. Quién realizó el primer rellenado con líneas.';

-- Backfill created_from
UPDATE public.events
SET created_from = CASE
  WHEN reservation_id IS NOT NULL THEN 'reservation'
  ELSE 'standalone'
END
WHERE created_from IS NULL;

-- Reabrir: solo flags; NO tocar event_orders
CREATE OR REPLACE FUNCTION public.reopen_client_order(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.events%ROWTYPE;
  v_token uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'no_autenticado';
  END IF;
  IF NOT public.can_manage_encargos() THEN
    RAISE EXCEPTION 'sin_permiso';
  END IF;

  SELECT * INTO v_event FROM public.events e WHERE e.id = p_event_id LIMIT 1;
  IF v_event.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_event.client_order_submitted_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_submitted');
  END IF;

  v_token := coalesce(v_event.client_edit_token, gen_random_uuid());

  UPDATE public.events
  SET
    client_edit_enabled = true,
    client_edit_token = v_token,
    client_order_submitted_at = NULL,
    updated_at = now()
  WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'ok', true,
    'event_id', v_event.id,
    'client_edit_token', v_token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_client_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_client_order(uuid) TO authenticated;

-- Deprecar request_new_client_order → redirige a reopen (sin vaciar líneas)
CREATE OR REPLACE FUNCTION public.request_new_client_order(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.reopen_client_order(p_event_id);
END;
$$;

COMMIT;
