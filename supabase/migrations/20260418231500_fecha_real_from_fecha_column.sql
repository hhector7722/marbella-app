-- fecha_real NULL: persistir el mismo día de negocio que la columna `fecha` (TPV).
-- Instantáneo: medianoche del día `fecha` en Europe/Madrid (timestamptz).
-- Tras esto, filtros cliente por fecha_real y RPCs alineados.

UPDATE public.tickets_marbella t
SET fecha_real = (t.fecha::timestamp AT TIME ZONE 'Europe/Madrid')
WHERE t.fecha_real IS NULL
  AND t.fecha IS NOT NULL;

UPDATE public.ticket_lines_marbella tl
SET fecha_real = t.fecha_real
FROM public.tickets_marbella t
WHERE tl.numero_documento = t.numero_documento
  AND tl.fecha_real IS NULL
  AND t.fecha_real IS NOT NULL;

UPDATE public.ticket_lines_marbella tl
SET fecha_real = (tl.fecha_negocio::timestamp AT TIME ZONE 'Europe/Madrid')
WHERE tl.fecha_real IS NULL
  AND tl.fecha_negocio IS NOT NULL;

-- Misma regla en tiempo de consulta si alguna fila siguiera sin persistir
CREATE OR REPLACE FUNCTION public.ticket_effective_reception_ts(
  p_fecha date,
  p_hora_cierre text,
  p_fecha_real timestamptz
)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  -- LANGUAGE sql exige una consulta; la expresión debe ir en SELECT.
  SELECT COALESCE(
    p_fecha_real,
    CASE WHEN p_fecha IS NOT NULL
      THEN (p_fecha::timestamp AT TIME ZONE 'Europe/Madrid')
      ELSE NULL
    END
  );
$$;

COMMENT ON FUNCTION public.ticket_effective_reception_ts(date, text, timestamptz) IS
  'Recepción real si existe; si no, día de negocio TPV (`fecha`) a medianoche Europe/Madrid.';
