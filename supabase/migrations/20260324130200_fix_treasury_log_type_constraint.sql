-- Actualizar restricción de tipo para permitir 'EXCHANGE'
ALTER TABLE public.treasury_log 
DROP CONSTRAINT IF EXISTS treasury_log_type_check;

ALTER TABLE public.treasury_log 
ADD CONSTRAINT treasury_log_type_check 
CHECK (type IN ('IN', 'OUT', 'SWAP', 'CLOSE_ENTRY', 'ADJUSTMENT', 'EXCHANGE'));
