-- Backfill opcional: tickets recibidos hoy en Supabase pero con (fecha)::date de ayer.
-- Ejecutar en SQL Editor de Supabase solo si tras catch-up siguen faltando ventas en el dashboard de hoy.

UPDATE public.tickets_marbella t
SET
  fecha = COALESCE(t.fecha_real, t.created_at),
  hora_cierre = COALESCE(t.fecha_real, t.created_at)::text,
  fecha_real = COALESCE(t.fecha_real, t.created_at)
WHERE (timezone('Europe/Madrid', t.created_at))::date = (timezone('Europe/Madrid', now()))::date
  AND (t.fecha)::date < (timezone('Europe/Madrid', now()))::date;

UPDATE public.ticket_lines_marbella tl
SET
  fecha_negocio = t.fecha,
  fecha_real = COALESCE(tl.fecha_real, t.fecha_real, t.created_at)
FROM public.tickets_marbella t
WHERE tl.numero_documento = t.numero_documento
  AND (timezone('Europe/Madrid', t.created_at))::date = (timezone('Europe/Madrid', now()))::date
  AND (tl.fecha_negocio)::date < (timezone('Europe/Madrid', now()))::date;
