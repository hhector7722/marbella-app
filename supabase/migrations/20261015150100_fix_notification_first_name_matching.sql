-- Los perfiles pueden tener nombres compuestos (p. ej. "Fernando Ariel").
-- Mantener los mismos cuatro destinatarios en reservas, pedidos cliente y
-- comandas del personal, sin cambiar el nombre guardado en profiles.
BEGIN;

DO $migration$
DECLARE
  v_signature regprocedure;
  v_source text;
  v_old constant text := 'lower(trim(p.first_name))';
  v_new constant text := 'lower(split_part(trim(p.first_name), '' '', 1))';
  v_matches integer;
BEGIN
  FOR v_signature IN
    SELECT unnest(ARRAY[
      'public.fn_notify_reservation_insert()'::regprocedure,
      'public.save_client_event_order_by_token(uuid,jsonb,text)'::regprocedure,
      'public.fn_notify_first_staff_encargo_order()'::regprocedure
    ])
  LOOP
    v_source := pg_get_functiondef(v_signature::oid);
    v_matches := (length(v_source) - length(replace(v_source, v_old, '')))
      / length(v_old);

    IF v_matches <> 1 THEN
      RAISE EXCEPTION 'Filtro de destinatarios inesperado en %, ocurrencias %',
        v_signature, v_matches;
    END IF;

    -- Se sustituye exclusivamente la comparación del nombre.
    -- La lógica de inserción de avisos y envío push no se altera.
    EXECUTE replace(v_source, v_old, v_new);
  END LOOP;
END;
$migration$;

COMMIT;
