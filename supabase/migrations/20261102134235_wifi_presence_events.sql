-- Eventos de presencia Wi-Fi: ingesta exclusiva del webhook con clave de servicio.
-- No se guarda la MAC del dispositivo, solo su cambio de estado.
CREATE TABLE IF NOT EXISTS public.wifi_presence_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('connected', 'disconnected')),
  occurred_at timestamptz NOT NULL,
  push_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wifi_presence_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wifi_presence_events FROM PUBLIC, anon, authenticated;

-- La campana existente es el historial de usuario. Un evento solo puede
-- generar una tarjeta, incluso con reintentos o procesos concurrentes.
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_wifi_presence_event_uidx
  ON public.user_notifications (user_id, entity_id)
  WHERE entity_type = 'wifi_presence' AND entity_id IS NOT NULL;
