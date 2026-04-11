-- =============================================================================
-- KDS: desacoplar cierre de comandas del radar de sala (2026-04-16)
--
-- Problema: fn_trg_process_kds_from_sala marcaba kds_orders como completada
-- cuando un id_ticket desaparecía de estado_sala.radiografia_completa, acoplando
-- Sala y KDS y cerrando comandas sin acción del cocinero.
--
-- Solución: el trigger solo aplica deltas (fncalcdelta) desde el JSON del radar.
-- El estado completada queda exclusivamente para completarComanda en el cliente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_trg_process_kds_from_sala()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  i jsonb;
BEGIN
  NEW.ultima_actualizacion := now();
  IF NEW.radiografia_completa IS NULL THEN
    NEW.radiografia_completa := '[]'::jsonb;
  END IF;

  FOR i IN SELECT * FROM jsonb_array_elements(NEW.radiografia_completa)
  LOOP
    PERFORM public.fn_calculate_and_insert_delta(
      i->>'id_ticket',
      i->>'mesa',
      i->>'notas_comanda',
      i->'productos',
      i->>'numero_documento'
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.fn_trg_process_kds_from_sala() IS
  'UPDATE estado_sala: aplica deltas KDS desde radiografia_completa. No cierra comandas al quitar tickets del radar.';
