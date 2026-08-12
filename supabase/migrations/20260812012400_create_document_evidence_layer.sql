-- Migration: Create Document Evidence Layer (Append-Only)

-- 1. Create extraction status enum
CREATE TYPE public.extraction_status AS ENUM ('success', 'failed', 'no_table');

-- 2. Create document_extractions
CREATE TABLE public.document_extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
    file_version_hash TEXT,
    extractor_version TEXT NOT NULL,
    raw_json_artifact JSONB,
    status public.extraction_status NOT NULL DEFAULT 'success',
    extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create document_tables
CREATE TABLE public.document_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_id UUID NOT NULL REFERENCES public.document_extractions(id) ON DELETE RESTRICT,
    table_index INT NOT NULL,
    UNIQUE (extraction_id, table_index)
);

-- 4. Create document_columns
CREATE TABLE public.document_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES public.document_tables(id) ON DELETE RESTRICT,
    col_index INT NOT NULL,
    original_name TEXT,
    UNIQUE (table_id, col_index),
    UNIQUE (id, table_id) -- Required for cross-integrity composite FK
);

-- 5. Create document_rows
CREATE TABLE public.document_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES public.document_tables(id) ON DELETE RESTRICT,
    row_index INT NOT NULL,
    UNIQUE (table_id, row_index),
    UNIQUE (id, table_id) -- Required for cross-integrity composite FK
);

-- 6. Create document_cells
CREATE TABLE public.document_cells (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL,
    row_id UUID NOT NULL,
    column_id UUID NOT NULL,
    raw_value TEXT,
    FOREIGN KEY (row_id, table_id) REFERENCES public.document_rows(id, table_id) ON DELETE RESTRICT,
    FOREIGN KEY (column_id, table_id) REFERENCES public.document_columns(id, table_id) ON DELETE RESTRICT,
    UNIQUE (row_id, column_id)
);

-- 7. Create purchase_line_provenance (Linkage)
CREATE TABLE public.purchase_line_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_line_id UUID NOT NULL REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
    document_row_id UUID NOT NULL REFERENCES public.document_rows(id) ON DELETE RESTRICT,
    supersedes_id UUID UNIQUE,
    linked_by TEXT,
    confidence_score NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, invoice_line_id),
    FOREIGN KEY (supersedes_id, invoice_line_id) REFERENCES public.purchase_line_provenance(id, invoice_line_id) ON DELETE RESTRICT,
    CONSTRAINT prevent_self_supersede CHECK (supersedes_id != id)
);

-- 8. Enable Row Level Security
ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_line_provenance ENABLE ROW LEVEL SECURITY;

-- 9. Strict RLS Policies (Defense in depth: ONLY Insert and Select)
CREATE POLICY "Authenticated select access" ON public.document_extractions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert access" ON public.document_extractions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated select access" ON public.document_tables FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert access" ON public.document_tables FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated select access" ON public.document_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert access" ON public.document_columns FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated select access" ON public.document_rows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert access" ON public.document_rows FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated select access" ON public.document_cells FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert access" ON public.document_cells FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated select access" ON public.purchase_line_provenance FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert access" ON public.purchase_line_provenance FOR INSERT TO authenticated WITH CHECK (true);

-- 10. Triggers to enforce absolute Immutability (Append-Only)
CREATE OR REPLACE FUNCTION public.prevent_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Mutation Error: Updates and Deletes are strictly forbidden on this append-only evidence table (%).', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_immutability_document_extractions
BEFORE UPDATE OR DELETE ON public.document_extractions
FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

CREATE TRIGGER enforce_immutability_document_tables
BEFORE UPDATE OR DELETE ON public.document_tables
FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

CREATE TRIGGER enforce_immutability_document_columns
BEFORE UPDATE OR DELETE ON public.document_columns
FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

CREATE TRIGGER enforce_immutability_document_rows
BEFORE UPDATE OR DELETE ON public.document_rows
FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

CREATE TRIGGER enforce_immutability_document_cells
BEFORE UPDATE OR DELETE ON public.document_cells
FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();

CREATE TRIGGER enforce_immutability_purchase_line_provenance
BEFORE UPDATE OR DELETE ON public.purchase_line_provenance
FOR EACH ROW EXECUTE FUNCTION public.prevent_evidence_mutation();
