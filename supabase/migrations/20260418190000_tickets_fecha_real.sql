-- Momento real de recepción en el receptor (Next.js webhook BDP); distinto de fecha/hora negocio TPV.
ALTER TABLE public.tickets_marbella
  ADD COLUMN IF NOT EXISTS fecha_real timestamptz;

ALTER TABLE public.ticket_lines_marbella
  ADD COLUMN IF NOT EXISTS fecha_real timestamptz;

COMMENT ON COLUMN public.tickets_marbella.fecha_real IS 'Timestamp ISO del servidor receptor al aceptar el POST (webhook BDP).';
COMMENT ON COLUMN public.ticket_lines_marbella.fecha_real IS 'Timestamp ISO del servidor receptor al aceptar el POST (webhook BDP).';
