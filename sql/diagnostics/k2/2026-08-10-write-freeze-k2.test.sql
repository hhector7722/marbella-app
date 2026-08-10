-- K2 write-freeze infrastructure tests.
-- Requires the infrastructure migration to be applied first.
-- Every data probe is executed in a transaction and rolled back.
-- This script does not execute K2 normalization.

-- NOTE: remove `\set ON_ERROR_STOP on` when running in Supabase SQL editor.

CREATE OR REPLACE FUNCTION pg_temp.k2_write_freeze_diagnostics()
RETURNS TABLE(test text, passed boolean, active_after_rollback boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_active boolean;
BEGIN
  -- A: freeze OFF permits a protected write (rolled back).
  BEGIN
    BEGIN
      UPDATE public.ingredients
      SET purchase_unit = purchase_unit
      WHERE id = (SELECT id FROM public.ingredients ORDER BY id LIMIT 1);
      RAISE EXCEPTION 'cleanup';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%cleanup%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
    END;
    test := 'A';
    passed := true;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'A';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  -- B: normal write is rejected while the domain freeze is active.
  BEGIN
    BEGIN
      PERFORM private.k2_acquire_domain_freeze(
        '00000000-0000-0000-0000-000000000001'::uuid,
        'test-write-freeze',
        NULL,
        interval '5 minutes'
      );

      BEGIN
        UPDATE public.ingredients
        SET purchase_unit = purchase_unit
        WHERE id = (SELECT id FROM public.ingredients ORDER BY id LIMIT 1);
        RAISE EXCEPTION 'expected K2 freeze rejection';
      EXCEPTION WHEN SQLSTATE '55006' THEN
        NULL;
      END;

      RAISE EXCEPTION 'cleanup';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%cleanup%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
    END;
    test := 'B';
    passed := true;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'B';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  -- C: second protected row type also rejects while frozen.
  BEGIN
    BEGIN
      PERFORM private.k2_acquire_domain_freeze(
        '00000000-0000-0000-0000-000000000002'::uuid,
        'test-write-freeze',
        NULL,
        interval '5 minutes'
      );

      BEGIN
        UPDATE public.ingredients
        SET unit_type = unit_type
        WHERE id = (SELECT id FROM public.ingredients ORDER BY id LIMIT 1);
        RAISE EXCEPTION 'expected K2 freeze rejection';
      EXCEPTION WHEN SQLSTATE '55006' THEN
        NULL;
      END;

      RAISE EXCEPTION 'cleanup';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%cleanup%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
    END;
    test := 'C';
    passed := true;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'C';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  -- D: protected write on recipe_ingredients is rejected.
  BEGIN
    BEGIN
      PERFORM private.k2_acquire_domain_freeze(
        '00000000-0000-0000-0000-000000000003'::uuid,
        'test-write-freeze',
        NULL,
        interval '5 minutes'
      );

      BEGIN
        UPDATE public.recipe_ingredients
        SET unit = unit
        WHERE id = (SELECT id FROM public.recipe_ingredients ORDER BY id LIMIT 1);
        RAISE EXCEPTION 'expected K2 freeze rejection';
      EXCEPTION WHEN SQLSTATE '55006' THEN
        NULL;
      END;

      RAISE EXCEPTION 'cleanup';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%cleanup%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
    END;
    test := 'D';
    passed := true;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'D';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  -- E: reads remain permitted while frozen.
  BEGIN
    BEGIN
      PERFORM private.k2_acquire_domain_freeze(
        '00000000-0000-0000-0000-000000000004'::uuid,
        'test-read',
        NULL,
        interval '5 minutes'
      );
      PERFORM count(*) FROM public.ingredients;
      PERFORM count(*) FROM public.recipe_ingredients;
      RAISE EXCEPTION 'cleanup';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%cleanup%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
    END;
    test := 'E';
    passed := true;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'E';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  -- F: transaction-local authorization permits the protected write.
  BEGIN
    BEGIN
      PERFORM private.k2_acquire_domain_freeze(
        '00000000-0000-0000-0000-000000000005'::uuid,
        'test-authorized-write',
        NULL,
        interval '5 minutes'
      );
      PERFORM private.k2_authorize_transaction('00000000-0000-0000-0000-000000000005'::uuid);
      UPDATE public.ingredients
      SET purchase_unit = purchase_unit
      WHERE id = (SELECT id FROM public.ingredients ORDER BY id LIMIT 1);
      RAISE EXCEPTION 'cleanup';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%cleanup%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
    END;
    test := 'F';
    passed := true;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'F';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  -- G: an invalid run id cannot authorize a transaction.
  BEGIN
    BEGIN
      PERFORM private.k2_authorize_transaction('00000000-0000-0000-0000-000000000099'::uuid);
      RAISE EXCEPTION 'expected invalid K2 authorization rejection';
    EXCEPTION WHEN SQLSTATE '42501' THEN
      NULL;
    END;
    test := 'G';
    passed := true;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'G';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  -- H: a second activation for the same domain is rejected while the first is active.
  BEGIN
    BEGIN
      PERFORM private.k2_acquire_domain_freeze(
        '00000000-0000-0000-0000-000000000006'::uuid,
        'test-double-k2',
        NULL,
        interval '5 minutes'
      );

      BEGIN
        PERFORM private.k2_acquire_domain_freeze(
          '00000000-0000-0000-0000-000000000007'::uuid,
          'test-double-k2',
          NULL,
          interval '5 minutes'
        );
        RAISE EXCEPTION 'expected active-freeze rejection';
      EXCEPTION WHEN SQLSTATE '55006' THEN
        NULL;
      END;

      RAISE EXCEPTION 'cleanup';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%cleanup%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
    END;
    test := 'H';
    passed := true;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'H';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  -- I: an exception rolls back the active row when acquisition and operation
  -- are in the same transaction. The next status query must be inactive.
  BEGIN
    BEGIN
      PERFORM private.k2_acquire_domain_freeze(
        '00000000-0000-0000-0000-000000000008'::uuid,
        'test-rollback',
        NULL,
        interval '5 minutes'
      );
      PERFORM private.k2_authorize_transaction('00000000-0000-0000-0000-000000000008'::uuid);
      RAISE EXCEPTION 'cleanup';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%cleanup%' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
    END;
    v_active := (private.k2_domain_freeze_status() ->> 'active')::boolean;
    test := 'I';
    passed := v_active = false;
    active_after_rollback := v_active;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'I';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  -- J: privilege check for public application roles.
  BEGIN
    test := 'J_anon';
    passed := has_function_privilege('anon', 'private.k2_acquire_domain_freeze(uuid,text,uuid,interval)', 'EXECUTE') = false;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'J_anon';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  BEGIN
    test := 'J_authenticated';
    passed := has_function_privilege('authenticated', 'private.k2_authorize_transaction(uuid)', 'EXECUTE') = false;
    active_after_rollback := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test := 'J_authenticated';
    passed := false;
    active_after_rollback := NULL;
    RETURN NEXT;
  END;

  RETURN;
END;
$$;

SELECT * FROM pg_temp.k2_write_freeze_diagnostics() ORDER BY test;
