-- FIX CASH CLOSINGS SCHEMA AND UNIFY TIMESTAMPS --

-- 1. Añadir columna faltante closed_by
ALTER TABLE public.cash_closings ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id);

-- 2. Asegurar que closed_at existe como TIMESTAMP WITH TIME ZONE
-- Si existe closing_datetime, lo renombramos a closed_at si este no existe
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_closings' AND column_name = 'closing_datetime') 
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_closings' AND column_name = 'closed_at') THEN
        ALTER TABLE public.cash_closings RENAME COLUMN closing_datetime TO closed_at;
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cash_closings' AND column_name = 'closed_at') THEN
        ALTER TABLE public.cash_closings ADD COLUMN closed_at TIMESTAMP WITH TIME ZONE DEFAULT now();
    END IF;
END $$;

-- 3. Actualizar la función del trigger para usar los nombres de columna correctos
CREATE OR REPLACE FUNCTION public.fn_on_cash_closing_confirmed()
RETURNS TRIGGER AS $$
DECLARE
    v_op_box_id UUID;
BEGIN
    SELECT id INTO v_op_box_id FROM public.cash_boxes WHERE type = 'operational' LIMIT 1;
    
    IF v_op_box_id IS NOT NULL AND NEW.cash_withdrawn > 0 THEN
        INSERT INTO public.treasury_log (
            box_id,
            type,
            amount,
            breakdown,
            user_id,
            notes
        ) VALUES (
            v_op_box_id,
            'CLOSE_ENTRY',
            NEW.cash_withdrawn,
            NEW.breakdown,
            NEW.closed_by,
            'Cierre TPV: ' || NEW.closing_date
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
