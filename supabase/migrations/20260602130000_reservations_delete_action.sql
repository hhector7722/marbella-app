BEGIN;

-- Permite eliminar reservas desde staff (gestionar_reservas acción 'delete')
GRANT DELETE ON TABLE public.reservations TO authenticated;

DROP POLICY IF EXISTS reservations_delete_authenticated ON public.reservations;
CREATE POLICY reservations_delete_authenticated
ON public.reservations
FOR DELETE
TO authenticated
USING (true);

CREATE OR REPLACE FUNCTION public.gestionar_reservas(p_accion text, p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_new_status text;
BEGIN
  v_id := NULLIF(trim(both from (p_datos->>'id')), '')::uuid;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'reservation id requerido';
  END IF;

  IF p_accion = 'delete' THEN
    DELETE FROM public.reservations WHERE id = v_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'not_found', 'id', v_id);
    END IF;
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'deleted', true);
  END IF;

  v_new_status := CASE p_accion
    WHEN 'confirm' THEN 'confirmed'
    WHEN 'reject' THEN 'rejected'
    WHEN 'cancel' THEN 'cancelled'
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    RAISE EXCEPTION 'accion_invalida: %', p_accion;
  END IF;

  UPDATE public.reservations
  SET status = v_new_status
  WHERE id = v_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found', 'id', v_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', v_new_status);
END;
$$;

COMMIT;
