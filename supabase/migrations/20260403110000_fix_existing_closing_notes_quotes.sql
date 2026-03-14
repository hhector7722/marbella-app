-- Corregir notas existentes en treasury_log al formato "Cierre dd-mm-aa"

-- 1) De "Cierre 'dd-mm-aa'" a "Cierre dd-mm-aa"
UPDATE public.treasury_log
SET notes = regexp_replace(notes, '^Cierre ''([0-9]{1,2}-[0-9]{2}-[0-9]{2})''$', 'Cierre \1')
WHERE type = 'CLOSE_ENTRY'
  AND notes ~ '^Cierre ''[0-9]{1,2}-[0-9]{2}-[0-9]{2}''$';

-- 2) De "Cierre TPV: YYYY-MM-DD" (y "Cierre TPV: YYYY-MM-DD (Editado)") a "Cierre dd-mm-aa"
UPDATE public.treasury_log
SET notes = 'Cierre ' || ltrim(to_char((regexp_match(notes, '[0-9]{4}-[0-9]{2}-[0-9]{2}'))[1]::date, 'DD'), '0') || '-' || to_char((regexp_match(notes, '[0-9]{4}-[0-9]{2}-[0-9]{2}'))[1]::date, 'MM-YY')
WHERE type = 'CLOSE_ENTRY'
  AND notes LIKE 'Cierre TPV:%';
