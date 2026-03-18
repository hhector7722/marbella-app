-- Opcional: permitir un segundo proveedor para ingredientes
ALTER TABLE public.ingredients
ADD COLUMN IF NOT EXISTS supplier_2 character varying(255);

