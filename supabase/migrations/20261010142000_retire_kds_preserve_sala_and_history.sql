-- Retirar el KDS sin afectar Radar de sala, tickets, caja, stock o el copiloto.
-- Los datos se conservan en un esquema privado de archivo reversible, fuera
-- de la API REST public de Supabase y sin nuevos eventos de cocina.
--
-- NO se modifica public.estado_sala ni su control de fines de semana.
-- NO se modifica public.consultar_pedidos_abiertos() (consume estado_sala).
--
-- Precondiciones confirmadas 2026-10-10:
--   - /dashboard/kds ya redirige a /dashboard
--   - consumidores exclusivos del KDS: public.kds_*, public.comandero_events
--   - sin FK desde tablas ajenas al KDS
--   - trigger costoso era trg_update_kds_on_sala_change
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS retired_kds;
REVOKE ALL ON SCHEMA retired_kds FROM PUBLIC, anon, authenticated;

-- Detener permanentemente el procesamiento de cocina, no la telemetria de sala.
DROP TRIGGER IF EXISTS trg_update_kds_on_sala_change ON public.estado_sala;
DROP TRIGGER IF EXISTS trg_process_kds_event ON public.comandero_events;

-- Solo las tablas de KDS se archivan. ALTER TABLE SET SCHEMA mueve también
-- sus índices, triggers propios y secuencias vinculadas, sin borrar una fila.
ALTER TABLE public.kds_order_lines SET SCHEMA retired_kds;
ALTER TABLE public.kds_orders SET SCHEMA retired_kds;
ALTER TABLE public.kds_events SET SCHEMA retired_kds;
ALTER TABLE public.kds_projection_lines SET SCHEMA retired_kds;
ALTER TABLE public.kds_projection_orders SET SCHEMA retired_kds;
ALTER TABLE public.kds_ticket_state SET SCHEMA retired_kds;
ALTER TABLE public.comandero_events SET SCHEMA retired_kds;

COMMENT ON SCHEMA retired_kds IS
  'Archivo historico privado del KDS retirado el 2026-10-10. No se usa operativamente.';
