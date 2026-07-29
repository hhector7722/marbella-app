-- Verificación post-despliegue (Supabase SQL Editor)
-- Sustituir la fecha si no es el día de prueba.

SELECT
  (timezone('Europe/Madrid', now()))::date AS hoy_madrid,
  count(*) FILTER (WHERE (fecha)::date = (timezone('Europe/Madrid', now()))::date) AS tickets_fecha_hoy,
  count(*) FILTER (WHERE (fecha)::date < (timezone('Europe/Madrid', now()))::date
    AND (timezone('Europe/Madrid', created_at))::date = (timezone('Europe/Madrid', now()))::date) AS mal_fechados_recibidos_hoy,
  round(sum(total_documento) FILTER (WHERE (fecha)::date = (timezone('Europe/Madrid', now()))::date), 2) AS total_ventas_hoy
FROM public.tickets_marbella;

SELECT numero_documento, fecha, hora_cierre, total_documento, created_at
FROM public.tickets_marbella
WHERE (fecha)::date = (timezone('Europe/Madrid', now()))::date
ORDER BY created_at DESC
LIMIT 10;
