-- Migration: 20260707120500_update_reservation_notify_recipients.sql
-- Descripción: Actualiza los destinatarios de las notificaciones de reservas 
-- usando first_name (Alba, Hernan, Pere, Hector) en lugar de emails específicos.

CREATE OR REPLACE FUNCTION public.fn_notify_reservation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
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

  RETURN NEW;
END;
$$;
