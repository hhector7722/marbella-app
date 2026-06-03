-- Destinatarios acotados: reservas (Hector, Pere, Hernan), cierre/albarán (solo Hector)

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
  WHERE lower(trim(p.email)) IN (
    'hhector7722@gmail.com',
    'pereboladeres@gmail.com',
    'hernang6799@gmail.com'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_notify_purchase_invoice_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text;
  v_supplier_name text;
BEGIN
  SELECT s.name INTO v_supplier_name
  FROM public.suppliers s
  WHERE s.id = NEW.supplier_id;

  v_body := trim(concat(
    coalesce(nullif(trim(NEW.invoice_number), ''), 'Sin número'),
    ' · ',
    coalesce(v_supplier_name, 'Proveedor'),
    ' · ',
    coalesce(to_char(NEW.invoice_date, 'DD/MM/YYYY'), '—')
  ));

  INSERT INTO public.user_notifications (
    user_id, type, title, body, action_url, entity_type, entity_id
  )
  SELECT
    p.id,
    'purchase_invoice_new',
    'Nuevo albarán',
    v_body,
    '/dashboard/albaranes?id=' || NEW.id::text,
    'purchase_invoice',
    NEW.id
  FROM public.profiles p
  WHERE lower(trim(p.email)) = 'hhector7722@gmail.com';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_invoices_notify_insert ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoices_notify_insert
  AFTER INSERT ON public.purchase_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_purchase_invoice_insert();
