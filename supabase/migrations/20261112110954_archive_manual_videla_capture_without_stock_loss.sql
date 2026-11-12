-- Owner request 2026-11-10: hide last manual upload from operational UI without
-- invalidating its genuine receipt movements or original PDF/image evidence.
-- A status='discarded' update is INCORRECT for this document because it has
-- two live PURCHASE movements and active historical price records.
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS operational_hidden_at timestamptz;
COMMENT ON COLUMN public.purchase_invoices.operational_hidden_at IS 'Display-only operational archive. Does not discard document, reverse stock or alter finances.';

CREATE OR REPLACE FUNCTION private.guard_invoice_operational_hide_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $f$
BEGIN
 IF NEW.operational_hidden_at IS DISTINCT FROM OLD.operational_hidden_at THEN
  IF current_user NOT IN('postgres','service_role') THEN
   RAISE EXCEPTION 'Only backend may hide purchase documents';
  END IF;
  IF NEW.source<>'scanner' THEN RAISE EXCEPTION 'Scanner capture only'; END IF;
 END IF;
 RETURN NEW;
END;
$f$;
REVOKE ALL ON FUNCTION private.guard_invoice_operational_hide_v1() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_invoice_operational_hide ON public.purchase_invoices;
CREATE TRIGGER guard_invoice_operational_hide BEFORE UPDATE OF operational_hidden_at
ON public.purchase_invoices FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_operational_hide_v1();

CREATE TABLE IF NOT EXISTS private.purchase_invoice_operational_hide_audit(
 invoice_id uuid PRIMARY KEY REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
 original_status text NOT NULL CHECK(original_status='pending_mapping'),
 original_sha256 text NOT NULL CHECK(original_sha256~'^[a-f0-9]{64}$'),
 original_file_path text NOT NULL,
 original_created_at timestamptz NOT NULL,
 receipts integer NOT NULL CHECK(receipts=2),
 stock_movements integer NOT NULL CHECK(stock_movements=2),
 price_history integer NOT NULL CHECK(price_history=2),
 physical_stock_untouched boolean NOT NULL DEFAULT true CHECK(physical_stock_untouched),
 remains_active_in_ledger boolean NOT NULL DEFAULT true CHECK(remains_active_in_ledger),
 archived_at timestamptz NOT NULL,
 reason text NOT NULL DEFAULT 'Owner request: hide manual upload from operational lists; preserve posted stock'
);
ALTER TABLE private.purchase_invoice_operational_hide_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.purchase_invoice_operational_hide_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON private.purchase_invoice_operational_hide_audit TO service_role;

DO $apply$
DECLARE i public.purchase_invoices%ROWTYPE;n_receipts int;n_stock int;n_price int;ts timestamptz:=statement_timestamp();
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('archive-owner-videla-20261110-no-stock-deletion',0));
 SELECT * INTO i FROM public.purchase_invoices WHERE id='ce4f641b-9b83-4f83-b243-2c895818b57e'::uuid FOR UPDATE;
 IF i.id IS NULL OR i.source<>'scanner' OR i.supplier_id<>3 OR i.status<>'pending_mapping'
 OR i.invoice_date<>'2026-11-10'::date
 OR i.created_at<>'2026-11-10 12:57:16.081053+00'::timestamptz
 OR i.content_sha256<>'9215895924d5ff6dff8125833cc0f5c32d9cd03a22753a6fb11a687fb6c2dd72'
 OR i.file_path<>'2a45bdcd-8850-4dc2-bd1e-50be0196106c/2026/11/1794315435245_scanner_image.jpg'
 OR i.operational_hidden_at IS NOT NULL
 THEN RAISE EXCEPTION 'Unexpected Videla document or altered state'; END IF;
 SELECT count(*) INTO n_receipts FROM public.purchase_receipt_confirmations WHERE purchase_invoice_id=i.id;
 SELECT count(*) INTO n_stock FROM public.stock_movements sm
 JOIN public.purchase_invoice_lines l ON l.id=sm.reference_id
 WHERE l.invoice_id=i.id AND sm.movement_type='PURCHASE'
 AND NOT EXISTS(SELECT 1 FROM public.stock_movements rev WHERE rev.reversal_of_movement_id=sm.id
 AND rev.origin='reversal'::public.stock_movement_origin);
 SELECT count(*) INTO n_price FROM public.ingredient_price_history WHERE purchase_invoice_id=i.id;
 IF n_receipts<>2 OR n_stock<>2 OR n_price<>2 THEN
 RAISE EXCEPTION 'Expected 2 original receipts, 2 active stock movements and 2 price records; found %, %, %',n_receipts,n_stock,n_price; END IF;
 UPDATE public.purchase_invoices SET operational_hidden_at=ts WHERE id=i.id;
 INSERT INTO private.purchase_invoice_operational_hide_audit(invoice_id,original_status,original_sha256,original_file_path,original_created_at,receipts,stock_movements,price_history,archived_at)
 VALUES(i.id,i.status,i.content_sha256,i.file_path,i.created_at,n_receipts,n_stock,n_price,ts);
END;
$apply$;