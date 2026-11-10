-- A/64199 original document remains safely imported and its supplier
-- identity and economic evidence are preserved. A candidate K4 executor
-- failed verification because of ambiguous PL/pgSQL alias references.
-- It never posted stock or wrote audit receipts, so retire it rather than
-- expose an unverified physical operation.
DO $do$
BEGIN
 IF EXISTS (SELECT 1 FROM private.purchase_sanilec_a64199_verified_receipts)
 THEN RAISE EXCEPTION 'Refusing to retire receipt guard with existing audited stock'; END IF;
END $do$;
DROP FUNCTION IF EXISTS public.receive_verified_sanilec_a64199_20261023_v1(uuid,boolean);
DROP TABLE IF EXISTS private.purchase_sanilec_a64199_verified_receipts;
