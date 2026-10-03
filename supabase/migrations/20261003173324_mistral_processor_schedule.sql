-- Vercel Hobby limita sus cron a una ejecución diaria. pg_cron despierta al
-- procesador en Vercel; la cola durable y la lease siguen residiendo aquí.
-- El secreto se aprovisiona en Vault fuera del repositorio.
CREATE OR REPLACE FUNCTION public.wake_mistral_processor()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
  v_request_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'marbella_mistral_cron_secret';
  IF v_secret IS NULL OR length(v_secret) < 16 THEN
    RAISE EXCEPTION 'Falta secreto del procesador Mistral en Vault';
  END IF;
  SELECT net.http_post(
    url := 'https://marbella-app.vercel.app/api/internal/albaranes/mistral-process',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    timeout_milliseconds := 5000
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wake_mistral_processor() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'marbella-mistral-process',
  '*/2 * * * *',
  'select public.wake_mistral_processor();'
);
