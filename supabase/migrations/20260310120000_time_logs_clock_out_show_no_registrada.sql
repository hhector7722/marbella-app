-- Decisión de mostrar "No registrada" en listados (solo cuando el manager lo elige)
-- clock_out_manual = salida introducida manualmente (auditoría)
-- clock_out_show_no_registrada = cuando true, en listados se muestra "No registrada" en lugar de la hora
ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS clock_out_show_no_registrada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.time_logs.clock_out_show_no_registrada IS 'Cuando true, el frontend muestra "No registrada" en lugar de la hora de salida en listados/calendario. Solo aplica si hay salida; el manager decide cuándo activarlo.';
