-- ¿Cuántas ventas hay realmente? (fecha contable vs recepción)
SELECT
  (timezone('Europe/Madrid', now()))::date AS hoy_madrid,
  count(*) FILTER (WHERE (t.fecha)::date = (timezone('Europe/Madrid', now()))::date) AS tickets_fecha_hoy,
  count(*) FILTER (WHERE (t.fecha)::date = (timezone('Europe/Madrid', now()))::date - 1) AS tickets_fecha_ayer,
  count(*) FILTER (
    WHERE (timezone('Europe/Madrid', t.created_at))::date = (timezone('Europe/Madrid', now()))::date
  ) AS recibidos_hoy_en_servidor,
  round(sum(t.total_documento) FILTER (WHERE (t.fecha)::date = (timezone('Europe/Madrid', now()))::date), 2) AS total_fecha_hoy,
  round(sum(t.total_documento) FILTER (WHERE (t.fecha)::date = (timezone('Europe/Madrid', now()))::date - 1), 2) AS total_fecha_ayer
FROM public.tickets_marbella t;

-- Desglose por día contable (últimos 2 días)
SELECT
  (t.fecha)::date AS dia_contable,
  count(*) AS tickets,
  round(sum(t.total_documento), 2) AS total
FROM public.tickets_marbella t
WHERE (t.fecha)::date >= (timezone('Europe/Madrid', now()))::date - 1
GROUP BY 1
ORDER BY 1 DESC;
