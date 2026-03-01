-- =============================================
-- SQL FIX: Allow Cash Box Read Access (RLS)
-- =============================================

-- 1. CASH_BOXES POLICIES
-- ----------------------
ALTER TABLE public.cash_boxes ENABLE ROW LEVEL SECURITY;

-- Permite que todos los usuarios autenticados vean las cajas disponibles
DROP POLICY IF EXISTS "Allow authenticated users to read cash boxes" ON public.cash_boxes;
CREATE POLICY "Allow authenticated users to read cash boxes" 
ON public.cash_boxes FOR SELECT 
TO authenticated 
USING (true);

-- 2. CASH_BOX_INVENTORY POLICIES
-- ------------------------------
ALTER TABLE public.cash_box_inventory ENABLE ROW LEVEL SECURITY;

-- Permite que todos los usuarios autenticados vean el inventario de las cajas
DROP POLICY IF EXISTS "Allow authenticated read on cash_box_inventory" ON public.cash_box_inventory;
CREATE POLICY "Allow authenticated read on cash_box_inventory" 
ON public.cash_box_inventory 
FOR SELECT 
TO authenticated 
USING (true);

-- 3. VERIFICACIÓN DE TREASURY_LOG (Opcional, asegurar que pueden insertar compras)
-- ----------------------------------------------------------------------------
-- Ya existe en refactor_treasury.sql, pero lo reforzamos si fuera necesario
-- DROP POLICY IF EXISTS "Allow authenticated users to insert treasury logs" ON public.treasury_log;
-- CREATE POLICY "Allow authenticated users to insert treasury logs" ON public.treasury_log FOR INSERT TO authenticated WITH CHECK (true);
