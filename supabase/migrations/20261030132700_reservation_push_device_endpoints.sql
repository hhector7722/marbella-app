-- Primera fase: preparar claves únicas por dispositivo sin romper los clientes
-- aún desplegados que realizan upsert por user_id.
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS endpoint text GENERATED ALWAYS AS (subscription->>'endpoint') STORED;

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_unique
  ON public.push_subscriptions (endpoint);
