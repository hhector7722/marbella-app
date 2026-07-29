-- Recuperación post-volcado: verificar que hora_cierre ya no está agrupada en una sola hora.
-- Ejecutar en Supabase SQL Editor DESPUÉS de re-enviar ventas desde el TPV (catch-up).

-- 1) Diagnóstico: ¿todas las ventas de hoy caen en la misma hora?
SELECT
  EXTRACT(HOUR FROM timezone('Europe/Madrid', public.fn_parse_ticket_hora_cierre_ts(
    (t.fecha)::date, t.hora_cierre, t.fecha_real
  )))::int AS hora_madrid,
  count(*) AS tickets,
  round(sum(t.total_documento), 2) AS total
FROM public.tickets_marbella t
WHERE (t.fecha)::date = (timezone('Europe/Madrid', now()))::date
GROUP BY 1
ORDER BY 1;

-- 2) Si solo hay 1 hora (ej. 13): aún no se ha re-sincronizado desde BDP con el fix del receptor.

-- 3) Muestra de tickets con hora de cierre parseada
SELECT
  t.numero_documento,
  t.hora_cierre,
  timezone('Europe/Madrid', public.fn_parse_ticket_hora_cierre_ts(
    (t.fecha)::date, t.hora_cierre, t.fecha_real
  )) AS cierre_madrid,
  t.total_documento,
  t.created_at AS recibido_en_supabase
FROM public.tickets_marbella t
WHERE (t.fecha)::date = (timezone('Europe/Madrid', now()))::date
ORDER BY cierre_madrid
LIMIT 20;
