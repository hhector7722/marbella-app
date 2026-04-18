-- One-off: TPV 1 → fecha_real = 18/04/2026 (medianoche Europe/Madrid)
-- Día negocio: 16/04/2026
--
-- En tu BD el literal '00001TB%' no existe: el TPV suele ir como primer dígito 1 o 2
-- delante de 'TB' (p. ej. ...1TB... vs ...2TB...), no como prefijo fijo "00001TB".

-- ========== BLOQUE 1 — DIAGNÓSTICO ==========
-- Ejecuta esto antes del BLOQUE 2. Si total_dia_16 = 0, cambia la fecha o comprueba datos.

-- 1a) Muestra de documentos ese día (formato real de BDP)
SELECT numero_documento, fecha, fecha_real
FROM public.tickets_marbella
WHERE fecha = DATE '2026-04-16'
ORDER BY numero_documento
LIMIT 30;

-- 1b) Conteos: TB sensible vs insensible a mayúsculas (muchas BDP mandan "tb")
SELECT
  count(*) FILTER (WHERE fecha = DATE '2026-04-16') AS total_dia_16,
  count(*) FILTER (
    WHERE fecha = DATE '2026-04-16'
      AND (regexp_match(numero_documento, '([12])TB'))[1] = '1'
  ) AS tpv1_regex_TB_mayus,
  count(*) FILTER (
    WHERE fecha = DATE '2026-04-16'
      AND (regexp_match(numero_documento, '([12])TB', 'i'))[1] = '1'
  ) AS tpv1_regex_TB_ci,
  count(*) FILTER (
    WHERE fecha = DATE '2026-04-16'
      AND (regexp_match(numero_documento, '([12])TB', 'i'))[1] = '2'
  ) AS tpv2_regex_TB_ci,
  count(*) FILTER (WHERE fecha = DATE '2026-04-16' AND numero_documento ~* 'tb') AS con_literal_tb_cualquier_case
FROM public.tickets_marbella;

-- Si tpv1_regex_TB_ci > 0 pero tpv1_regex_TB_mayus = 0 → usa BLOQUE 2 tal cual (flag 'i').
-- Si con_literal_tb_cualquier_case = 0 → el número no trae "TB"; mira la columna 1a y ajusta la regex.

-- 1c) Patrones flexibles (separador entre dígito terminal y TB; TB con espacio/guion)
SELECT
  count(*) FILTER (
    WHERE fecha = DATE '2026-04-16'
      AND (regexp_match(numero_documento, '([12])[^0-9]{0,6}[Tt][Bb]', 'i'))[1] = '1'
  ) AS tpv1_flexible_hasta_6_nodigit_antes_TB,
  count(*) FILTER (
    WHERE fecha = DATE '2026-04-16'
      AND (regexp_match(numero_documento, '([12])[^0-9]{0,6}[Tt][Bb]', 'i'))[1] = '2'
  ) AS tpv2_flexible_hasta_6_nodigit_antes_TB,
  count(*) FILTER (WHERE fecha = DATE '2026-04-16' AND numero_documento ~ '^[12]') AS primer_char_es_1_o_2,
  count(*) FILTER (WHERE fecha = DATE '2026-04-16' AND left(numero_documento, 1) ~ '[0-9]') AS empieza_por_digito
FROM public.tickets_marbella;

-- 1d) Prefijos más frecuentes (para ver serie/terminal sin asumir "TB")
SELECT left(numero_documento, 12) AS prefijo_12, count(*)::int AS n
FROM public.tickets_marbella
WHERE fecha = DATE '2026-04-16'
GROUP BY 1
ORDER BY n DESC, 1
LIMIT 40;

-- 1e) Longitud del número de documento (si todos igualan, a veces el TPV va en posición fija)
SELECT length(numero_documento) AS len, count(*)::int AS n
FROM public.tickets_marbella
WHERE fecha = DATE '2026-04-16'
GROUP BY 1
ORDER BY 1;

-- ========== BLOQUE 2 — ACTUALIZACIÓN (TPV1 = dígito 1/2 y TB con hasta 6 separadores no numéricos) ==========
-- Una sola sentencia: las líneas siguen exactamente los numero_documento devueltos por
-- upd_tickets (evita desajustes JOIN y deja un único resultado con ambos conteos).

WITH target AS (
  SELECT (DATE '2026-04-18'::timestamp AT TIME ZONE 'Europe/Madrid') AS ts
),
upd_tickets AS (
  UPDATE public.tickets_marbella t
  SET fecha_real = (SELECT ts FROM target)
  WHERE t.fecha = DATE '2026-04-16'
    -- Por defecto: flexible (separador opcional entre dígito TPV y TB). Si 1b ya daba tpv1_regex_TB_ci > 0, puedes usar la línea comentada (TB pegado).
    AND (regexp_match(t.numero_documento, '([12])[^0-9]{0,6}[Tt][Bb]', 'i'))[1] = '1'
    -- AND (regexp_match(t.numero_documento, '([12])TB', 'i'))[1] = '1'
  RETURNING t.numero_documento
),
upd_lines AS (
  UPDATE public.ticket_lines_marbella tl
  SET fecha_real = (SELECT ts FROM target)
  WHERE tl.numero_documento IN (SELECT numero_documento FROM upd_tickets)
  RETURNING tl.numero_documento, tl.linea
)
SELECT
  (SELECT count(*)::int FROM upd_tickets) AS tickets_marbella_actualizados,
  (SELECT count(*)::int FROM upd_lines) AS ticket_lines_marbella_actualizadas;

-- ========== BLOQUE 3 — Si lineas = 0 pero tickets > 0, comprueba líneas huérfanas ==========
-- SELECT count(*) AS lineas_candidatas
-- FROM public.ticket_lines_marbella tl
-- WHERE tl.numero_documento IN (
--   SELECT numero_documento FROM public.tickets_marbella
--   WHERE fecha = DATE '2026-04-16'
--     AND (regexp_match(numero_documento, '([12])[^0-9]{0,6}[Tt][Bb]', 'i'))[1] = '1'
-- );

-- ========== BLOQUE 4 — Último recurso: lista explícita de numero_documento (TPV1) ==========
-- Si 1c sigue con tpv1_flexible = 0, rellena el ARRAY y ejecuta (descomenta).
-- WITH target AS (
--   SELECT (DATE '2026-04-18'::timestamp AT TIME ZONE 'Europe/Madrid') AS ts
-- ),
-- upd_tickets AS (
--   UPDATE public.tickets_marbella t
--   SET fecha_real = (SELECT ts FROM target)
--   WHERE t.numero_documento IN (SELECT unnest(ARRAY['PEGA_DOC_1', 'PEGA_DOC_2']::text[]))
--   RETURNING t.numero_documento
-- ),
-- upd_lines AS (
--   UPDATE public.ticket_lines_marbella tl
--   SET fecha_real = (SELECT ts FROM target)
--   WHERE tl.numero_documento IN (SELECT numero_documento FROM upd_tickets)
--   RETURNING tl.numero_documento
-- )
-- SELECT
--   (SELECT count(*)::int FROM upd_tickets) AS tickets_marbella_actualizados,
--   (SELECT count(*)::int FROM upd_lines) AS ticket_lines_marbella_actualizadas;

-- ========== BLOQUE 5 — SOLO si confirmas operativa: TODO el día negocio 16 → fecha_real 18 ==========
-- Peligro: afecta a TODOS los tickets con fecha = 2026-04-16 (p. ej. TPV1 + TPV2).
-- Úsalo solo si ese día solo hubo un terminal, o si quieres alinear igual todas las ventas de ese cierre.
-- Recomendado: BEGIN; … BLOQUE 5 … ROLLBACK; comprobar filas; luego COMMIT en segunda pasada.
--
-- WITH target AS (
--   SELECT (DATE '2026-04-18'::timestamp AT TIME ZONE 'Europe/Madrid') AS ts
-- ),
-- upd_tickets AS (
--   UPDATE public.tickets_marbella t
--   SET fecha_real = (SELECT ts FROM target)
--   WHERE t.fecha = DATE '2026-04-16'
--   RETURNING t.numero_documento
-- ),
-- upd_lines AS (
--   UPDATE public.ticket_lines_marbella tl
--   SET fecha_real = (SELECT ts FROM target)
--   WHERE tl.numero_documento IN (SELECT numero_documento FROM upd_tickets)
--   RETURNING tl.numero_documento
-- )
-- SELECT
--   (SELECT count(*)::int FROM upd_tickets) AS tickets_marbella_actualizados,
--   (SELECT count(*)::int FROM upd_lines) AS ticket_lines_marbella_actualizadas;
