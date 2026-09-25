-- Contrato de integridad: recipe_subrecipes no persiste ciclos.
-- Se ejecuta contra una base construida con las migraciones reales.

DO $$
DECLARE
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  d uuid := gen_random_uuid();
  e uuid := gen_random_uuid();
  x uuid := gen_random_uuid();
  y uuid := gen_random_uuid();
  edge uuid;
  i int;
  prev uuid;
  nxt uuid;
  head uuid;
  tail uuid;
  chain uuid[] := ARRAY[]::uuid[];
BEGIN
  INSERT INTO public.recipes (id, name) VALUES
    (a, 'ciclo A'), (b, 'ciclo B'), (c, 'ciclo C'),
    (d, 'ciclo D'), (e, 'ciclo E'),
    (x, 'ciclo X'), (y, 'ciclo Y');

  -- 1. A → A
  BEGIN
    INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
    VALUES (a, a, 1, 'ud');
    RAISE EXCEPTION 'caso 1: A→A fue aceptado';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%recipe_subrecipes produciría un ciclo%' THEN
      RAISE EXCEPTION 'caso 1 mensaje: %', SQLERRM;
    END IF;
  END;

  -- 2–3. A → B, B → C
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (a, b, 1, 'ud'), (b, c, 1, 'ud');

  -- 4–5. Diamante. A→D es atajo, no ciclo.
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (a, c, 1, 'kg'), (b, d, 1, 'ud'), (c, d, 1, 'ud'), (a, d, 1, 'ud');

  -- 6. C → A
  BEGIN
    INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
    VALUES (c, a, 1, 'ud');
    RAISE EXCEPTION 'caso 6: C→A fue aceptado';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%recipe_subrecipes produciría un ciclo%' THEN
      RAISE EXCEPTION 'caso 6 mensaje: %', SQLERRM;
    END IF;
  END;

  -- 7. Cerrar hacia un ancestro intermedio: D → B
  BEGIN
    INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
    VALUES (d, b, 1, 'ud');
    RAISE EXCEPTION 'caso 7: D→B fue aceptado';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%recipe_subrecipes produciría un ciclo%' THEN
      RAISE EXCEPTION 'caso 7 mensaje: %', SQLERRM;
    END IF;
  END;

  -- 8. UPDATE válido de una arista: A→C pasa a A→E
  UPDATE public.recipe_subrecipes
  SET child_recipe_id = e
  WHERE parent_recipe_id = a AND child_recipe_id = c;

  -- 9. UPDATE cíclico: A→E no puede pasar a C→A
  BEGIN
    UPDATE public.recipe_subrecipes
    SET parent_recipe_id = c, child_recipe_id = a
    WHERE parent_recipe_id = a AND child_recipe_id = e;
    RAISE EXCEPTION 'caso 9: UPDATE cíclico fue aceptado';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%recipe_subrecipes produciría un ciclo%' THEN
      RAISE EXCEPTION 'caso 9 mensaje: %', SQLERRM;
    END IF;
  END;

  -- 10. Sustituir la única arista X→Y por Y→X. OLD.id no puede contar como camino.
  INSERT INTO public.recipe_subrecipes (id, parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (gen_random_uuid(), x, y, 1, 'ud')
  RETURNING id INTO edge;
  UPDATE public.recipe_subrecipes
  SET parent_recipe_id = y, child_recipe_id = x
  WHERE id = edge;
  IF NOT EXISTS (
    SELECT 1 FROM public.recipe_subrecipes
    WHERE id = edge AND parent_recipe_id = y AND child_recipe_id = x
  ) THEN
    RAISE EXCEPTION 'caso 10: el UPDATE se rechazó por su propia arista';
  END IF;

  -- 11–12. quantity y unit
  UPDATE public.recipe_subrecipes SET quantity = 2.5 WHERE id = edge;
  UPDATE public.recipe_subrecipes SET unit = 'g' WHERE id = edge;

  -- 13. DELETE abre un camino que antes era ciclo.
  DELETE FROM public.recipe_subrecipes WHERE parent_recipe_id = b AND child_recipe_id = c;
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (c, a, 1, 'ud');
  DELETE FROM public.recipe_subrecipes WHERE parent_recipe_id = c AND child_recipe_id = a;
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (b, c, 1, 'ud');

  -- 14. Cadena de 40 aristas, sin límite 32.
  head := gen_random_uuid();
  INSERT INTO public.recipes (id, name) VALUES (head, 'cadena 0');
  prev := head;
  chain := ARRAY[head];
  FOR i IN 1..40 LOOP
    nxt := gen_random_uuid();
    INSERT INTO public.recipes (id, name) VALUES (nxt, 'cadena ' || i);
    INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
    VALUES (prev, nxt, 1, 'ud');
    prev := nxt;
    chain := chain || nxt;
  END LOOP;
  tail := prev;

  -- 15. Cerrar la cadena larga.
  BEGIN
    INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
    VALUES (tail, head, 1, 'ud');
    RAISE EXCEPTION 'caso 15: el cierre de 40 niveles fue aceptado';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%recipe_subrecipes produciría un ciclo%' THEN
      RAISE EXCEPTION 'caso 15 mensaje: %', SQLERRM;
    END IF;
  END;

  -- 16. Un ciclo heredado no puede colgar el recorrido.
  ALTER TABLE public.recipe_subrecipes DISABLE TRIGGER recipe_subrecipes_cycle_guard;
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  VALUES (x, y, 1, 'ml');
  ALTER TABLE public.recipe_subrecipes ENABLE TRIGGER recipe_subrecipes_cycle_guard;
  PERFORM set_config('statement_timeout', '2000', true);
  INSERT INTO public.recipes (id, name) VALUES (gen_random_uuid(), 'fuera del ciclo');
  INSERT INTO public.recipe_subrecipes (parent_recipe_id, child_recipe_id, quantity, unit)
  SELECT id, x, 1, 'ud' FROM public.recipes WHERE name = 'fuera del ciclo';
  DELETE FROM public.recipe_subrecipes
  WHERE parent_recipe_id = x AND child_recipe_id = y AND unit = 'ml';
  DELETE FROM public.recipe_subrecipes
  WHERE parent_recipe_id = (SELECT id FROM public.recipes WHERE name = 'fuera del ciclo');
END $$;
