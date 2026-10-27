CREATE OR REPLACE FUNCTION public.record_manual_don_hielo_receipt(p_request_id uuid, p_quantity_kg numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_supplier bigint;v_ingredient uuid;v_movement uuid;v_existing public.manual_ice_receipts%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'Solo responsables pueden confirmar la entrada de hielo';
 END IF;
 IF p_request_id IS NULL OR p_quantity_kg IS NULL OR
    p_quantity_kg<=0 OR p_quantity_kg>500 OR scale(p_quantity_kg)>3 THEN
    RAISE EXCEPTION 'Introduce una cantidad de hielo en kg entre 0 y 500, hasta 3 decimales';
 END IF;
 IF length(coalesce(p_note,''))>300 THEN RAISE EXCEPTION 'Nota demasiado larga';END IF;
 SELECT id INTO v_supplier FROM public.suppliers WHERE lower(trim(name))='hielo fenix' LIMIT 1;
 SELECT id INTO v_ingredient FROM public.ingredients WHERE name='Hielo' AND base_unit='g' LIMIT 1;
 IF v_supplier IS NULL OR v_ingredient IS NULL THEN
   RAISE EXCEPTION 'No se encontró Hielo Fenix o el ingrediente Hielo en gramos';
 END IF;
 SELECT * INTO v_existing FROM public.manual_ice_receipts WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
   RETURN jsonb_build_object('receipt_id',v_existing.id,'stock_movement_id',v_existing.stock_movement_id,'duplicate',true);
 END IF;
 INSERT INTO public.manual_ice_receipts(id,supplier_id,ingredient_id,quantity_kg,created_by,note)
 VALUES (p_request_id,v_supplier,v_ingredient,p_quantity_kg,auth.uid(),nullif(trim(p_note),''));
 INSERT INTO public.stock_movements(
  movement_type,ingredient_id,quantity,unit,reference_doc,reference_type,reference_external_id,
  origin,idempotency_key,notes,provenance
 ) VALUES (
   'ADJUSTMENT',v_ingredient,p_quantity_kg*1000,'g',
   'HIELO-FENIX-'||p_request_id::text,'manual_adjustment',p_request_id::text,
   'manager_adjustment','hielo-fenix-receipt:'||p_request_id::text,
   'Entrada manual de hielo sin factura; coste económico pendiente de documento',
   jsonb_build_object('manual_ice_receipt_id',p_request_id,'supplier_id',v_supplier,
     'quantity_kg',p_quantity_kg,'created_by',auth.uid(),'accounting_status','invoice_not_received')
 ) RETURNING id INTO v_movement;
 UPDATE public.manual_ice_receipts SET stock_movement_id=v_movement WHERE id=p_request_id;
 RETURN jsonb_build_object('receipt_id',p_request_id,'stock_movement_id',v_movement,'duplicate',false);
END;
$function$
;