-- Segunda fase (después de desplegar clientes que hacen upsert por endpoint).
-- Distintos dispositivos del mismo usuario no se pisan entre sí.
ALTER TABLE public.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;
CREATE INDEX IF NOT EXISTS push_subscriptions_user_lookup
  ON public.push_subscriptions (user_id);
