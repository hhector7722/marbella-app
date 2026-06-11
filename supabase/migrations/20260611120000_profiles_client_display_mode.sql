-- Último modo de cliente (PWA standalone vs navegador) por usuario + informe para managers

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_display_mode text,
  ADD COLUMN IF NOT EXISTS last_display_mode_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_last_display_mode_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_last_display_mode_check
  CHECK (last_display_mode IS NULL OR last_display_mode IN ('standalone', 'browser'));

COMMENT ON COLUMN public.profiles.last_display_mode IS
  'Último modo detectado: standalone = app instalada (PWA), browser = navegador.';
COMMENT ON COLUMN public.profiles.last_display_mode_at IS
  'Momento del último reporte de display mode desde el cliente.';

CREATE OR REPLACE FUNCTION public.get_team_client_install_status()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  role text,
  last_display_mode text,
  last_display_mode_at timestamptz,
  has_push boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    trim(concat(coalesce(p.first_name, ''), ' ', coalesce(p.last_name, ''))) AS full_name,
    p.email,
    p.role,
    p.last_display_mode,
    p.last_display_mode_at,
    EXISTS (
      SELECT 1 FROM public.push_subscriptions ps WHERE ps.user_id = p.id
    ) AS has_push
  FROM public.profiles p
  WHERE p.end_date IS NULL
  ORDER BY
    CASE p.last_display_mode
      WHEN 'browser' THEN 0
      WHEN NULL THEN 1
      WHEN 'standalone' THEN 2
      ELSE 3
    END,
    lower(trim(concat(coalesce(p.first_name, ''), ' ', coalesce(p.last_name, ''))));
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_client_install_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_client_install_status() TO authenticated;

COMMIT;
