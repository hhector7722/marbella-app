-- Migration: 20260707120000_reservations_notify_trigger.sql
-- Descripción: Agrega el trigger faltante a la tabla reservations para que se dispare
-- la función fn_notify_reservation_insert() y se inserten notificaciones in-app.

DROP TRIGGER IF EXISTS trg_reservations_notify_insert ON public.reservations;

CREATE TRIGGER trg_reservations_notify_insert
  AFTER INSERT ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_reservation_insert();
