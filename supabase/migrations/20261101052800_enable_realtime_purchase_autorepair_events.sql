-- Supabase Realtime: notify the local Marbella auditor when incoming documents,
-- OCR jobs, invoice lines or mapping confirmations change.
-- Idempotent because production publication was already updated in this rollout.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT unnest(ARRAY[
    'purchase_invoices',
    'purchase_invoice_lines',
    'purchase_email_documents',
    'document_processing_jobs',
    'purchase_mapping_versions'
  ]) AS table_name
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = r.table_name
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        r.table_name
      );
    END IF;
  END LOOP;
END $$;
