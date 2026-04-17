ALTER TABLE "public"."purchase_invoices"
ADD COLUMN IF NOT EXISTS "source" character varying(50) DEFAULT 'email' NOT NULL;

-- Asegurar que el constraint permita los valores esperados (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'purchase_invoices'
      AND c.conname = 'purchase_invoices_source_check'
  ) THEN
    ALTER TABLE "public"."purchase_invoices"
    ADD CONSTRAINT "purchase_invoices_source_check"
    CHECK ("source" IN ('email', 'scanner', 'manual'));
  END IF;
END $$;

