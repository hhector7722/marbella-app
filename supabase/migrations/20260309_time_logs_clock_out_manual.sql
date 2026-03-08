-- Marcar salida indicada manualmente (empleado olvidó fichar salida)
-- RLS: no cambia políticas existentes, solo añade columna
ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS clock_out_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.time_logs.clock_out_manual IS 'True cuando el manager indicó la hora de salida porque el empleado olvidó fichar. La salida se contabiliza igual; el frontend puede mostrar un aviso visual.';
