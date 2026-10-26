-- Mantener el radar LIVE operativo los siete días de la semana.
-- El trigger que sincronizaba KDS fue retirado el 2026-10-10
-- (20261010142000_retire_kds_preserve_sala_and_history.sql).
-- No restaurar KDS, solo permitir que el webhook actualice estado_sala.
DROP TRIGGER IF EXISTS trg_00_estado_sala_weekdays_gate ON public.estado_sala;
