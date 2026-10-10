-- Control de horario de Estado de sala / KDS.
-- Migración aplicada a Supabase el 2026-10-10, versión 20261010114901.
-- El calendario se evalúa en Europe/Madrid, no según la zona UTC del servidor.
-- No afecta a tickets, cobros, ventas, cierres de caja ni deducciones de stock.
-- Al devolver NULL, Postgres omite la escritura de estado_sala y no dispara
-- trg_update_kds_on_sala_change los sábados y domingos.
CREATE OR REPLACE FUNCTION public.fn_estado_sala_weekdays_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $gate$
BEGIN
  IF EXTRACT(ISODOW FROM (statement_timestamp() AT TIME ZONE 'Europe/Madrid')) IN (6, 7) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$gate$;

REVOKE ALL ON FUNCTION public.fn_estado_sala_weekdays_gate() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_00_estado_sala_weekdays_gate ON public.estado_sala;
CREATE TRIGGER trg_00_estado_sala_weekdays_gate
BEFORE INSERT OR UPDATE ON public.estado_sala
FOR EACH ROW EXECUTE FUNCTION public.fn_estado_sala_weekdays_gate();

COMMENT ON FUNCTION public.fn_estado_sala_weekdays_gate() IS
  'Suspende escrituras y procesamiento del KDS en estado_sala los sabados y domingos (Europe/Madrid); no afecta ventas ni caja.';
