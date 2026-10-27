-- Manual single-product receipts: Pons supplies Vermut in liters.
-- Economic invoice/receipt is independent and may be photographed later.
DO $seed$
DECLARE new_id bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('marbella-create-supplier-pons'));
 IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE lower(btrim(name))='pons') THEN
   SELECT coalesce(max(id),0)+1 INTO new_id FROM public.suppliers;
   INSERT INTO public.suppliers(id,name,notes)
   VALUES(new_id,'Pons','Solo Vermut. Entregas manuales por litros; factura física o correo cuando esté disponible.');
 END IF;
END;
$seed$;

CREATE TABLE IF NOT EXISTS public.manual_pons_vermut_receipts (
 id uuid PRIMARY KEY,
 supplier_id bigint NOT NULL REFERENCES public.suppliers(id),
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
 quantity_l numeric(12,3) NOT NULL CHECK(quantity_l>0 AND quantity_l<=200),
 stock_movement_id uuid UNIQUE REFERENCES public.stock_movements(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 received_at timestamptz NOT NULL DEFAULT now(),
 note text
);
ALTER TABLE public.manual_pons_vermut_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_pons_vermut_receipts FROM PUBLIC,anon;
GRANT SELECT ON public.manual_pons_vermut_receipts TO authenticated;
DROP POLICY IF EXISTS manual_pons_vermut_receipts_read ON public.manual_pons_vermut_receipts;
CREATE POLICY manual_pons_vermut_receipts_read
 ON public.manual_pons_vermut_receipts FOR SELECT TO authenticated
 USING((select auth.uid()) IS NOT NULL AND public.is_purchase_manager_or_admin());

CREATE OR REPLACE FUNCTION public.record_manual_pons_vermut_receipt(
 p_request_id uuid,p_quantity_l numeric,p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $rpc$
DECLARE v_supplier bigint;v_ingredient uuid;v_movement uuid;
 v_existing public.manual_pons_vermut_receipts%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
   RAISE EXCEPTION 'Solo manager o admin puede confirmar recepciones de Vermut';
 END IF;
 IF p_request_id IS NULL OR p_quantity_l IS NULL OR p_quantity_l<=0
   OR p_quantity_l>200 OR scale(p_quantity_l)>3 THEN
   RAISE EXCEPTION 'Introduce litros reales entre 0 y 200, máximo 3 decimales';
 END IF;
 IF length(coalesce(p_note,''))>300 THEN RAISE EXCEPTION 'Nota demasiado larga'; END IF;
 SELECT id INTO v_supplier FROM public.suppliers WHERE lower(btrim(name))='pons' LIMIT 1;
 SELECT id INTO v_ingredient FROM public.ingredients
 WHERE name='Vermut' AND base_unit='ml' LIMIT 1;
 IF v_supplier IS NULL OR v_ingredient IS NULL THEN
   RAISE EXCEPTION 'Proveedor Pons o ingrediente Vermut no configurados';
 END IF;
 SELECT * INTO v_existing FROM public.manual_pons_vermut_receipts WHERE id=p_request_id FOR UPDATE;
 IF FOUND THEN
   RETURN jsonb_build_object('receipt_id',v_existing.id,'stock_movement_id',v_existing.stock_movement_id,'duplicate',true);
 END IF;
 INSERT INTO public.manual_pons_vermut_receipts
  (id,supplier_id,ingredient_id,quantity_l,created_by,note)
 VALUES(p_request_id,v_supplier,v_ingredient,p_quantity_l,auth.uid(),nullif(btrim(p_note),''));
 INSERT INTO public.stock_movements(
  movement_type,ingredient_id,quantity,unit,reference_doc,reference_type,reference_external_id,
  origin,idempotency_key,notes,provenance
 ) VALUES(
  'ADJUSTMENT',v_ingredient,p_quantity_l*1000,'ml',
  'PONS-VERMUT-'||p_request_id::text,'manual_adjustment',p_request_id::text,
  'manager_adjustment','pons-vermut-receipt:'||p_request_id::text,
  'Entrada manual de Vermut de Pons sin factura: coste pendiente de justificante',
  jsonb_build_object('manual_pons_vermut_receipt_id',p_request_id,
    'supplier_id',v_supplier,'quantity_l',p_quantity_l,'created_by',auth.uid(),
    'accounting_status','invoice_not_received')
 ) RETURNING id INTO v_movement;
 UPDATE public.manual_pons_vermut_receipts
 SET stock_movement_id=v_movement WHERE id=p_request_id;
 RETURN jsonb_build_object('receipt_id',p_request_id,
   'stock_movement_id',v_movement,'duplicate',false);
END;
$rpc$;
REVOKE ALL ON FUNCTION public.record_manual_pons_vermut_receipt(uuid,numeric,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_manual_pons_vermut_receipt(uuid,numeric,text)
 TO authenticated;
