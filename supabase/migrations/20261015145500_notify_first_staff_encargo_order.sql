-- La primera comanda creada por personal en Reservas genera el mismo aviso
-- in-app y push que las reservas, con título propio y destinatarios idénticos.
-- No avisar al editar (UPDATE), repetir una comanda del mismo encargo/evento,
-- ni cuando el cliente envía su pedido (estado pending).
BEGIN;

-- Garantía adicional ante carreras o reintentos: un aviso por usuario/encargo.
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_staff_order_once_per_event_idx
  ON public.user_notifications (user_id, entity_id)
  WHERE type = 'staff_order_created' AND entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_notify_first_staff_encargo_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_name text;
  v_event_date date;
  v_event_time time;
  v_guest_count integer;
  v_reservation_id uuid;
  v_body text;
  v_webhook_url text;
  v_notified_count integer := 0;
BEGIN
  -- create_staff_event_order guarda 'confirmed'; el enlace de cliente, 'pending'.
  IF NEW.status IS DISTINCT FROM 'confirmed' OR NEW.event_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Evitar avisos cuando un proceso interno importe pedidos en segundo plano.
  -- La propia create_staff_event_order valida estas mismas condiciones.
  IF auth.uid() IS NULL OR NOT public.can_manage_encargos() THEN
    RETURN NEW;
  END IF;

  -- Serializar dos creaciones simultáneas del mismo encargo.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.event_id::text, 162025));

  IF EXISTS (
    SELECT 1
    FROM public.event_orders o
    WHERE o.event_id = NEW.event_id
      AND o.id <> NEW.id
      AND o.status = 'confirmed'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT e.name, e.event_date, e.event_time, e.guest_count, e.reservation_id
    INTO v_event_name, v_event_date, v_event_time, v_guest_count, v_reservation_id
  FROM public.events e
  WHERE e.id = NEW.event_id;

  v_body := trim(coalesce(nullif(v_event_name, ''), 'Cliente'))
    || E'\n'
    || coalesce(to_char(v_event_date, 'DD/MM/YYYY'), '')
    || ' '
    || coalesce(to_char(v_event_time, 'HH24:MI'), '')
    || E'\nComanda creada por personal';

  INSERT INTO public.user_notifications (
    user_id, type, title, body, action_url, entity_type, entity_id, expires_at
  )
  SELECT
    p.id,
    'staff_order_created',
    'Nueva comanda',
    v_body,
    '/staff/reservas?eventId=' || NEW.event_id::text,
    'event',
    NEW.event_id,
    CASE WHEN v_event_date IS NOT NULL AND v_event_time IS NOT NULL THEN
      (v_event_date + v_event_time) AT TIME ZONE 'Europe/Madrid'
    ELSE NULL END
  FROM public.profiles p
  WHERE lower(trim(p.first_name)) IN ('alba', 'fernando', 'hector', 'willy')
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_notified_count = ROW_COUNT;
  IF v_notified_count <= 0 THEN
    RETURN NEW;
  END IF;

  -- Mismo webhook y mismo sistema push que la creación de reservas.
  SELECT value INTO v_webhook_url
  FROM public.app_settings
  WHERE key = 'push_webhook_url';

  IF v_webhook_url IS NOT NULL THEN
    PERFORM net.http_post(
      v_webhook_url,
      jsonb_build_object(
        'type', 'INSERT',
        'table', 'events',
        'kind', 'staff_order_created',
        'record', jsonb_build_object(
          'id', NEW.event_id,
          'customer_name', coalesce(nullif(v_event_name, ''), 'Cliente'),
          'event_date', v_event_date::text,
          'event_time', to_char(v_event_time, 'HH24:MI'),
          'guest_count', v_guest_count,
          'reservation_id', v_reservation_id
        )
      ),
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

REVOKE ALL ON FUNCTION public.fn_notify_first_staff_encargo_order()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_first_staff_encargo_order
  ON public.event_orders;

CREATE TRIGGER trg_notify_first_staff_encargo_order
AFTER INSERT ON public.event_orders
FOR EACH ROW
WHEN (NEW.status = 'confirmed')
EXECUTE FUNCTION public.fn_notify_first_staff_encargo_order();

COMMIT;
