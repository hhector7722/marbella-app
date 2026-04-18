-- One-off: tickets TPV 1 (numero_documento empieza por 00001TB) con día negocio 16/04/2026
-- -> fecha_real = 18/04/2026 00:00 Europe/Madrid (timestamptz).
-- Ejecutar en Supabase SQL Editor tras revisar el SELECT de comprobación.

-- Vista previa (recomendado):
-- SELECT numero_documento, fecha, fecha_real
-- FROM public.tickets_marbella
-- WHERE numero_documento LIKE '00001TB%'
--   AND fecha = DATE '2026-04-16';

BEGIN;

UPDATE public.tickets_marbella t
SET fecha_real = (DATE '2026-04-18'::timestamp AT TIME ZONE 'Europe/Madrid')
WHERE t.numero_documento LIKE '00001TB%'
  AND t.fecha = DATE '2026-04-16';

UPDATE public.ticket_lines_marbella tl
SET fecha_real = (DATE '2026-04-18'::timestamp AT TIME ZONE 'Europe/Madrid')
FROM public.tickets_marbella t
WHERE tl.numero_documento = t.numero_documento
  AND t.numero_documento LIKE '00001TB%'
  AND t.fecha = DATE '2026-04-16';

COMMIT;
