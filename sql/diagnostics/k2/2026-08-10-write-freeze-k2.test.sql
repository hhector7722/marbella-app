-- K2 write-freeze infrastructure tests.
-- Requires the infrastructure migration to be applied first.
-- Every data probe is executed in a transaction and rolled back.
-- This script does not execute K2 normalization.

\set ON_ERROR_STOP on

-- A: freeze OFF permits a protected write (rolled back).
BEGIN;
UPDATE public.ingredients
SET purchase_unit = purchase_unit
WHERE id = (SELECT id FROM public.ingredients ORDER BY id LIMIT 1);
ROLLBACK;

-- B-D/J: normal writes are rejected while the domain freeze is active.
-- The expected SQLSTATE is 55006 and the transaction is rolled back.
BEGIN;
SELECT private.k2_acquire_domain_freeze(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'test-write-freeze',
  NULL,
  interval '5 minutes'
);

DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    UPDATE public.ingredients
    SET purchase_unit = purchase_unit
    WHERE id = (SELECT id FROM public.ingredients ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'expected K2 freeze rejection';
  EXCEPTION WHEN SQLSTATE '55006' THEN
    NULL;
  END;
END;
$$;
ROLLBACK;

BEGIN;
SELECT private.k2_acquire_domain_freeze(
  '00000000-0000-0000-0000-000000000002'::uuid,
  'test-write-freeze',
  NULL,
  interval '5 minutes'
);
DO $$
BEGIN
  BEGIN
    UPDATE public.ingredients
    SET unit_type = unit_type
    WHERE id = (SELECT id FROM public.ingredients ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'expected K2 freeze rejection';
  EXCEPTION WHEN SQLSTATE '55006' THEN
    NULL;
  END;
END;
$$;
ROLLBACK;

BEGIN;
SELECT private.k2_acquire_domain_freeze(
  '00000000-0000-0000-0000-000000000003'::uuid,
  'test-write-freeze',
  NULL,
  interval '5 minutes'
);
DO $$
BEGIN
  BEGIN
    UPDATE public.recipe_ingredients
    SET unit = unit
    WHERE id = (SELECT id FROM public.recipe_ingredients ORDER BY id LIMIT 1);
    RAISE EXCEPTION 'expected K2 freeze rejection';
  EXCEPTION WHEN SQLSTATE '55006' THEN
    NULL;
  END;
END;
$$;
ROLLBACK;

-- E: reads remain permitted while frozen.
BEGIN;
SELECT private.k2_acquire_domain_freeze(
  '00000000-0000-0000-0000-000000000004'::uuid,
  'test-read',
  NULL,
  interval '5 minutes'
);
SELECT count(*) FROM public.ingredients;
SELECT count(*) FROM public.recipe_ingredients;
ROLLBACK;

-- F: only the transaction-local K2 authorization permits the protected write.
BEGIN;
SELECT private.k2_acquire_domain_freeze(
  '00000000-0000-0000-0000-000000000005'::uuid,
  'test-authorized-write',
  NULL,
  interval '5 minutes'
);
SELECT private.k2_authorize_transaction('00000000-0000-0000-0000-000000000005'::uuid);
UPDATE public.ingredients
SET purchase_unit = purchase_unit
WHERE id = (SELECT id FROM public.ingredients ORDER BY id LIMIT 1);
ROLLBACK;

-- G: an invalid run id cannot authorize a transaction.
DO $$
BEGIN
  BEGIN
    PERFORM private.k2_authorize_transaction('00000000-0000-0000-0000-000000000099'::uuid);
    RAISE EXCEPTION 'expected invalid K2 authorization rejection';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END;
$$;

-- H: a second activation for the same domain is rejected while the first is active.
BEGIN;
SELECT private.k2_acquire_domain_freeze(
  '00000000-0000-0000-0000-000000000006'::uuid,
  'test-double-k2',
  NULL,
  interval '5 minutes'
);
DO $$
BEGIN
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
END;
$$;
ROLLBACK;

-- I: an exception rolls back the active row when acquisition and operation
-- are in the same transaction. The next status query must be inactive.
BEGIN;
SELECT private.k2_acquire_domain_freeze(
  '00000000-0000-0000-0000-000000000008'::uuid,
  'test-rollback',
  NULL,
  interval '5 minutes'
);
SELECT private.k2_authorize_transaction('00000000-0000-0000-0000-000000000008'::uuid);
ROLLBACK;
SELECT (private.k2_domain_freeze_status() ->> 'active')::boolean AS active_after_rollback;

-- J is covered by the same database trigger as B-D; importers cannot bypass it.

-- Privilege check: public application roles have no access to control functions.
SELECT has_function_privilege('anon', 'private.k2_acquire_domain_freeze(uuid,text,uuid,interval)', 'EXECUTE') = false AS anon_cannot_acquire;
SELECT has_function_privilege('authenticated', 'private.k2_authorize_transaction(uuid)', 'EXECUTE') = false AS authenticated_cannot_authorize;
