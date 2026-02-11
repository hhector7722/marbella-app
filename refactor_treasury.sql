-- REFACTORIZACIÓN RADICAL DE TESORERÍA --

-- 1. LIMPIEZA DE TABLAS LEGACY
DROP TABLE IF EXISTS public.cash_registers CASCADE;
DROP TABLE IF EXISTS public.cash_counts CASCADE;
DROP TABLE IF EXISTS public.cash_ledger CASCADE;
DROP TABLE IF EXISTS public.cash_movements CASCADE;
DROP TABLE IF EXISTS public.treasury_movements CASCADE;

-- 2. AJUSTES EN TABLAS EXISTENTES
ALTER TABLE public.cash_closings ADD COLUMN IF NOT EXISTS breakdown JSONB DEFAULT '{}'::jsonb;

-- Asegurar que cash_boxes tenga una restricción única en 'name' para el ON CONFLICT
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_boxes_name_key') THEN
        ALTER TABLE public.cash_boxes ADD CONSTRAINT cash_boxes_name_key UNIQUE (name);
    END IF;
END $$;

-- Asegurar que cash_box_inventory tenga la restricción única compuesta
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_box_inventory_box_id_denomination_key') THEN
        ALTER TABLE public.cash_box_inventory ADD CONSTRAINT cash_box_inventory_box_id_denomination_key UNIQUE (box_id, denomination);
    END IF;
END $$;

-- 3. NUEVA TABLA UNIFICADA: treasury_log
CREATE TABLE IF NOT EXISTS public.treasury_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    box_id UUID REFERENCES public.cash_boxes(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'SWAP', 'CLOSE_ENTRY', 'ADJUSTMENT')),
    amount NUMERIC NOT NULL DEFAULT 0,
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    user_id UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.treasury_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated users to read treasury logs" ON public.treasury_log;
CREATE POLICY "Allow authenticated users to read treasury logs" ON public.treasury_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Allow authenticated users to insert treasury logs" ON public.treasury_log;
CREATE POLICY "Allow authenticated users to insert treasury logs" ON public.treasury_log FOR INSERT TO authenticated WITH CHECK (true);

-- 4. FUNCIONES DE AUTOMATIZACIÓN (PL/pgSQL)

-- Función 1: Sincronización de Inventario y Balance
CREATE OR REPLACE FUNCTION public.fn_sync_box_inventory()
RETURNS TRIGGER AS $$
DECLARE
    b_key TEXT;
    b_val INT;
    v_amount NUMERIC := 0;
BEGIN
    IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
        FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
            IF NEW.type IN ('IN', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
                INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                VALUES (NEW.box_id, b_key::numeric, b_val)
                ON CONFLICT (box_id, denomination) 
                DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
            ELSIF NEW.type = 'OUT' THEN
                IF NOT EXISTS (SELECT 1 FROM public.cash_box_inventory WHERE box_id = NEW.box_id AND denomination = b_key::numeric AND quantity >= b_val) THEN
                    RAISE EXCEPTION 'Stock insuficiente de %€ en la caja', b_key;
                END IF;

                UPDATE public.cash_box_inventory 
                SET quantity = quantity - b_val
                WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
            END IF;
        END LOOP;
        
        v_amount := CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END;
        UPDATE public.cash_boxes SET current_balance = current_balance + v_amount WHERE id = NEW.box_id;

    ELSIF NEW.type = 'SWAP' THEN
        -- Procesar ENTRADA (in)
        FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'in') LOOP
            INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
            VALUES (NEW.box_id, b_key::numeric, b_val)
            ON CONFLICT (box_id, denomination) 
            DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
        END LOOP;
        
        -- Procesar SALIDA (out)
        FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'out') LOOP
            IF NOT EXISTS (SELECT 1 FROM public.cash_box_inventory WHERE box_id = NEW.box_id AND denomination = b_key::numeric AND quantity >= b_val) THEN
                RAISE EXCEPTION 'Stock insuficiente de %€ para el intercambio', b_key;
            END IF;

            UPDATE public.cash_box_inventory 
            SET quantity = quantity - b_val
            WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_treasury_inventory ON public.treasury_log;
CREATE TRIGGER trg_sync_treasury_inventory
AFTER INSERT ON public.treasury_log
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_box_inventory();

-- Función 2: Cierre automático -> Treasury Log
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

DROP TRIGGER IF EXISTS trg_cash_closing_to_treasury ON public.cash_closings;
CREATE TRIGGER trg_cash_closing_to_treasury
AFTER INSERT ON public.cash_closings
FOR EACH ROW EXECUTE FUNCTION public.fn_on_cash_closing_confirmed();

-- 5. DATOS SEMILLA (BOXES)
-- Nota: Usamos ON CONFLICT (name) DO NOTHING tras asegurar que la restricción UNIQUE existe.
INSERT INTO public.cash_boxes (name, type, target_balance)
VALUES 
('Caja Operativa', 'operational', 0),
('Cambio 1', 'change', 300),
('Cambio 2', 'change', 300)
ON CONFLICT (name) DO NOTHING;
