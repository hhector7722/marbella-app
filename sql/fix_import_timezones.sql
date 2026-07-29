-- SCRIPT DE CORRECCIÓN DE ZONA HORARIA
-- ESTE SCRIPT ES NECESARIO SI HAS IMPORTADO DATOS Y APARECEN CON 1 O 2 HORAS DE MAS.
-- El problema se debe a que la importación asumió que las horas del Excel eran UTC, cuando en realidad eran hora local (Madrid).

-- 1. Realizar una copia de seguridad de los registros afectados (opcional pero recomendado)
-- CREATE TABLE time_logs_backup AS SELECT * FROM time_logs;

-- 2. Corregir los registros importados (is_manual_entry = true)
-- La lógica 'AT TIME ZONE' hace lo siguiente:
-- Toma el valor actual (ej. 07:00 UTC) -> Lo convierte a "07:00 sin zona horaria" -> Lo reinterpreta como "07:00 en Madrid" -> Calcula qué hora UTC es esa (ej. 06:00 UTC).
-- Esto ajusta automáticamente -1h en Invierno y -2h en Verano.

BEGIN;

UPDATE time_logs
SET 
    clock_in = (clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Madrid',
    clock_out = (clock_out AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Madrid'
WHERE 
    is_manual_entry = true 
    AND clock_in < NOW(); -- Solo históricos, por seguridad

-- 3. Inicia un recálculo automático de snapshots tras la corrección
-- (Esto disparará el trigger trigger_recalc_snapshots que ya instalamos)

COMMIT;

-- INSTRUCCIONES:
-- 1. Ejecuta este script en el Editor SQL de Supabase.
-- 2. Ve al Dashboard > Horas Extras y pulsa "RECALCULAR" para corregir los balances semanales con las nuevas horas.
