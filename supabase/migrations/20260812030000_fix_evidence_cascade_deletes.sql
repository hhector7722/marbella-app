-- Migration: Fix Evidence Cascade Deletes
-- Permite que el borrado de un albarán propague la eliminación de su evidencia
-- manteniendo la inmutabilidad de la evidencia contra borrados directos.

BEGIN;

-- 1. Update the generic trigger function to permit cascading deletes.
CREATE OR REPLACE FUNCTION public.prevent_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        -- Allow cascaded deletes (trigger depth > 1 means it's fired from another trigger, like a foreign key cascade)
        IF pg_trigger_depth() > 1 THEN
            RETURN OLD;
        END IF;
    END IF;
    RAISE EXCEPTION 'Mutation Error: Updates and Deletes are strictly forbidden on this append-only evidence table (%).', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

-- 2. Modify foreign keys to CASCADE from invoice down to cells
ALTER TABLE public.document_extractions 
  DROP CONSTRAINT IF EXISTS document_extractions_invoice_id_fkey,
  ADD CONSTRAINT document_extractions_invoice_id_fkey 
    FOREIGN KEY (invoice_id) REFERENCES public.purchase_invoices(id) ON DELETE CASCADE;

ALTER TABLE public.document_tables 
  DROP CONSTRAINT IF EXISTS document_tables_extraction_id_fkey,
  ADD CONSTRAINT document_tables_extraction_id_fkey 
    FOREIGN KEY (extraction_id) REFERENCES public.document_extractions(id) ON DELETE CASCADE;

ALTER TABLE public.document_columns 
  DROP CONSTRAINT IF EXISTS document_columns_table_id_fkey,
  ADD CONSTRAINT document_columns_table_id_fkey 
    FOREIGN KEY (table_id) REFERENCES public.document_tables(id) ON DELETE CASCADE;

ALTER TABLE public.document_rows 
  DROP CONSTRAINT IF EXISTS document_rows_table_id_fkey,
  ADD CONSTRAINT document_rows_table_id_fkey 
    FOREIGN KEY (table_id) REFERENCES public.document_tables(id) ON DELETE CASCADE;

ALTER TABLE public.document_cells 
  DROP CONSTRAINT IF EXISTS document_cells_row_id_table_id_fkey,
  ADD CONSTRAINT document_cells_row_id_table_id_fkey 
    FOREIGN KEY (row_id, table_id) REFERENCES public.document_rows(id, table_id) ON DELETE CASCADE;

ALTER TABLE public.document_cells 
  DROP CONSTRAINT IF EXISTS document_cells_column_id_table_id_fkey,
  ADD CONSTRAINT document_cells_column_id_table_id_fkey 
    FOREIGN KEY (column_id, table_id) REFERENCES public.document_columns(id, table_id) ON DELETE CASCADE;

-- 3. Modify provenance foreign keys to CASCADE from operational lines and document rows
ALTER TABLE public.purchase_line_provenance 
  DROP CONSTRAINT IF EXISTS purchase_line_provenance_invoice_line_id_fkey,
  ADD CONSTRAINT purchase_line_provenance_invoice_line_id_fkey 
    FOREIGN KEY (invoice_line_id) REFERENCES public.purchase_invoice_lines(id) ON DELETE CASCADE;

ALTER TABLE public.purchase_line_provenance 
  DROP CONSTRAINT IF EXISTS purchase_line_provenance_document_row_id_fkey,
  ADD CONSTRAINT purchase_line_provenance_document_row_id_fkey 
    FOREIGN KEY (document_row_id) REFERENCES public.document_rows(id) ON DELETE CASCADE;

COMMIT;
