
DO $repair$
DECLARE
  v_invoice uuid := 'c756690f-399d-460a-81f6-024c93bb86d7';
  v_line uuid := '1776b158-e093-403b-bdc3-5111ca6e4674';
  v_receipt uuid := '2b37486c-200b-4438-ac95-f95be06888ee';
  v_original_movement uuid := '7c0836b7-208b-4fc1-9a3e-c5d630696a86';
  v_old uuid := '7c38b97d-914f-4506-a038-7155fce8ae3c';
  v_new uuid := 'c4f62c4c-1fc7-41bf-aba8-899546c2c4dc';
  v_original_mapping uuid := 'b2c4a543-c13d-439f-8d65-4842eed7f0d7';
  v_actor uuid := 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6';
  v_new_mapping uuid;
  v_debit uuid;
  v_credit uuid;
  v_correlation uuid := gen_random_uuid();
  v_price_result jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sanilec:A/64227:Nanas:BA1160:reclassify', 0));

  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = 'sanilec-a64227-nanas-reclassify-debit-v1') THEN
    IF NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE idempotency_key = 'sanilec-a64227-nanas-reclassify-credit-v1') THEN
      RAISE EXCEPTION 'Only one half of prior correction found';
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.purchase_receipt_confirmations c
    JOIN public.purchase_invoice_lines l ON l.id = c.purchase_invoice_line_id
    JOIN public.purchase_invoices i ON i.id = l.invoice_id
    JOIN public.stock_movements m ON m.id = c.stock_movement_id
    WHERE c.id=v_receipt AND c.purchase_invoice_id=v_invoice AND c.purchase_invoice_line_id=v_line
    AND c.supplier_id=9 AND c.ingredient_id=v_old AND c.mapping_version_id=v_original_mapping
    AND c.physical_quantity=12 AND c.base_unit='ud' AND c.observed_unit_price=1.09
    AND i.invoice_number='A/64227' AND i.status='mapped' AND i.source='email'
    AND l.original_name LIKE 'ESTROPAJO NANAS (%' AND l.mapped_ingredient_id=v_old
    AND m.id=v_original_movement AND m.ingredient_id=v_old AND m.quantity=12
    AND m.movement_type='PURCHASE' AND m.reversal_of_movement_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Confirmed Nanas original facts have changed. No correction made.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ingredients WHERE id=v_new AND name='Nanas' AND base_unit='ud' AND purchase_unit='ud') OR
     NOT EXISTS (SELECT 1 FROM public.ingredients WHERE id=v_old AND name='Estropajo' AND base_unit='ud') THEN
    RAISE EXCEPTION 'Target ingredient or units mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchase_supplier_sku_rules WHERE supplier_id=9 AND supplier_code='BA1160'
     AND ingredient_id=v_old AND mapping_version_id=v_original_mapping) THEN
    RAISE EXCEPTION 'Previously confirmed SKU already changed; do not overwrite';
  END IF;

  INSERT INTO public.purchase_mapping_versions
    (supplier_id,supplier_item_name,ingredient_id,conversion_factor,line_billing_unit,
     line_content_qty,line_content_unit,status,supersedes_id,idempotency_key,
     confirmed_by,confirmed_at,note)
  SELECT 9, old.supplier_item_name, v_new, 1, 'ud',1,'ud','confirmed',old.id,
    'owner-correct-sanilec-nanas-ingredient-20261028-v1',v_actor,now(),
    'Rectificación 28/10/2026: Nanas y Estropajo son ingredientes distintos. Confirmado por propietario. '
    || '12 Nanas en A/64227; historial K4 original inmutable.'
  FROM public.purchase_mapping_versions old WHERE old.id=v_original_mapping
  RETURNING id INTO v_new_mapping;
  IF v_new_mapping IS NULL THEN RAISE EXCEPTION 'New confirmed mapping not created'; END IF;

  UPDATE public.purchase_supplier_sku_rules
    SET ingredient_id=v_new,mapping_version_id=v_new_mapping,owner_confirmed_at=now(),
        note='Corrección del propietario 28/10/2026: BA1160 es Nanas, NO Estropajo. 12 unidades individuales.'
    WHERE supplier_id=9 AND supplier_code='BA1160'
      AND ingredient_id=v_old AND mapping_version_id=v_original_mapping;
  IF NOT FOUND THEN RAISE EXCEPTION 'SKU rule not corrected'; END IF;

  UPDATE public.supplier_item_mappings SET ingredient_id=v_new
    WHERE supplier_id=9 AND ingredient_id=v_old
      AND supplier_item_name ILIKE 'ESTROPAJO NANAS%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Legacy Nanas mappings not corrected'; END IF;

  INSERT INTO public.stock_movements
    (movement_type,ingredient_id,quantity,unit,movement_date,reference_doc,
     original_description,notes,processed_by,reference_type,reference_external_id,
     idempotency_key,origin,actor_profile_id,reversal_of_movement_id,
     correlation_id,provenance)
  VALUES
    ('ADJUSTMENT',v_old,-12,'ud',now(),'SANILEC:A/64227:NANAS:RECLASSIFY',
      'Corrección Nanas mal asignadas a Estropajo', 'Compensación de la recepción K4 inmutable ' || v_receipt::text,
      v_actor::text,'manual_adjustment','sanilec:A/64227:BA1160:reclassify:debit',
      'sanilec-a64227-nanas-reclassify-debit-v1','manager_adjustment',v_actor,
      v_original_movement,v_correlation,
      jsonb_build_object('schema_version','albaran-reclassification-v1',
        'kind','correction_debit','invoice_id',v_invoice,'line_id',v_line,
        'original_receipt_id',v_receipt,'old_ingredient_id',v_old,'new_ingredient_id',v_new,
        'reason','Nanas es ingrediente independiente de Estropajo'))
  RETURNING id INTO v_debit;

  INSERT INTO public.stock_movements
    (movement_type,ingredient_id,quantity,unit,movement_date,reference_doc,
     original_description,notes,processed_by,reference_type,reference_external_id,
     idempotency_key,origin,actor_profile_id,mapping_version_id,
     correlation_id,provenance)
  VALUES
    ('ADJUSTMENT',v_new,12,'ud',now(),'SANILEC:A/64227:NANAS:RECLASSIFY',
      'Reasignación correcta de 12 Nanas de A/64227','Contrapartida de ajuste ' || v_debit::text,
      v_actor::text,'manual_adjustment','sanilec:A/64227:BA1160:reclassify:credit',
      'sanilec-a64227-nanas-reclassify-credit-v1','manager_adjustment',v_actor,
      v_new_mapping,v_correlation,
      jsonb_build_object('schema_version','albaran-reclassification-v1',
        'kind','correction_credit','invoice_id',v_invoice,'line_id',v_line,
        'original_receipt_id',v_receipt,'original_movement_id',v_original_movement,
        'old_ingredient_id',v_old,'new_ingredient_id',v_new,
        'invalidated_price_line_id','862223b6-9bac-41e6-abc7-4231c56065f2',
        'new_ingredient_name','Nanas','price_before',1.56,'price_after',1.09,
        'reason','Nanas es ingrediente independiente de Estropajo'))
  RETURNING id INTO v_credit;

  IF NOT EXISTS(SELECT 1 FROM public.stock_movements WHERE id=v_debit AND ingredient_id=v_old AND quantity=-12)
     OR NOT EXISTS(SELECT 1 FROM public.stock_movements WHERE id=v_credit AND ingredient_id=v_new AND quantity=12)
     THEN RAISE EXCEPTION 'Correction stock ledger incomplete'; END IF;

  IF (SELECT current_price FROM public.ingredients WHERE id=v_new) = 1.56 THEN
    PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);
    SELECT public.set_ingredient_current_price(v_new,1.09) INTO v_price_result;
    IF coalesce((v_price_result->>'ok')::boolean,false) IS NOT TRUE THEN
      RAISE EXCEPTION 'Canonical Nanas price update rejected: %',v_price_result;
    END IF;
  ELSIF (SELECT current_price FROM public.ingredients WHERE id=v_new) <> 1.09 THEN
    RAISE EXCEPTION 'Nanas current price unexpected; must not overwrite';
  END IF;

  UPDATE public.user_notifications n
    SET title='Bajada de precio de Nanas en Sanilec',
        body='Nanas: 1,56 € → 1,09 € por unidad (−30,1 %). La comparación errónea con Estropajo Uninox se ha corregido.'
    WHERE n.type='albaran_price_variation' AND n.entity_id=v_invoice AND n.user_id=v_actor;

END
$repair$;