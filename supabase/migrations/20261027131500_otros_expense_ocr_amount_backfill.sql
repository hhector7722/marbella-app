-- Recover real expense amounts from previously successful OCR for supplier
-- "Otros" without inventing VAT, inventory movements or new invoices.
CREATE OR REPLACE FUNCTION private.ocr_purchase_amount(p_raw text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE v text; c integer; d integer; pos integer; result numeric;
BEGIN
 IF p_raw IS NULL THEN RETURN NULL; END IF;
 v:=regexp_replace(btrim(p_raw),'[€[:space:]]|EUR|euros?','','gi');
 IF v !~ '^[0-9][0-9.,]*$' THEN RETURN NULL; END IF;
 c:=length(v)-length(replace(v,',',''));
 d:=length(v)-length(replace(v,'.',''));
 IF c>0 AND d>0 THEN
   IF strpos(reverse(v),',')<strpos(reverse(v),'.') THEN
     v:=replace(replace(v,'.',''),',','.');
   ELSE v:=replace(v,',',''); END IF;
 ELSIF c>0 THEN
   IF length(split_part(v,',',c+1))<=2 THEN
     v:=replace(replace(v,'.',''),',','.');
   ELSE v:=replace(v,',',''); END IF;
 ELSIF d>0 THEN
   IF length(split_part(v,'.',d+1))=3 AND d=1 THEN
     v:=replace(v,'.','');
   ELSIF d>1 THEN
     pos:=length(v)-strpos(reverse(v),'.')+1;
     IF length(v)-pos<=2 THEN
       v:=replace(left(v,pos-1),'.','')||substring(v from pos);
     ELSE v:=replace(v,'.',''); END IF;
   END IF;
 END IF;
 BEGIN result:=v::numeric; EXCEPTION WHEN others THEN RETURN NULL; END;
 IF result<=0 OR result>1000000 THEN RETURN NULL; END IF;
 RETURN round(result,2);
END;
$fn$;
REVOKE ALL ON FUNCTION private.ocr_purchase_amount(text) FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.otros_expense_backfill_audit(
 invoice_id uuid PRIMARY KEY REFERENCES public.purchase_invoices(id),
 extraction_id uuid NOT NULL REFERENCES public.document_extractions(id),
 amount numeric NOT NULL CHECK(amount>0),
 original_total numeric,
 original_base numeric,
 ocr_gross_raw text,
 tax_unknown boolean NOT NULL,
 filled_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.otros_expense_backfill_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.otros_expense_backfill_audit FROM PUBLIC,anon;
GRANT SELECT ON public.otros_expense_backfill_audit TO authenticated;
CREATE POLICY otros_expense_backfill_admin_read ON public.otros_expense_backfill_audit
 FOR SELECT TO authenticated USING ((select auth.uid()) IS NOT NULL AND public.is_purchase_manager_or_admin());

DO $backfill$
DECLARE r record; gross numeric; base numeric; tax numeric; valid_breakdown boolean;
BEGIN
 FOR r IN
   SELECT i.id,i.total_amount,i.base_amount,i.invoice_date,i.created_at,
     e.id extraction_id,
     e.raw_json_artifact->'canonical'->>'total_raw' gross_raw,
     e.raw_json_artifact->'canonical'->>'subtotal_raw' base_raw,
     e.raw_json_artifact->'canonical'->>'tax_raw' tax_raw
   FROM public.purchase_invoices i
   JOIN public.suppliers s ON s.id=i.supplier_id AND lower(btrim(s.name))='otros'
   JOIN LATERAL (
     SELECT id,raw_json_artifact
     FROM public.document_extractions e
     WHERE e.invoice_id=i.id AND e.status='success'
       AND e.raw_json_artifact ? 'canonical'
     ORDER BY e.extracted_at DESC LIMIT 1
   ) e ON true
   WHERE i.status='mapped'
     AND coalesce(i.total_amount,0)=0
     AND i.duplicate_of_invoice_id IS NULL
 LOOP
   gross:=private.ocr_purchase_amount(r.gross_raw);
   base:=private.ocr_purchase_amount(r.base_raw);
   tax:=private.ocr_purchase_amount(r.tax_raw);
   IF gross IS NULL AND base IS NOT NULL AND tax IS NOT NULL THEN
      gross:=round(base+tax,2);
   END IF;
   IF gross IS NULL THEN CONTINUE; END IF;
   valid_breakdown:=base IS NOT NULL AND tax IS NOT NULL
     AND abs(base+tax-gross)<0.04;
   INSERT INTO public.otros_expense_backfill_audit(
     invoice_id,extraction_id,amount,original_total,original_base,ocr_gross_raw,tax_unknown
   ) VALUES (r.id,r.extraction_id,gross,r.total_amount,r.base_amount,r.gross_raw,NOT valid_breakdown)
   ON CONFLICT(invoice_id) DO NOTHING;
   UPDATE public.purchase_invoices SET
     total_amount=gross,
     base_amount=CASE WHEN valid_breakdown THEN base ELSE gross END,
     tax_amount=CASE WHEN valid_breakdown THEN tax ELSE NULL END,
     tax_rate=CASE WHEN valid_breakdown AND base>0 THEN round(100*tax/base,2) ELSE NULL END,
     invoice_date=coalesce(r.invoice_date,(r.created_at AT TIME ZONE 'Europe/Madrid')::date)
   WHERE id=r.id AND coalesce(total_amount,0)=0 AND status='mapped';
 END LOOP;
END;
$backfill$;
