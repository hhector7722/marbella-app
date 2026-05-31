-- Cabecera del albarán: base imponible, IVA y tipo impositivo
ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS base_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,4);

-- Líneas del albarán: tipo IVA y precio unitario sin IVA
ALTER TABLE public.purchase_invoice_lines
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5,4),
  ADD COLUMN IF NOT EXISTS base_price numeric(12,4);
