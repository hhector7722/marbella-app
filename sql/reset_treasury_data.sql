-- =============================================
-- RESET TOTAL DE TESORERÍA - BAR LA MARBELLA
-- ADVERTENCIA: Esta operación ELIMINA todos los registros.
-- =============================================

BEGIN;

-- 1. Desactivar solo disparadores de USUARIO (para evitar recursión innecesaria)
-- Nota: Usamos USER en lugar de ALL para evitar tocar disparadores de sistema (FKs).
ALTER TABLE public.treasury_log DISABLE TRIGGER USER;
ALTER TABLE public.cash_closings DISABLE TRIGGER USER;

-- 2. Limpiar tablas de hechos y logs
-- TRUNCATE es más rápido y limpia los IDs si se desea (RESTART IDENTITY)
TRUNCATE TABLE public.treasury_log CASCADE;
TRUNCATE TABLE public.cash_box_inventory CASCADE;
TRUNCATE TABLE public.cash_closings CASCADE;

-- 3. Resetear balances en cash_boxes
UPDATE public.cash_boxes SET current_balance = 0;

-- 4. Reactivar disparadores
ALTER TABLE public.treasury_log ENABLE TRIGGER USER;
ALTER TABLE public.cash_closings ENABLE TRIGGER USER;

COMMIT;

-- NOTA: Tras ejecutar esto, la caja estará a 0.00€. 
-- Realiza un "ARQUEO" inicial para el fondo de caja.
