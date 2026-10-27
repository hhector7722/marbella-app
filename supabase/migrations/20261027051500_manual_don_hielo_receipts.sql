-- Operational ice intake without inventing an invoice or a supplier price.
-- Stock is updated once in grams, only from an authenticated manager action.
DO $fn$
DECLARE next_id bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE lower(trim(name))='don hielo') THEN
    PERFORM pg_advisory_xact_lock(hashtext('marbella-add-don-hielo'));
    IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE lower(trim(name))='don hielo') THEN
      SELECT coalesce(max(id),0)+1 INTO next_id FROM public.suppliers;
      INSERT INTO public.suppliers(id,name,notes)
      VALUES (next_id,'Don Hielo','Recepción rápida manual de hielo. Separado de Hielo Fenix.');
    END IF;
  END IF;
END;
$fn$;

CREATE TABLE IF NOT EXISTS public.manual_ice_receipts (
 id uuid PRIMARY KEY,
 supplier_id bigint NOT NULL REFERENCES public.suppliers(id),
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
 quantity_kg numeric(12,3) NOT NULL CHECK (quantity_kg>0 AND quantity_kg<=500),
 stock_movement_id uuid UNIQUE REFERENCES public.stock_movements(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 received_at timestamptz NOT NULL DEFAULT now(),
 note text
);
ALTER TABLE public.manual_ice_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.manual_ice_receipts FROM PUBLIC,anon;
GRANT SELECT ON public.manual_ice_receipts TO authenticated;
DROP POLICY IF EXISTS manual_ice_receipts_read_managers ON public.manual_ice_receipts;
CREATE POLICY manual_ice_receipts_read_managers
ON public.manual_ice_receipts FOR SELECT TO authenticated
USING ((select auth.uid()) IS NOT NULL AND public.is_purchase_manager_or_admin());

CREATE OR REPLACE FUNCTION public.record_manual_don_hielo_receipt(
 p_request_id uuid,p_quantity_kg numeric,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
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
 SELECT id INTO v_supplier FROM public.suppliers WHERE lower(trim(name))='don hielo' LIMIT 1;
 SELECT id INTO v_ingredient FROM public.ingredients WHERE name='Hielo' AND base_unit='g' LIMIT 1;
 IF v_supplier IS NULL OR v_ingredient IS NULL THEN
   RAISE EXCEPTION 'No se encontró Don Hielo o el ingrediente Hielo en gramos';
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
   'DON-HIELO-'||p_request_id::text,'manual_adjustment',p_request_id::text,
   'manager_adjustment','don-hielo-receipt:'||p_request_id::text,
   'Entrada manual de hielo sin factura; coste económico pendiente de documento',
   jsonb_build_object('manual_ice_receipt_id',p_request_id,'supplier_id',v_supplier,
     'quantity_kg',p_quantity_kg,'created_by',auth.uid(),'accounting_status','invoice_not_received')
 ) RETURNING id INTO v_movement;
 UPDATE public.manual_ice_receipts SET stock_movement_id=v_movement WHERE id=p_request_id;
 RETURN jsonb_build_object('receipt_id',p_request_id,'stock_movement_id',v_movement,'duplicate',false);
END;
$fn$;
REVOKE ALL ON FUNCTION public.record_manual_don_hielo_receipt(uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_manual_don_hielo_receipt(uuid,numeric,text) TO authenticated;
