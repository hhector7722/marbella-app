-- Avoid false-positive invoice closures by buggy legacy paths which only
-- check whether ingredient mappings exist, not whether stock was booked.
-- Scope intentionally limited to the three user-reviewed open invoices.
CREATE OR REPLACE FUNCTION private.guard_verified_unreconciled_invoice_closure_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 incomplete integer;
BEGIN
 IF NEW.id NOT IN(
  '96923f2c-b493-4384-84c3-5108b1e3a98f'::uuid,
  'e65af1cb-dec6-4da6-bd6b-e0b2ae4cc860'::uuid,
  '8045fa1f-4612-46b4-848c-f90471e8eda3'::uuid)
  OR NEW.source<>'email' OR NEW.status<>'mapped'
 THEN RETURN NEW; END IF;

 SELECT count(*) INTO incomplete
 FROM public.purchase_invoice_lines l
 WHERE l.invoice_id=NEW.id AND l.superseded_by_extraction_id IS NULL
 AND (
  l.status NOT IN('mapped','expense_only','excluded')
  OR (l.status='mapped' AND l.mapped_ingredient_id IS NULL)
  OR (l.status='mapped' AND l.mapped_ingredient_id IS NOT NULL AND NOT(
    EXISTS(SELECT 1 FROM public.stock_movements sm
      WHERE sm.movement_type='PURCHASE'
       AND sm.ingredient_id=l.mapped_ingredient_id
       AND (sm.reference_doc='ALB-LINE-'||l.id::text OR (
        sm.reference_type='purchase_invoice_line'::public.stock_reference_type
         AND sm.reference_id=l.id)))
    OR public.purchase_invoice_line_stock_reconciled(l.id,l.mapped_ingredient_id)
  ))
 );
 IF incomplete>0 THEN
  NEW.status:='pending_mapping';
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.guard_verified_unreconciled_invoice_closure_v1()
 FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_verified_unreconciled_invoice_closure ON public.purchase_invoices;
CREATE TRIGGER guard_verified_unreconciled_invoice_closure
BEFORE UPDATE OF status ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION private.guard_verified_unreconciled_invoice_closure_v1();
