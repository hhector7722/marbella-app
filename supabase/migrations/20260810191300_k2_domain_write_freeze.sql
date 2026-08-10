-- K2 infrastructure only: domain write-freeze for unit columns.
-- Does not migrate or update any product data.

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE IF NOT EXISTS private.k2_domain_freezes (
  domain text PRIMARY KEY CHECK (domain = 'k2_units'),
  active boolean NOT NULL DEFAULT false,
  run_id uuid,
  owner_id uuid,
  reason text,
  acquired_at timestamptz,
  expires_at timestamptz,
  released_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT k2_domain_freezes_active_fields CHECK (
    active = false
    OR (run_id IS NOT NULL AND acquired_at IS NOT NULL AND expires_at IS NOT NULL)
  )
);

ALTER TABLE private.k2_domain_freezes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.k2_domain_freezes FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.k2_domain_freezes (domain, active)
VALUES ('k2_units', false)
ON CONFLICT (domain) DO NOTHING;

CREATE OR REPLACE FUNCTION private.k2_domain_freeze_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_catalog
AS $$
DECLARE
  v_freeze private.k2_domain_freezes;
BEGIN
  SELECT * INTO v_freeze
  FROM private.k2_domain_freezes
  WHERE domain = 'k2_units';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('domain', 'k2_units', 'active', false);
  END IF;

  RETURN jsonb_build_object(
    'domain', v_freeze.domain,
    'active', v_freeze.active AND v_freeze.expires_at > clock_timestamp(),
    'stored_active', v_freeze.active,
    'run_id', v_freeze.run_id,
    'owner_id', v_freeze.owner_id,
    'reason', v_freeze.reason,
    'acquired_at', v_freeze.acquired_at,
    'expires_at', v_freeze.expires_at,
    'released_at', v_freeze.released_at,
    'metadata', v_freeze.metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.k2_acquire_domain_freeze(
  p_run_id uuid,
  p_reason text,
  p_owner_id uuid DEFAULT NULL,
  p_ttl interval DEFAULT interval '15 minutes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_catalog
AS $$
DECLARE
  v_freeze private.k2_domain_freezes;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_run_id IS NULL OR NULLIF(trim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'K2_FREEZE_INVALID_REQUEST'
      USING ERRCODE = '22023';
  END IF;

  IF p_ttl <= interval '0 seconds' OR p_ttl > interval '1 hour' THEN
    RAISE EXCEPTION 'K2_FREEZE_INVALID_TTL'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize acquisition and make a second K2 fail instead of racing.
  PERFORM pg_advisory_xact_lock(hashtextextended('marbella:k2_units', 0));

  SELECT * INTO v_freeze
  FROM private.k2_domain_freezes
  WHERE domain = 'k2_units'
  FOR UPDATE;

  IF v_freeze.active AND v_freeze.expires_at > v_now THEN
    RAISE EXCEPTION 'K2_DOMAIN_FREEZE_ACTIVE: %', v_freeze.run_id
      USING ERRCODE = '55006';
  END IF;

  UPDATE private.k2_domain_freezes
  SET active = true,
      run_id = p_run_id,
      owner_id = p_owner_id,
      reason = trim(p_reason),
      acquired_at = v_now,
      expires_at = v_now + p_ttl,
      released_at = NULL,
      metadata = jsonb_build_object('mechanism', 'domain_write_freeze')
  WHERE domain = 'k2_units'
  RETURNING * INTO v_freeze;

  RETURN jsonb_build_object(
    'domain', v_freeze.domain,
    'active', v_freeze.active,
    'run_id', v_freeze.run_id,
    'owner_id', v_freeze.owner_id,
    'reason', v_freeze.reason,
    'acquired_at', v_freeze.acquired_at,
    'expires_at', v_freeze.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.k2_renew_domain_freeze(
  p_run_id uuid,
  p_ttl interval DEFAULT interval '15 minutes'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_catalog
AS $$
DECLARE
  v_freeze private.k2_domain_freezes;
BEGIN
  IF p_run_id IS NULL OR p_ttl <= interval '0 seconds' OR p_ttl > interval '1 hour' THEN
    RAISE EXCEPTION 'K2_FREEZE_INVALID_RENEWAL'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_freeze
  FROM private.k2_domain_freezes
  WHERE domain = 'k2_units'
  FOR UPDATE;

  IF NOT FOUND OR NOT v_freeze.active OR v_freeze.run_id IS DISTINCT FROM p_run_id
     OR v_freeze.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'K2_FREEZE_NOT_OWNED'
      USING ERRCODE = '42501';
  END IF;

  UPDATE private.k2_domain_freezes
  SET expires_at = clock_timestamp() + p_ttl
  WHERE domain = 'k2_units' AND run_id = p_run_id
  RETURNING * INTO v_freeze;

  RETURN jsonb_build_object(
    'domain', v_freeze.domain,
    'active', true,
    'run_id', v_freeze.run_id,
    'expires_at', v_freeze.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.k2_release_domain_freeze(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_catalog
AS $$
DECLARE
  v_freeze private.k2_domain_freezes;
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'K2_FREEZE_INVALID_RUN_ID'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('marbella:k2_units', 0));

  UPDATE private.k2_domain_freezes
  SET active = false,
      released_at = clock_timestamp(),
      expires_at = clock_timestamp()
  WHERE domain = 'k2_units' AND active = true AND run_id = p_run_id
  RETURNING * INTO v_freeze;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'K2_FREEZE_NOT_OWNED'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'domain', v_freeze.domain,
    'active', false,
    'run_id', v_freeze.run_id,
    'released_at', v_freeze.released_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.k2_authorize_transaction(p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_catalog
AS $$
DECLARE
  v_active boolean;
  v_run_id uuid;
BEGIN
  SELECT active AND expires_at > clock_timestamp(), run_id
  INTO v_active, v_run_id
  FROM private.k2_domain_freezes
  WHERE domain = 'k2_units';

  IF NOT COALESCE(v_active, false) OR v_run_id IS DISTINCT FROM p_run_id THEN
    RAISE EXCEPTION 'K2_FREEZE_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  -- Transaction-local context: it disappears on commit/rollback.
  PERFORM set_config('marbella.k2.run_id', p_run_id::text, true);
  PERFORM set_config('marbella.k2.authorized', 'true', true);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION private.k2_guard_protected_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_catalog
AS $$
DECLARE
  v_freeze private.k2_domain_freezes;
  v_context text;
BEGIN
  -- All writers briefly share this row lock. K2 acquisition takes FOR UPDATE,
  -- so a writer already in flight finishes before K2 revalidates its snapshot.
  SELECT * INTO v_freeze
  FROM private.k2_domain_freezes
  WHERE domain = 'k2_units'
  FOR SHARE;

  IF COALESCE(v_freeze.active, false) AND v_freeze.expires_at > clock_timestamp() THEN
    v_context := current_setting('marbella.k2.run_id', true);
    IF v_context IS DISTINCT FROM v_freeze.run_id::text
       OR current_setting('marbella.k2.authorized', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'K2_DOMAIN_WRITE_FREEZE: %', v_freeze.run_id
        USING ERRCODE = '55006';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_k2_guard_ingredients_insert_delete ON public.ingredients;
CREATE TRIGGER trg_k2_guard_ingredients_insert_delete
BEFORE INSERT OR DELETE ON public.ingredients
FOR EACH ROW EXECUTE FUNCTION private.k2_guard_protected_write();

DROP TRIGGER IF EXISTS trg_k2_guard_ingredients_units ON public.ingredients;
CREATE TRIGGER trg_k2_guard_ingredients_units
BEFORE UPDATE OF purchase_unit, unit_type, recipe_unit, unit, order_unit
ON public.ingredients
FOR EACH ROW EXECUTE FUNCTION private.k2_guard_protected_write();

DROP TRIGGER IF EXISTS trg_k2_guard_recipe_ingredients_insert_delete ON public.recipe_ingredients;
CREATE TRIGGER trg_k2_guard_recipe_ingredients_insert_delete
BEFORE INSERT OR DELETE ON public.recipe_ingredients
FOR EACH ROW EXECUTE FUNCTION private.k2_guard_protected_write();

DROP TRIGGER IF EXISTS trg_k2_guard_recipe_ingredients_unit ON public.recipe_ingredients;
CREATE TRIGGER trg_k2_guard_recipe_ingredients_unit
BEFORE UPDATE OF unit ON public.recipe_ingredients
FOR EACH ROW EXECUTE FUNCTION private.k2_guard_protected_write();

REVOKE ALL ON FUNCTION private.k2_domain_freeze_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.k2_acquire_domain_freeze(uuid, text, uuid, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.k2_renew_domain_freeze(uuid, interval) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.k2_release_domain_freeze(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.k2_authorize_transaction(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.k2_guard_protected_write() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.k2_domain_freeze_status() TO service_role;
GRANT EXECUTE ON FUNCTION private.k2_acquire_domain_freeze(uuid, text, uuid, interval) TO service_role;
GRANT EXECUTE ON FUNCTION private.k2_renew_domain_freeze(uuid, interval) TO service_role;
GRANT EXECUTE ON FUNCTION private.k2_release_domain_freeze(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.k2_authorize_transaction(uuid) TO service_role;

COMMENT ON TABLE private.k2_domain_freezes IS
  'Estado temporal del write-freeze del dominio K2. No contiene datos de producto.';
COMMENT ON FUNCTION private.k2_authorize_transaction(uuid) IS
  'Autoriza solo la transacción K2 actual mediante contexto local; no es un bypass de aplicación.';
