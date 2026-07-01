-- Motor de albaranes cognitivos
-- Respeta esquema físico: suppliers.id BIGINT, ingredients.id UUID
-- RLS estricto en todas las tablas nuevas.

-- 1. Vitaminar tabla existente de proveedores
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS email_domains TEXT[];

-- 2. El Diccionario (Traductor Proveedor -> Ingrediente Interno)
CREATE TABLE public.supplier_item_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id BIGINT REFERENCES public.suppliers(id) ON DELETE CASCADE,
    supplier_item_name TEXT NOT NULL,
    ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE CASCADE,
    conversion_factor NUMERIC(10,4) NOT NULL DEFAULT 1.0000,
    last_known_price NUMERIC(10,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(supplier_id, supplier_item_name)
);

-- 3. Cabecera de Albaranes Recibidos
CREATE TABLE public.purchase_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id BIGINT REFERENCES public.suppliers(id),
    invoice_number TEXT,
    invoice_date DATE,
    total_amount NUMERIC(10,2),
    file_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Líneas del Albarán (Lo que lee la IA crudo)
CREATE TABLE public.purchase_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    quantity NUMERIC(10,3),
    unit_price NUMERIC(10,4),
    total_price NUMERIC(10,2),
    mapped_ingredient_id UUID REFERENCES public.ingredients(id),
    status TEXT DEFAULT 'pending'
);

-- Habilitar RLS
ALTER TABLE public.supplier_item_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_lines ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (Acceso total para autenticados y Service Role)
CREATE POLICY "Enable ALL for authenticated" ON public.supplier_item_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable ALL for service_role" ON public.supplier_item_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable ALL for authenticated" ON public.purchase_invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable ALL for service_role" ON public.purchase_invoices FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable ALL for authenticated" ON public.purchase_invoice_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable ALL for service_role" ON public.purchase_invoice_lines FOR ALL TO service_role USING (true) WITH CHECK (true);
