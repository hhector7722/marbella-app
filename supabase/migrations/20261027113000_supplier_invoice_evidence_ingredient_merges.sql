-- Merge confirmed identities from actual supplier invoice lines. Append-only inventory preserved.
-- Do NOT normalize unit conversions by guessing physical weights/density.
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS preferred_invoice_unit text;
ALTER TABLE public.ingredient_consolidation_aliases ADD COLUMN IF NOT EXISTS invoice_unit text;
ALTER TABLE public.ingredient_consolidation_aliases ADD COLUMN IF NOT EXISTS conversion_status text;
ALTER TABLE public.ingredient_consolidation_aliases ADD COLUMN IF NOT EXISTS mapping_requires_review_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ingredient_consolidation_conversion_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_mapping_id uuid NOT NULL UNIQUE REFERENCES public.supplier_item_mappings(id),
 duplicate_ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
 canonical_ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
 supplier_item_name text NOT NULL,
 billed_unit text,
 preferred_invoice_unit text NOT NULL,
 original_purchase_unit text NOT NULL,
 canonical_purchase_unit text NOT NULL,
 original_base_unit text NOT NULL,
 canonical_base_unit text NOT NULL,
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'needs_verified_conversion'
   CHECK(status IN ('needs_verified_conversion','resolved','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ingredient_consolidation_conversion_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ingredient_consolidation_conversion_reviews FROM PUBLIC,anon;
GRANT SELECT ON public.ingredient_consolidation_conversion_reviews TO authenticated;
DROP POLICY IF EXISTS ingredient_conversion_reviews_manager_select ON public.ingredient_consolidation_conversion_reviews;
CREATE POLICY ingredient_conversion_reviews_manager_select
 ON public.ingredient_consolidation_conversion_reviews FOR SELECT TO authenticated
 USING((select auth.uid()) IS NOT NULL AND public.is_purchase_manager_or_admin());

DO $merge$
DECLARE r record; d public.ingredients%ROWTYPE; c public.ingredients%ROWTYPE;
 v_pre_stock numeric; v_post_stock numeric;
 v_pre_movements bigint; v_post_movements bigint;
 n_move integer; n_review integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('marbella-verified-ingredient-dedup-2026-10-27'));
 CREATE TEMP TABLE merge_candidates (
   duplicate uuid PRIMARY KEY, canonical uuid NOT NULL,
   invoice_unit text NOT NULL,reason text NOT NULL
 ) ON COMMIT DROP;
 INSERT INTO merge_candidates(duplicate,canonical,invoice_unit,reason) VALUES
 ('43ff0a0d-5f04-45dd-b5c3-f19fc761875a'::uuid,'eca0875a-ec96-4e54-97da-4e2d257364d4'::uuid,'ud','Haribo Ositos Oro 100 g; same SKU invoiced repeatedly under Haribo'),
 ('420f9896-5471-4814-bec7-da7e6b01c8b6'::uuid,'ba9090ea-3fa8-4815-83b5-e3161b52faca'::uuid,'kg','ESPATLLE CUITA EXTRA 11x11 matches old Jamón york supplier mapping'),
 ('d2c8db26-637f-4ed7-98d9-fefca859bbd5'::uuid,'29d34ab6-82ff-4878-bbae-ba515ce6b062'::uuid,'kg','CENTRE PERNIL C/V matches old Jamón Serrano supplier mapping'),
 ('c616cff7-fd57-4447-8ce4-64440d13c2bf'::uuid,'5199784b-b6bd-42cb-9f00-ea63494aa764'::uuid,'kg','50 percent cebo iberico cut; same kg and purchase price 41.2008 as Jamón Ibérico'),
 ('aec0bdeb-fff2-440a-934f-a96bd6658b1d'::uuid,'087b39e9-3628-42cc-9819-3858bee41508'::uuid,'ud','Apio one piece invoiced as UNI, old stock in grams; piece weight unknown'),
 ('7e0a73af-8d43-4c0d-8968-10150cbdd160'::uuid,'96fa79d1-32d0-4400-9290-cd3bace67980'::uuid,'manojo','Cebollino Manojo invoiced as MAN, old stock in grams; bunch weight unknown'),
 ('6c953a50-4c56-4ee8-8edd-4f6d620dc39e'::uuid,'b4df25f7-0d45-473a-9b7f-12c6a399f6f6'::uuid,'kg','CROQUETA COCIDO same vendor and same unit price per kg; old recipe uses individual pieces'),
 ('9ba2119a-7e82-4159-8cd6-f2353c6cbcbf'::uuid,'82e4a0fa-c316-4b2d-952d-e3593180ee41'::uuid,'kg','CROQUETA BRANDADA matches old croquetas bacalao supplier invoices; old recipe uses pieces'),
 ('0c4cf35a-0135-49e7-a24b-e62c4ac767e4'::uuid,'69101a4f-ca02-48e9-a6ea-a799f795de17'::uuid,'kg','BACON FOOD SERVICE GALNO appears on old Bacon invoices, billed kg or unidades; pack weight unknown'),
 ('15e13c38-1bd2-466f-911d-13d286421337'::uuid,'442a2689-73cf-4322-851d-2b4b5a5bf21d'::uuid,'ud','OLIVAS EL FARO GIGANTES exactly matches old Olivas el Faro supplier invoices; jar weight unknown'),
 ('1e749cc9-93f9-4edd-90db-5f7939df3f06'::uuid,'d3b90c3c-8c0b-407a-b674-5e4a451753d1'::uuid,'kg','DT-MAQ Lavavajillas maquina 6kg previously mapped as 6 ud; old stock represented as packages'),
 ('05cfa2bf-ba1c-49f6-a366-b67157e7b8bd'::uuid,'0c0001ac-d5a7-40a2-847a-0fc705df45ce'::uuid,'kg','TR-FLOR fregasuelos floral previously mapped to Friegasuelos in liters; density unverified');
 SELECT sum(coalesce(stock_current,0)) INTO v_pre_stock FROM public.ingredients;
 SELECT count(*) INTO v_pre_movements FROM public.stock_movements;
 IF (SELECT count(*) FROM merge_candidates) <> 12 THEN RAISE EXCEPTION 'Candidate list incomplete'; END IF;
 FOR r IN SELECT * FROM merge_candidates LOOP
   SELECT * INTO STRICT d FROM public.ingredients WHERE id=r.duplicate FOR UPDATE;
   SELECT * INTO STRICT c FROM public.ingredients WHERE id=r.canonical FOR UPDATE;
   IF d.created_at<'2026-10-01' OR d.archived_at IS NOT NULL OR c.archived_at IS NOT NULL
     OR coalesce(d.stock_current,0)<>0
     OR d.id=c.id
     OR EXISTS(SELECT 1 FROM public.ingredient_consolidation_aliases a WHERE a.duplicate_ingredient_id=d.id)
   THEN
     RAISE EXCEPTION 'Unsafe duplicate candidate %, %, stock %, archived %', d.name, d.id,d.stock_current,d.archived_at;
   END IF;
   -- The SKU itself is proven by the same supplier item name/brand and invoices.
   -- Physical conversion is proven only where both stock base units coincide.
   n_review:=0;
   IF d.base_unit IS DISTINCT FROM c.base_unit THEN
     INSERT INTO public.ingredient_consolidation_conversion_reviews(
       supplier_mapping_id,duplicate_ingredient_id,canonical_ingredient_id,
       supplier_item_name,billed_unit,preferred_invoice_unit,original_purchase_unit,
       canonical_purchase_unit,original_base_unit,canonical_base_unit,reason)
     SELECT m.id,d.id,c.id,m.supplier_item_name,m.line_billing_unit,r.invoice_unit,
       d.purchase_unit,c.purchase_unit,d.base_unit,c.base_unit,
       r.reason||' | Debe verificarse peso, volumen o unidades por envase antes de contabilizar futuras recepciones.'
     FROM public.supplier_item_mappings m WHERE m.ingredient_id=d.id;
     GET DIAGNOSTICS n_review=ROW_COUNT;
     -- Keep supplier raw text for new invoices but remove the unsafe direct conversion.
     UPDATE public.supplier_item_mappings SET ingredient_id=NULL
       WHERE ingredient_id=d.id;
     n_move:=0;
   ELSE
     UPDATE public.supplier_item_mappings SET ingredient_id=c.id
       WHERE ingredient_id=d.id;
     GET DIAGNOSTICS n_move=ROW_COUNT;
   END IF;
   UPDATE public.ingredients SET
     preferred_invoice_unit=r.invoice_unit,inventory_visible=true
     WHERE id=c.id;
   UPDATE public.ingredients SET
     archived_at=now(),inventory_visible=false
     WHERE id=d.id;
   INSERT INTO public.ingredient_consolidation_aliases(
     duplicate_ingredient_id,canonical_ingredient_id,reason,
     baseline_duplicate_stock,baseline_canonical_stock,moved_supplier_mapping_count,
     invoice_unit,conversion_status,mapping_requires_review_count
   ) VALUES(
     d.id,c.id,r.reason,d.stock_current,c.stock_current,n_move,
     r.invoice_unit,
     CASE WHEN d.base_unit=c.base_unit THEN 'resolved' ELSE 'needs_verified_conversion' END,
     n_review
   );
 END LOOP;
 SELECT sum(coalesce(stock_current,0)) INTO v_post_stock FROM public.ingredients;
 SELECT count(*) INTO v_post_movements FROM public.stock_movements;
 IF v_pre_stock IS DISTINCT FROM v_post_stock OR v_pre_movements<>v_post_movements THEN
   RAISE EXCEPTION 'Inventory balance or immutable stock ledger changed: full rollback';
 END IF;
 IF EXISTS(
   SELECT 1 FROM public.supplier_item_mappings m
   JOIN public.ingredient_consolidation_aliases a ON a.duplicate_ingredient_id=m.ingredient_id
 ) THEN
   RAISE EXCEPTION 'Future supplier mapping still points to archived duplicate';
 END IF;
END;
$merge$;
