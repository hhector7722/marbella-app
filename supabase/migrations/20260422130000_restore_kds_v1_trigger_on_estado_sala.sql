-- =============================================================================
-- Hotfix: KDS pantalla (v1) no recibía datos tras activar trigger v2
-- (2026-04-22)
--
-- Síntoma:
-- - `estado_sala` sí actualiza (Radar OK)
-- - KDS UI (usa `kds_orders`/`kds_order_lines` via `useKDS`) queda vacío
--
-- Causa:
-- - Migración KDS v2 reemplazó `fn_trg_process_kds_from_sala()` y el trigger
--   `trg_update_kds_on_sala_change` pasó a emitir `kds_events` (v2) en lugar
--   de poblar las tablas v1.
--
-- Solución:
-- - Restaurar un trigger v1 (sin interferir con v2) usando una función nueva
--   `fn_trg_process_kds_from_sala_v1()` basada en la lógica vigente v1
--   (incluye nombre_cliente + cancelación por OLD-only tickets).
-- =============================================================================

BEGIN;

-- Función v1 (derivada de `20260419120000_kds_nombre_cliente.sql`)
CREATE OR REPLACE FUNCTION public.fn_trg_process_kds_from_sala_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  i jsonb;
  v_old_id text;
  v_new_ids text[];
  v_old_ids text[];
  v_old_mesa jsonb;
BEGIN
  NEW.ultima_actualizacion := now();
  IF NEW.radiografia_completa IS NULL THEN
    NEW.radiografia_completa := '[]'::jsonb;
  END IF;

  IF OLD.radiografia_completa IS NULL THEN
    OLD.radiografia_completa := '[]'::jsonb;
  END IF;

  -- Procesar deltas desde snapshot (idempotente)
  FOR i IN SELECT * FROM jsonb_array_elements(NEW.radiografia_completa)
  LOOP
    PERFORM public.fn_calculate_and_insert_delta(
      i->>'id_ticket',
      i->>'mesa',
      i->>'notas_comanda',
      i->'productos',
      i->>'numero_documento',
      i->>'nombre_cliente'
    );
  END LOOP;

  -- Tickets que estaban en OLD pero ya no aparecen en NEW:
  -- emitir delta con productos [] para cancelar pendientes (sin cerrar comandas).
  SELECT COALESCE(
    array_agg(DISTINCT (x->>'id_ticket'))
      FILTER (WHERE (x->>'id_ticket') IS NOT NULL AND btrim(x->>'id_ticket') <> ''),
    ARRAY[]::text[]
  )
  INTO v_new_ids
  FROM jsonb_array_elements(NEW.radiografia_completa) x;

  SELECT COALESCE(
    array_agg(DISTINCT (x->>'id_ticket'))
      FILTER (WHERE (x->>'id_ticket') IS NOT NULL AND btrim(x->>'id_ticket') <> ''),
    ARRAY[]::text[]
  )
  INTO v_old_ids
  FROM jsonb_array_elements(OLD.radiografia_completa) x;

  FOREACH v_old_id IN ARRAY v_old_ids
  LOOP
    IF NOT (v_old_id = ANY(v_new_ids)) THEN
      SELECT elem INTO v_old_mesa
      FROM jsonb_array_elements(OLD.radiografia_completa) AS t(elem)
      WHERE (elem->>'id_ticket') IS NOT DISTINCT FROM v_old_id
      LIMIT 1;

      IF v_old_mesa IS NOT NULL THEN
        PERFORM public.fn_calculate_and_insert_delta(
          v_old_mesa->>'id_ticket',
          v_old_mesa->>'mesa',
          v_old_mesa->>'notas_comanda',
          '[]'::jsonb,
          v_old_mesa->>'numero_documento',
          v_old_mesa->>'nombre_cliente'
        );
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_trg_process_kds_from_sala_v1() IS
  'UPDATE estado_sala (KDS v1): aplica deltas a kds_orders/kds_order_lines desde radiografia_completa; tickets solo en OLD reciben productos [] para cancelar pendientes. No cierra comandas.';

-- Reinstalar trigger para que apunte a v1 (KDS UI actual)
DROP TRIGGER IF EXISTS trg_update_kds_on_sala_change ON public.estado_sala;
CREATE TRIGGER trg_update_kds_on_sala_change
BEFORE UPDATE ON public.estado_sala
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_process_kds_from_sala_v1();

COMMIT;

