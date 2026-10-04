-- La auditoría económica no puede corregirse después de la confirmación.
CREATE TRIGGER purchase_receipt_automation_audit_append_only
  BEFORE UPDATE OR DELETE ON private.purchase_receipt_automation_audit
  FOR EACH ROW EXECUTE FUNCTION public.prevent_k2_append_only_mutation();
