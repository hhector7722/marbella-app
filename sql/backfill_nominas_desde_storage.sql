-- ==============================================================================
-- BACKFILL: Filas en public.nominas para PDFs ya existentes en Storage (bucket nominas)
-- sin registro en base de datos (caso anterior al fix del webhook 2026-04).
--
-- Uso (Supabase SQL Editor, rol postgres / dashboard):
--   1) Ejecutar solo el bloque "PREVIEW" y revisar columnas empleado_id, mes_anio, file_path.
--   2) Si cuadra, ejecutar el bloque "INSERT" (en la misma sesión o tras copiar la lógica).
--
-- Rutas soportadas:
--   A) Webhook actual:  <uuid>/<YYYY>_<mes_es>_<DNI>.pdf
--   B) Legacy común:    <codigo_empleado>/<YYYY>/...pdf  (codigo en profiles.codigo_empleado)
--
-- No inserta si ya existe public.nominas.file_path = storage.objects.name.
-- mes_anio respeta varchar(7): formato YYYY-MM.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- PREVIEW (solo lectura; revisar antes de insertar)
-- -----------------------------------------------------------------------------
WITH objs AS (
  SELECT o.name AS file_path
  FROM storage.objects o
  WHERE o.bucket_id = 'nominas'
    AND o.name ILIKE '%.pdf'
    AND NOT EXISTS (
      SELECT 1 FROM public.nominas n WHERE n.file_path = o.name
    )
),
parts AS (
  SELECT
    file_path,
    split_part(file_path, '/', 1) AS seg1,
    split_part(file_path, '/', 2) AS seg2,
    split_part(file_path, '/', GREATEST(1, array_length(string_to_array(file_path, '/'), 1))) AS fname
  FROM objs
),
month_num AS (
  SELECT
    p.*,
    lower(split_part(split_part(p.fname, '.', 1), '_', 2)) AS mes_txt,
    split_part(split_part(p.fname, '.', 1), '_', 1) AS year_from_fname
  FROM parts p
),
resolved AS (
  SELECT
    m.file_path,
    m.seg1,
    m.seg2,
    m.fname,
    m.mes_txt,
    m.year_from_fname,
    CASE lower(m.mes_txt)
      WHEN 'enero' THEN '01'
      WHEN 'febrero' THEN '02'
      WHEN 'marzo' THEN '03'
      WHEN 'abril' THEN '04'
      WHEN 'mayo' THEN '05'
      WHEN 'junio' THEN '06'
      WHEN 'julio' THEN '07'
      WHEN 'agosto' THEN '08'
      WHEN 'septiembre' THEN '09'
      WHEN 'setiembre' THEN '09'
      WHEN 'octubre' THEN '10'
      WHEN 'noviembre' THEN '11'
      WHEN 'diciembre' THEN '12'
      ELSE NULL
    END AS mm_from_name,
    CASE
      WHEN m.seg1 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN m.seg1::uuid
      WHEN m.seg1 ~ '^[0-9]+$' AND m.seg2 ~ '^[0-9]{4}$'
        THEN (SELECT pr.id FROM public.profiles pr WHERE pr.codigo_empleado = m.seg1 LIMIT 1)
      ELSE NULL
    END AS empleado_id,
    CASE
      WHEN m.seg1 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND m.year_from_fname ~ '^[0-9]{4}$'
        AND (
          CASE lower(m.mes_txt)
            WHEN 'enero' THEN '01'
            WHEN 'febrero' THEN '02'
            WHEN 'marzo' THEN '03'
            WHEN 'abril' THEN '04'
            WHEN 'mayo' THEN '05'
            WHEN 'junio' THEN '06'
            WHEN 'julio' THEN '07'
            WHEN 'agosto' THEN '08'
            WHEN 'septiembre' THEN '09'
            WHEN 'setiembre' THEN '09'
            WHEN 'octubre' THEN '10'
            WHEN 'noviembre' THEN '11'
            WHEN 'diciembre' THEN '12'
            ELSE NULL
          END
        ) IS NOT NULL
        THEN m.year_from_fname || '-' || (
          CASE lower(m.mes_txt)
            WHEN 'enero' THEN '01'
            WHEN 'febrero' THEN '02'
            WHEN 'marzo' THEN '03'
            WHEN 'abril' THEN '04'
            WHEN 'mayo' THEN '05'
            WHEN 'junio' THEN '06'
            WHEN 'julio' THEN '07'
            WHEN 'agosto' THEN '08'
            WHEN 'septiembre' THEN '09'
            WHEN 'setiembre' THEN '09'
            WHEN 'octubre' THEN '10'
            WHEN 'noviembre' THEN '11'
            WHEN 'diciembre' THEN '12'
            ELSE '01'
          END
        )
      WHEN m.seg1 ~ '^[0-9]+$' AND m.seg2 ~ '^[0-9]{4}$'
        THEN m.seg2 || '-01'
      ELSE NULL
    END AS mes_anio
  FROM month_num m
)
SELECT
  r.file_path,
  r.empleado_id,
  r.mes_anio,
  p.first_name,
  p.last_name,
  p.codigo_empleado,
  CASE WHEN r.empleado_id IS NULL THEN '⚠️ Sin empleado (revisar ruta o codigo_empleado en profiles)' END AS nota
FROM resolved r
LEFT JOIN public.profiles p ON p.id = r.empleado_id
ORDER BY r.file_path;

-- -----------------------------------------------------------------------------
-- INSERT (ejecutar después de validar el PREVIEW)
-- Descomenta BEGIN/COMMIT si quieres transacción explícita.
-- -----------------------------------------------------------------------------

BEGIN;

INSERT INTO public.nominas (empleado_id, mes_anio, file_path)
WITH objs AS (
  SELECT o.name AS file_path
  FROM storage.objects o
  WHERE o.bucket_id = 'nominas'
    AND o.name ILIKE '%.pdf'
    AND NOT EXISTS (
      SELECT 1 FROM public.nominas n WHERE n.file_path = o.name
    )
),
parts AS (
  SELECT
    file_path,
    split_part(file_path, '/', 1) AS seg1,
    split_part(file_path, '/', 2) AS seg2,
    split_part(file_path, '/', GREATEST(1, array_length(string_to_array(file_path, '/'), 1))) AS fname
  FROM objs
),
month_num AS (
  SELECT
    p.*,
    lower(split_part(split_part(p.fname, '.', 1), '_', 2)) AS mes_txt,
    split_part(split_part(p.fname, '.', 1), '_', 1) AS year_from_fname
  FROM parts p
),
resolved AS (
  SELECT
    m.file_path,
    CASE
      WHEN m.seg1 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN m.seg1::uuid
      WHEN m.seg1 ~ '^[0-9]+$' AND m.seg2 ~ '^[0-9]{4}$'
        THEN (SELECT pr.id FROM public.profiles pr WHERE pr.codigo_empleado = m.seg1 LIMIT 1)
      ELSE NULL
    END AS empleado_id,
    CASE
      WHEN m.seg1 ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND m.year_from_fname ~ '^[0-9]{4}$'
        AND (
          CASE lower(m.mes_txt)
            WHEN 'enero' THEN '01'
            WHEN 'febrero' THEN '02'
            WHEN 'marzo' THEN '03'
            WHEN 'abril' THEN '04'
            WHEN 'mayo' THEN '05'
            WHEN 'junio' THEN '06'
            WHEN 'julio' THEN '07'
            WHEN 'agosto' THEN '08'
            WHEN 'septiembre' THEN '09'
            WHEN 'setiembre' THEN '09'
            WHEN 'octubre' THEN '10'
            WHEN 'noviembre' THEN '11'
            WHEN 'diciembre' THEN '12'
            ELSE NULL
          END
        ) IS NOT NULL
        THEN m.year_from_fname || '-' || (
          CASE lower(m.mes_txt)
            WHEN 'enero' THEN '01'
            WHEN 'febrero' THEN '02'
            WHEN 'marzo' THEN '03'
            WHEN 'abril' THEN '04'
            WHEN 'mayo' THEN '05'
            WHEN 'junio' THEN '06'
            WHEN 'julio' THEN '07'
            WHEN 'agosto' THEN '08'
            WHEN 'septiembre' THEN '09'
            WHEN 'setiembre' THEN '09'
            WHEN 'octubre' THEN '10'
            WHEN 'noviembre' THEN '11'
            WHEN 'diciembre' THEN '12'
            ELSE '01'
          END
        )
      WHEN m.seg1 ~ '^[0-9]+$' AND m.seg2 ~ '^[0-9]{4}$'
        THEN m.seg2 || '-01'
      ELSE NULL
    END AS mes_anio
  FROM month_num m
)
SELECT r.empleado_id, r.mes_anio, r.file_path
FROM resolved r
WHERE r.empleado_id IS NOT NULL
  AND r.mes_anio IS NOT NULL
  AND length(r.mes_anio) = 7;

COMMIT;
