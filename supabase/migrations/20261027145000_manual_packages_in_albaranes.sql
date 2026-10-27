-- Receive one standard supplier package and create a normal albarán row,
-- atomically with its *single* inventory movement. Never invent prices.
ALTER TABLE public.manual_ice_receipts
  ADD COLUMN IF NOT EXISTS invoice_id uuid UNIQUE REFERENCES public.purchase_invoices(id);
ALTER TABLE public.manual_vermut_receipts
  ADD COLUMN IF NOT EXISTS invoice_id uuid UNIQUE REFERENCES public.purchase_invoices(id);

CREATE OR REPLACE FUNCTION public.record_manual_package_invoice(
 p_request_id uuid, p_supplier_id bigint, p_packages integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $proc$
DECLARE
 v_invoice uuid;
 v_stock jsonb;
 v_ingredient uuid;
 v_supplier_name text;
 v_quantity numeric;
 v_unit text;
 v_label text;
 v_existing_packages numeric;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
   RAISE EXCEPTION 'Solo responsables pueden registrar entregas';
 END IF;
 IF p_request_id IS NULL OR p_packages IS NULL OR p_packages <= 0
    OR (p_supplier_id=22 AND p_packages>50)
    OR (p_supplier_id=17 AND p_packages>20)
    OR p_supplier_id NOT IN (17,22) THEN
   RAISE EXCEPTION 'Cantidad de envases no válida';
 END IF;

 IF p_supplier_id=22 THEN
   SELECT i.invoice_id,i.quantity_kg INTO v_invoice,v_existing_packages
   FROM public.manual_ice_receipts i WHERE i.id=p_request_id FOR UPDATE;
   IF FOUND THEN
     IF v_existing_packages<>p_packages*10 THEN
       RAISE EXCEPTION 'No se puede reutilizar el mismo envío con otra cantidad';
     END IF;
     IF v_invoice IS NOT NULL THEN
       RETURN jsonb_build_object('invoice_id',v_invoice,'duplicate',true);
     END IF;
   END IF;
   v_stock:=public.record_manual_don_hielo_receipt(
     p_request_id,p_packages*10,'Sacos de hielo: '||p_packages||
     ' × (5 bolsas × 2 kg) = '||(p_packages*10)||' kg');
   v_supplier_name:='Don Hielo';
   v_label:='Hielo · '||p_packages||' sacos (5 bolsas de 2 kg)';
   v_quantity:=p_packages;
   v_unit:='saco';
   SELECT id INTO v_ingredient FROM public.ingredients
     WHERE name='Hielo' AND base_unit='g' AND archived_at IS NULL LIMIT 1;
 ELSE
   SELECT v.invoice_id,v.quantity_l INTO v_invoice,v_existing_packages
   FROM public.manual_vermut_receipts v WHERE v.id=p_request_id FOR UPDATE;
   IF FOUND THEN
     IF v_existing_packages<>p_packages*10 THEN
       RAISE EXCEPTION 'No se puede reutilizar el mismo envío con otra cantidad';
     END IF;
     IF v_invoice IS NOT NULL THEN
       RETURN jsonb_build_object('invoice_id',v_invoice,'duplicate',true);
     END IF;
   END IF;
   v_stock:=public.record_manual_vermut_receipt(
     p_request_id,p_packages*10,'Garrafas de Vermut: '||p_packages||
     ' × 10 l = '||(p_packages*10)||' litros');
   v_supplier_name:='Vermut';
   v_label:='Vermut · '||p_packages||' garrafas de 10 l';
   v_quantity:=p_packages;
   v_unit:='garrafa';
   SELECT id INTO v_ingredient FROM public.ingredients
     WHERE name='Vermut' AND base_unit='ml' AND archived_at IS NULL LIMIT 1;
 END IF;
 IF v_ingredient IS NULL THEN RAISE EXCEPTION 'Ingrediente no encontrado'; END IF;

 INSERT INTO public.purchase_invoices(
  supplier_id,created_by,invoice_number,invoice_date,total_amount,
  file_path,status,source,expected_pages,document_kind
 ) VALUES(
  p_supplier_id,auth.uid(),'MAN-'||p_supplier_id||'-'||left(p_request_id::text,8),
  (now() AT TIME ZONE 'Europe/Madrid')::date,
  0,'manual-receipts/'||p_request_id||'.txt','mapped','manual',1,'delivery_note'
 ) RETURNING id INTO v_invoice;

 INSERT INTO public.purchase_invoice_lines(
  invoice_id,original_name,quantity,line_unit,mapped_ingredient_id,
  status,unit_price,total_price
 ) VALUES(v_invoice,v_label,v_quantity,v_unit,v_ingredient,'mapped',NULL,NULL);

 IF p_supplier_id=22 THEN
   UPDATE public.manual_ice_receipts SET invoice_id=v_invoice WHERE id=p_request_id;
 ELSE
   UPDATE public.manual_vermut_receipts SET invoice_id=v_invoice WHERE id=p_request_id;
 END IF;
 RETURN jsonb_build_object('invoice_id',v_invoice,'duplicate',false,
   'supplier',v_supplier_name,'packages',p_packages,
   'stock_movement_id',v_stock->>'stock_movement_id',
   'physical_quantity',p_packages*10,
   'physical_unit',CASE WHEN p_supplier_id=22 THEN 'kg' ELSE 'l' END);
END;
$proc$;
REVOKE ALL ON FUNCTION public.record_manual_package_invoice(uuid,bigint,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_manual_package_invoice(uuid,bigint,integer) TO authenticated;
