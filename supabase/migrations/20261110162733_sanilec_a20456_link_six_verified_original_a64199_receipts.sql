-- Associate exactly six 23-Oct Sanilec A/64199 physical receipts,
-- already certified and physically posted to stock once, with their
-- monthly A/20456 invoice rows. NO additional stock movement or price edit.
-- Monthly source excerpt A/64199 proves source row offsets 16..25.
DO $certify$
DECLARE
 v_month public.purchase_invoices%ROWTYPE;
 v_original public.purchase_invoices%ROWTYPE;
 v_month_extraction public.document_extractions%ROWTYPE;
 v_mjob public.document_processing_jobs%ROWTYPE;
 v_month_line public.purchase_invoice_lines%ROWTYPE;
 v_original_line public.purchase_invoice_lines%ROWTYPE;
 v_month_p public.purchase_interpretation_proposals%ROWTYPE;
 v_original_p public.purchase_interpretation_proposals%ROWTYPE;
 v_receipt public.purchase_receipt_confirmations%ROWTYPE;
 v_movement public.stock_movements%ROWTYPE;
 v_cert private.purchase_sanilec_a64199_physical_receipts_certified_v1%ROWTYPE;
 v_row record;
 v_count int:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('sanilec-A20456-link-6-to-A64199-posted-stock',0));
 SELECT * INTO v_month FROM public.purchase_invoices
 WHERE id='e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid FOR UPDATE;
 SELECT * INTO v_original FROM public.purchase_invoices
 WHERE id='8b22b629-c480-49c4-b11b-382ea21c9998'::uuid FOR KEY SHARE;
 SELECT * INTO v_mjob FROM public.document_processing_jobs
 WHERE invoice_id=v_month.id FOR KEY SHARE;
 SELECT * INTO v_month_extraction FROM public.document_extractions
 WHERE id=v_mjob.evidence_extraction_id FOR KEY SHARE;
 IF v_month.id IS NULL OR v_original.id IS NULL OR v_month_extraction.id IS NULL
 OR v_month.supplier_id<>9 OR v_month.source<>'email'
 OR v_month.invoice_number<>'A/20456' OR v_month.document_kind<>'monthly_invoice'
 OR v_month.status<>'pending_mapping'
 OR v_month.content_sha256<>'4357ee7da8d4a8e2498c1d6a4495b869a526bac5e5cdefe2d7fcf64373733a3b'
 OR v_month.base_amount<>673.80 OR v_month.tax_amount<>141.50
 OR v_month.total_amount<>815.30
 OR v_month_extraction.status<>'success'
 OR v_month_extraction.invoice_id<>v_month.id
 OR v_month_extraction.file_version_hash<>v_month.content_sha256
 OR v_mjob.status<>'completed'
 OR v_original.supplier_id<>9 OR v_original.source<>'email'
 OR v_original.invoice_number<>'A/64199'
 OR v_original.invoice_date<>'2026-10-23'
 OR v_original.content_sha256<>'963d539dc24173658446d4ba2dcba9633195c14273f91504e6fa906f380ec8f6'
 OR v_original.document_kind<>'delivery_note' OR v_original.total_amount<>417.78
 THEN RAISE EXCEPTION 'Original Sanilec monthly or delivery identity changed'; END IF;

 FOR v_row IN SELECT * FROM (VALUES
 ('81571aaf-6ccb-4677-b206-933e05127a93'::uuid,
  '63fa23af-3830-4599-a33e-16bf1224255f'::uuid,'TW1073'::text,16::int,1::numeric,10.75::numeric,50::numeric,'ud'::text),
 ('f9701f85-99a9-4dd4-82e0-f87080a1dab4'::uuid,
  'beb2c645-2177-4653-9dfb-9a6ef9f5dae8'::uuid,'QM8190',19,5,3.20,5000,'ml'),
 ('77c022b8-3ae8-4a6d-8507-0e4647da1e86'::uuid,
  '93a23388-f914-421c-b268-8b782c7af348'::uuid,'MM1130',20,1,1.62,1,'ud'),
 ('c88c1db0-f626-449e-9813-68c065cb7506'::uuid,
  'd0c3070f-8a26-4f7b-87ec-f65424290dc4'::uuid,'QM6001',22,5,5.78,5000,'ml'),
 ('72ab6de2-c2a9-4de4-a56b-732c64118539'::uuid,
  'a2b3647c-3e98-4841-aab7-429a980d9bc8'::uuid,'SE1080',23,1,28.27,4000,'ud'),
 ('e5450c63-f01b-4cdf-9850-4ce1b94d7489'::uuid,
  '2d3c0258-f9b3-45bf-afe5-5c16fd28ee8a'::uuid,'TW1703',25,2,6.86,100,'ud')
 ) AS x(month_id,original_id,sku,source_row_index,billed_qty,net_amount,physical_qty,base_unit)
 ORDER BY source_row_index LOOP

  SELECT * INTO v_month_line FROM public.purchase_invoice_lines
  WHERE id=v_row.month_id AND invoice_id=v_month.id
  AND superseded_by_extraction_id IS NULL FOR UPDATE;
  SELECT * INTO v_original_line FROM public.purchase_invoice_lines
  WHERE id=v_row.original_id AND invoice_id=v_original.id
  AND superseded_by_extraction_id IS NULL FOR KEY SHARE;
  SELECT * INTO v_month_p FROM public.purchase_interpretation_proposals
  WHERE id=v_month_line.interpretation_proposal_id FOR KEY SHARE;
  SELECT * INTO v_original_p FROM public.purchase_interpretation_proposals
  WHERE id=v_original_line.interpretation_proposal_id FOR KEY SHARE;
  SELECT * INTO v_cert FROM private.purchase_sanilec_a64199_physical_receipts_certified_v1
  WHERE invoice_line_id=v_original_line.id FOR KEY SHARE;
  SELECT * INTO v_receipt FROM public.purchase_receipt_confirmations
  WHERE id=v_cert.receipt_id FOR KEY SHARE;
  SELECT * INTO v_movement FROM public.stock_movements
  WHERE id=v_receipt.stock_movement_id FOR KEY SHARE;

  IF v_month_line.id IS NULL OR v_original_line.id IS NULL
    OR v_month_p.id IS NULL OR v_original_p.id IS NULL
    OR v_cert.invoice_line_id IS NULL OR v_receipt.id IS NULL OR v_movement.id IS NULL
    OR v_month_line.status<>'mapped'
    OR v_original_line.status<>'mapped'
    OR v_month_line.mapped_ingredient_id IS NULL
    OR v_month_line.mapped_ingredient_id<>v_original_line.mapped_ingredient_id
    OR v_month_line.quantity<>v_row.billed_qty
    OR v_original_line.quantity<>v_row.billed_qty
    OR v_month_line.total_price<>v_row.net_amount
    OR v_original_line.total_price<>v_row.net_amount
    OR v_month_p.source_row_index<>v_row.source_row_index
    OR v_month_p.document_extraction_id<>v_month_extraction.id
    OR v_month_p.source_file_hash<>v_month.content_sha256
    OR v_month_p.observed->>'supplier_product_code_raw'<>v_row.sku
    OR v_original_p.observed->>'supplier_product_code_raw'<>v_row.sku
    OR v_cert.supplier_sku<>v_row.sku
    OR v_cert.verified_pdf_sha256<>v_original.content_sha256
    OR v_cert.original_net_line_amount<>v_row.net_amount
    OR v_cert.physical_quantity<>v_row.physical_qty
    OR v_cert.base_unit<>v_row.base_unit
    OR v_receipt.purchase_invoice_id<>v_original.id
    OR v_receipt.purchase_invoice_line_id<>v_original_line.id
    OR v_receipt.ingredient_id<>v_month_line.mapped_ingredient_id
    OR v_receipt.physical_quantity<>v_row.physical_qty
    OR v_movement.id<>v_cert.stock_movement_id
    OR v_movement.movement_type<>'PURCHASE'
    OR v_movement.ingredient_id<>v_month_line.mapped_ingredient_id
    OR v_movement.quantity<>v_row.physical_qty
    OR v_movement.unit<>v_row.base_unit
    OR EXISTS(SELECT 1 FROM public.stock_movements reversal
      WHERE reversal.reversal_of_movement_id=v_movement.id
       AND reversal.origin='reversal')
    OR EXISTS(SELECT 1 FROM private.purchase_invoice_delivery_reconciliations corr
      WHERE corr.invoice_line_id=v_month_line.id
         OR corr.original_delivery_line_id=v_original_line.id
         OR corr.original_receipt_id=v_receipt.id)
    OR EXISTS(SELECT 1 FROM public.stock_movements sm
      WHERE sm.reference_id=v_month_line.id AND sm.movement_type='PURCHASE')
  THEN RAISE EXCEPTION 'Cannot certify a unique posted source receipt for monthly SKU %',v_row.sku; END IF;

  INSERT INTO private.purchase_invoice_delivery_reconciliations(
    invoice_line_id,original_delivery_line_id,original_receipt_id,
    invoice_id,source_extraction_id,source_hash,
    supplier_delivery_ref,supplier_delivery_date)
  VALUES(v_month_line.id,v_original_line.id,v_receipt.id,
    v_month.id,v_month_extraction.id,v_month.content_sha256,
    'A/64199','2026-10-23'::date);

  IF NOT public.purchase_invoice_line_stock_reconciled(
    v_month_line.id,v_month_line.mapped_ingredient_id)
  THEN RAISE EXCEPTION 'Monthly row % did not inherit certified prior stock',v_month_line.id; END IF;
  v_count:=v_count+1;
 END LOOP;
 IF v_count<>6 THEN RAISE EXCEPTION 'Unexpected monthly stock links %',v_count; END IF;
 PERFORM public.sync_purchase_invoice_status(v_month.id);
END;
$certify$;
