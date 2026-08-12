DO $ddl$
BEGIN
  -- Change triggers to log depth instead of raising
  CREATE OR REPLACE FUNCTION public.prevent_evidence_mutation()
  RETURNS TRIGGER AS $$
  BEGIN
      IF TG_OP = 'DELETE' THEN
          RAISE NOTICE 'DELETE on % at pg_trigger_depth = %', TG_TABLE_NAME, pg_trigger_depth();
          RETURN OLD;
      END IF;
      RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- Update just one FK to test
  ALTER TABLE public.document_extractions 
    DROP CONSTRAINT IF EXISTS document_extractions_invoice_id_fkey,
    ADD CONSTRAINT document_extractions_invoice_id_fkey 
      FOREIGN KEY (invoice_id) REFERENCES public.purchase_invoices(id) ON DELETE CASCADE;
      
END;
$ddl$;
