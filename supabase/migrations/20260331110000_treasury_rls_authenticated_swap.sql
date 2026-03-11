-- =============================================
-- RLS Tesorería: cualquier usuario autenticado puede realizar
-- la acción "Cambiar" (SWAP) en Caja cambio 1/2: leer cajas e inventario e insertar en treasury_log.
-- =============================================

-- Habilitar RLS en tablas de tesorería (idempotente si ya está activo)
ALTER TABLE public.treasury_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_box_inventory ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- treasury_log: cualquier autenticado puede SELECT e INSERT (SWAP, IN, OUT desde staff/admin)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can select treasury_log" ON public.treasury_log;
CREATE POLICY "Authenticated can select treasury_log"
    ON public.treasury_log FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Authenticated can insert treasury_log" ON public.treasury_log;
CREATE POLICY "Authenticated can insert treasury_log"
    ON public.treasury_log FOR INSERT TO authenticated
    WITH CHECK (true);

-- Managers pueden UPDATE/DELETE (edición/borrado de movimientos en /movements)
DROP POLICY IF EXISTS "Managers can update delete treasury_log" ON public.treasury_log;
CREATE POLICY "Managers can update delete treasury_log"
    ON public.treasury_log FOR ALL TO authenticated
    USING (public.is_manager_or_admin())
    WITH CHECK (public.is_manager_or_admin());

-- ------------------------------------------------------------------------------
-- cash_boxes: cualquier autenticado puede leer (listar cajas y abrir modal Cambiar)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can select cash_boxes" ON public.cash_boxes;
CREATE POLICY "Authenticated can select cash_boxes"
    ON public.cash_boxes FOR SELECT TO authenticated
    USING (true);

-- ------------------------------------------------------------------------------
-- cash_box_inventory: cualquier autenticado puede leer (stock en modal Cambiar/Arqueo)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can select cash_box_inventory" ON public.cash_box_inventory;
CREATE POLICY "Authenticated can select cash_box_inventory"
    ON public.cash_box_inventory FOR SELECT TO authenticated
    USING (true);
