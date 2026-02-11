-- CONSOLIDACIÓN DE CAJAS (MANTENER SOLO 3) --

-- 1. Eliminar versiones anteriores o con nombres legacy
DELETE FROM public.cash_boxes 
WHERE name IN ('Caja Inicial (Operativa)', 'Caja Cambio 1', 'Caja Cambio 2');

-- 2. Asegurar que solo existen las 3 cajas maestras del protocolo
DELETE FROM public.cash_boxes 
WHERE name NOT IN ('Caja Operativa', 'Cambio 1', 'Cambio 2');

-- 3. Establecer el Fondo Fijo de 300€ para las cajas de Cambio
-- Como este es un cambio de estado inicial, actualizamos current_balance y target_balance
UPDATE public.cash_boxes 
SET current_balance = 300, target_balance = 300 
WHERE name IN ('Cambio 1', 'Cambio 2');

-- 4. Verificación
SELECT * FROM public.cash_boxes ORDER BY type DESC;
