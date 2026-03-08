-- ============================================================
-- EJECUTAR EN SUPABASE (SQL Editor) - Fichajes: "No registrada"
-- Una sola columna: tú decides en qué días mostrar el mensaje.
-- ============================================================

ALTER TABLE public.time_logs
ADD COLUMN IF NOT EXISTS clock_out_show_no_registrada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.time_logs.clock_out_show_no_registrada IS 'Cuando true, en listados/calendario se muestra "No registrada" en lugar de la hora de salida. El manager decide cuándo activarlo (da igual si la hora fue manual o no).';

-- Para permitir el tipo "No registrado" en la BD, ejecutar además: sql/allow_no_registered_event_type.sql
