-- Migration: 20260708120000_reservations_push_via_pgnet.sql
-- Descripción: Llama al webhook de push notifications desde el trigger de BD
-- usando pg_net, eliminando la dependencia del Database Webhook del Dashboard.

-- 1. Activar pg_net si no está
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Tabla de configuración interna
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Permitir lectura a authenticated (opcional, para debug)
CREATE POLICY "app_settings_read_authenticated"
    ON public.app_settings FOR SELECT TO authenticated
    USING (true);

-- Insertar URL del webhook de push
INSERT INTO public.app_settings (key, value)
VALUES (
    'push_webhook_url',
    'https://marbella-app-git-main-hhector7722s-projects.vercel.app/api/webhooks/reservations-push'
)
ON CONFLICT (key) DO NOTHING;

-- 3. Actualizar la función del trigger para llamar al webhook via pg_net
CREATE OR REPLACE FUNCTION public.fn_notify_reservation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
  v_webhook_url text;
  v_record_json jsonb;
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

  -- Insertar notificaciones in-app (campana)
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
  WHERE lower(trim(p.first_name)) IN (
    'alba',
    'hernan',
    'pere',
    'hector'
  );

  -- Llamar al webhook de push via pg_net (asíncrono)
  SELECT value INTO v_webhook_url FROM public.app_settings
  WHERE key = 'push_webhook_url';

  IF v_webhook_url IS NOT NULL THEN
    v_record_json := jsonb_build_object(
      'type', 'INSERT',
      'table', 'reservations',
      'record', jsonb_build_object(
        'id', NEW.id,
        'customer_name', NEW.customer_name,
        'customer_phone', NEW.customer_phone,
        'pax', NEW.pax,
        'reservation_date', NEW.reservation_date::text,
        'reservation_time', NEW.reservation_time::text,
        'status', NEW.status,
        'notes', NEW.notes
      )
    );

    PERFORM net.http_post(
      v_webhook_url,
      v_record_json,
      NULL,
      jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Pgnet', 'true'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
