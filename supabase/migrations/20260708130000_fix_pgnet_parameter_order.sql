-- Migration: 20260708130000_fix_pgnet_parameter_order.sql
-- Descripción: Corrige el orden de parámetros de net.http_post en la función del trigger

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
      v_record_json::text,
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
