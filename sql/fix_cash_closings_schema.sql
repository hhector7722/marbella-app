-- =============================================
-- SQL MIGRATION: Aggressive Cash Closings Cleanup
-- Fixes: "null value in column closing_datetime"
-- =============================================

-- 1. Asegurar columna closed_by (puede ser null si el auth falla o es legacy)
ALTER TABLE public.cash_closings ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id);

-- 2. Manejo de closed_at vs closing_datetime
DO $$ 
BEGIN 
    -- Si existe closing_datetime y NO existe closed_at, renombramos
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_closings' AND column_name = 'closing_datetime') 
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_closings' AND column_name = 'closed_at') THEN
        ALTER TABLE public.cash_closings RENAME COLUMN closing_datetime TO closed_at;
    
    -- Si existen AMBOS, migramos datos y borramos el antiguo
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_closings' AND column_name = 'closing_datetime') 
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_closings' AND column_name = 'closed_at') THEN
        UPDATE public.cash_closings SET closed_at = COALESCE(closed_at, closing_datetime);
        ALTER TABLE public.cash_closings DROP COLUMN closing_datetime;
    
    -- Si no existe NINGUNO, lo creamos
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cash_closings' AND column_name = 'closed_at') THEN
        ALTER TABLE public.cash_closings ADD COLUMN closed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL;
    END IF;
END $$;

-- 3. Asegurar que closed_at sea NOT NULL con default
ALTER TABLE public.cash_closings ALTER COLUMN closed_at SET DEFAULT now();
UPDATE public.cash_closings SET closed_at = now() WHERE closed_at IS NULL;
ALTER TABLE public.cash_closings ALTER COLUMN closed_at SET NOT NULL;

-- 4. Eliminar definitivamente closing_datetime si aún existe (por seguridad)
ALTER TABLE public.cash_closings DROP COLUMN IF EXISTS closing_datetime;

-- 5. Actualizar la función del trigger para que sea robusta con el nuevo esquema
CREATE OR REPLACE FUNCTION public.fn_on_cash_closing_confirmed()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_op_box_id UUID;
BEGIN
    SELECT id INTO v_op_box_id FROM cash_boxes WHERE type = 'operational' LIMIT 1;
    
    IF TG_OP = 'INSERT' THEN
        IF v_op_box_id IS NOT NULL AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            VALUES (v_op_box_id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 'Cierre TPV: ' || NEW.closing_date, NEW.id);
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE treasury_log SET amount = NEW.cash_withdrawn, breakdown = NEW.breakdown, notes = 'Cierre TPV: ' || NEW.closing_date || ' (Editado)'
        WHERE closing_id = NEW.id;
        
        IF NOT FOUND AND v_op_box_id IS NOT NULL AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            VALUES (v_op_box_id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 'Cierre TPV: ' || NEW.closing_date || ' (Editado)', NEW.id);
        ELSIF NEW.cash_withdrawn <= 0 THEN
            DELETE FROM treasury_log WHERE closing_id = NEW.id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM treasury_log WHERE closing_id = OLD.id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;
