-- Inserción in-app desde cierre de caja (cualquier usuario autenticado que cierra)

CREATE OR REPLACE FUNCTION public.create_user_notifications_system(
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
  v_count integer;
BEGIN
  IF p_type NOT IN ('cash_closing') THEN
    RAISE EXCEPTION 'invalid_system_notification_type';
  END IF;
  IF p_user_ids IS NULL OR cardinality(p_user_ids) = 0 THEN
    RETURN 0;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
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

REVOKE ALL ON FUNCTION public.create_user_notifications_system(uuid[], text, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_notifications_system(uuid[], text, text, text, text, text, uuid) TO authenticated;
