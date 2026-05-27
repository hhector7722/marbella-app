BEGIN;

-- -----------------------------------------------------------------------------
-- Reservations module (public landing + staff management)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  reservation_date date NOT NULL,
  reservation_time time NOT NULL,
  pax integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Grants: public site can INSERT via anon; staff can SELECT/UPDATE via authenticated.
REVOKE ALL ON TABLE public.reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.reservations FROM anon;
REVOKE ALL ON TABLE public.reservations FROM authenticated;

GRANT INSERT ON TABLE public.reservations TO anon;
GRANT INSERT ON TABLE public.reservations TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.reservations TO authenticated;

-- RLS policies
DROP POLICY IF EXISTS reservations_insert_anon ON public.reservations;
CREATE POLICY reservations_insert_anon
ON public.reservations
FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS reservations_insert_authenticated ON public.reservations;
CREATE POLICY reservations_insert_authenticated
ON public.reservations
FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS reservations_select_authenticated ON public.reservations;
CREATE POLICY reservations_select_authenticated
ON public.reservations
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS reservations_update_authenticated ON public.reservations;
CREATE POLICY reservations_update_authenticated
ON public.reservations
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- RPC: consultar_reservas(p_fecha date) -> jsonb (array)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consultar_reservas(p_fecha date)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      to_jsonb(r) ORDER BY r.reservation_time ASC, r.created_at ASC
    ),
    '[]'::jsonb
  )
  FROM public.reservations AS r
  WHERE r.reservation_date = p_fecha;
$$;

REVOKE ALL ON FUNCTION public.consultar_reservas(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consultar_reservas(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.consultar_reservas(date) TO authenticated;

-- -----------------------------------------------------------------------------
-- RPC: gestionar_reservas(p_accion text, p_datos jsonb) -> jsonb
-- actions: 'confirm' | 'reject' | 'cancel'
-- p_datos: { id: <uuid> }
-- -----------------------------------------------------------------------------
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

REVOKE ALL ON FUNCTION public.gestionar_reservas(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gestionar_reservas(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.gestionar_reservas(text, jsonb) TO authenticated;

COMMIT;

