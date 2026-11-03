-- Hielo Fenix now supplies documentary evidence via email, not a manual scanner.
-- Only its exact owner-confirmed sender becomes eligible for automatic OCR intake.
-- The existing no-double-stock guards for ice and monthly invoices remain unchanged.
DO $migration$
DECLARE
  v_supplier bigint;
  v_other bigint;
  v_count integer;
  v_current text;
  v_old constant text := 'IN (''hielo fenix'',''vermut'')';
  v_new constant text := '= ''vermut''';
BEGIN
  SELECT count(*), min(id) INTO v_count, v_supplier
  FROM public.suppliers WHERE lower(btrim(name))='hielo fenix';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Hielo Fenix supplier, found %',v_count;
  END IF;

  SELECT supplier_id INTO v_other
  FROM public.purchase_supplier_sender_addresses
  WHERE sender_email='facturas@hielofenix.cat';
  IF v_other IS NOT NULL AND v_other <> v_supplier THEN
    RAISE EXCEPTION 'Sender has a different supplier: refusing reassignment';
  END IF;

  INSERT INTO public.purchase_supplier_sender_addresses
    (sender_email,supplier_id,confirmed_by_owner)
  VALUES ('facturas@hielofenix.cat',v_supplier,true)
  ON CONFLICT (sender_email) DO UPDATE
    SET confirmed_by_owner=true
    WHERE purchase_supplier_sender_addresses.supplier_id=excluded.supplier_id;

  SELECT pg_get_functiondef('public.auto_import_purchase_email_document(uuid)'::regprocedure)
  INTO v_current;
  IF v_current IS NULL OR strpos(v_current,v_old)=0 THEN
    RAISE EXCEPTION 'Expected email-import manual-supplier guard not found';
  END IF;
  IF (length(v_current)-length(replace(v_current,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Ambiguous sender guard: refusing function rewrite';
  END IF;

  EXECUTE replace(v_current,v_old,v_new);
END;
$migration$;
