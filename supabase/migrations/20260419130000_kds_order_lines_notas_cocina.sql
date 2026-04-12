-- =============================================================================
-- KDS: notas de cocina separadas de notas TPV (2026-04-19)
--
-- Las notas editadas desde el KDS deben ir en notas_cocina. La columna notas
-- sigue siendo la clave de reconciliación con fncalcdelta (radar TPV).
-- Actualizar notas desde cocina provocaba deltas falsos y comandas duplicadas.
-- =============================================================================

ALTER TABLE public.kds_order_lines
  ADD COLUMN IF NOT EXISTS notas_cocina text;

COMMENT ON COLUMN public.kds_order_lines.notas_cocina IS
  'Notas añadidas desde cocina (KDS). No participa en fncalcdelta; notas sigue alineado al TPV.';
