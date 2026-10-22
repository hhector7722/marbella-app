CREATE OR REPLACE FUNCTION public.get_ventas_crossfilter(p_start_date date, p_end_date date, p_hour integer DEFAULT NULL::integer, p_product_id integer DEFAULT NULL::integer, p_payment text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH scoped AS MATERIALIZED (
 SELECT t.numero_documento, t.fecha, t.hora_cierre, t.mesa, t.total_documento,
        EXTRACT(HOUR FROM timezone('Europe/Madrid',
          public.fn_parse_ticket_hora_cierre_ts(t.fecha,t.hora_cierre,t.fecha_real)))::integer AS sale_hour
 FROM public.tickets_marbella t
 WHERE t.fecha BETWEEN p_start_date AND p_end_date
   AND (p_payment IS NULL
     OR (p_payment = 'card' AND coalesce(t.cobro_tarjeta,0) > 0)
     OR (p_payment = 'cash' AND coalesce(t.cobro_efectivo,0) > 0)
     OR (p_payment = 'pending' AND coalesce(t.cobro_pendiente,0) > 0))
), chosen AS MATERIALIZED (
 SELECT t.*
 FROM scoped t
 WHERE (p_hour IS NULL OR t.sale_hour = p_hour)
   AND (p_product_id IS NULL OR EXISTS (
       SELECT 1 FROM public.ticket_lines_marbella l
       WHERE l.numero_documento=t.numero_documento AND l.articulo_id=p_product_id))
), chosen_lines AS MATERIALIZED (
 SELECT l.numero_documento,l.articulo_id, l.unidades,l.importe_total,
        COALESCE(NULLIF(btrim(a.nombre),''), NULLIF(btrim(l.nombre),''),
        'Artículo desconocido ('||l.articulo_id::text||')') AS name
 FROM public.ticket_lines_marbella l
 JOIN chosen t ON t.numero_documento=l.numero_documento
 LEFT JOIN public.bdp_articulos a ON a.id=l.articulo_id
 WHERE (p_product_id IS NULL OR l.articulo_id=p_product_id)
), line_totals AS (
 SELECT numero_documento, sum(importe_total) as amount FROM chosen_lines GROUP BY numero_documento
), totals AS (
 SELECT count(*)::bigint AS count_tickets,
        coalesce(sum(CASE WHEN p_product_id IS NULL THEN c.total_documento ELSE coalesce(lt.amount,0) END),0)::numeric AS revenue
 FROM chosen c LEFT JOIN line_totals lt ON lt.numero_documento=c.numero_documento
), hour_totals AS (
 SELECT c.sale_hour AS hr, count(*)::bigint n,
        coalesce(sum(CASE WHEN p_product_id IS NULL THEN c.total_documento ELSE coalesce(lt.amount,0) END),0)::numeric AS revenue
 FROM chosen c LEFT JOIN line_totals lt ON lt.numero_documento=c.numero_documento
 WHERE c.sale_hour BETWEEN 0 AND 23
 GROUP BY c.sale_hour
), product_totals AS (
 SELECT l.articulo_id,l.name,
        sum(l.unidades)::numeric qty,
        sum(l.importe_total)::numeric revenue
 FROM chosen_lines l GROUP BY l.articulo_id,l.name
), ticket_page AS (
 SELECT c.numero_documento,c.fecha,c.hora_cierre,c.mesa,c.total_documento,
        public.fn_parse_ticket_hora_cierre_ts(c.fecha,c.hora_cierre,null) as sort_time
 FROM chosen c
 ORDER BY c.fecha DESC,
    sort_time DESC NULLS LAST,
    c.numero_documento DESC
 LIMIT greatest(1,least(coalesce(p_limit,7),200))
 OFFSET greatest(0,coalesce(p_offset,0))
)
SELECT jsonb_build_object(
  'summary',jsonb_build_object(
      'totalSales',(SELECT revenue FROM totals),
      'count',(SELECT count_tickets FROM totals),
      'avgTicket',(SELECT CASE WHEN count_tickets>0 THEN revenue/count_tickets ELSE 0 END FROM totals)),
  'products',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'articulo_id',p.articulo_id,'nombre_articulo',p.name,
        'cantidad_total',p.qty,'total_ingresos',p.revenue)
     ORDER BY p.revenue DESC,p.name) FROM product_totals p),'[]'::jsonb),
  'hours',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'hour',h.hr,'count',h.n,'total',h.revenue) ORDER BY h.hr)
     FROM hour_totals h),'[]'::jsonb),
  'tickets',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'numero_documento',t.numero_documento,'fecha',t.fecha::text,
        'hora_cierre',t.hora_cierre,'mesa',t.mesa,'total_documento',t.total_documento
    ) ORDER BY t.fecha DESC,t.sort_time DESC NULLS LAST,t.numero_documento DESC)
      FROM ticket_page t),'[]'::jsonb),
  'hasMore',(SELECT count_tickets > (greatest(0,coalesce(p_offset,0))
                                 +greatest(1,least(coalesce(p_limit,7),200))) FROM totals)
);
$function$;

REVOKE ALL ON FUNCTION public.get_ventas_crossfilter(date,date,integer,integer,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ventas_crossfilter(date,date,integer,integer,text,integer,integer) TO authenticated;
