-- UPDATING TREASURY TRIGGERS TO HANDLE UPDATE/DELETE (EMERGENCY FIX) --

-- 1. Asegurar columna closing_id con ON DELETE CASCADE
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'treasury_log_closing_id_fkey') THEN
        ALTER TABLE public.treasury_log DROP CONSTRAINT treasury_log_closing_id_fkey;
    END IF;
END $$;

ALTER TABLE public.treasury_log ADD COLUMN IF NOT EXISTS closing_id UUID;

ALTER TABLE public.treasury_log 
ADD CONSTRAINT treasury_log_closing_id_fkey 
FOREIGN KEY (closing_id) REFERENCES public.cash_closings(id) ON DELETE CASCADE;

-- 2. Función de Sincronización de Inventario (Robusta)
CREATE OR REPLACE FUNCTION public.fn_sync_box_inventory()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    b_key TEXT;
    b_val INT;
    v_amount_diff NUMERIC := 0;
BEGIN
    -- A. REVERSAR CAMBIOS (UPDATE o DELETE)
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown) LOOP
                IF OLD.type IN ('IN', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
                    -- Restar (incluso si queda negativo)
                    UPDATE cash_box_inventory 
                    SET quantity = quantity - b_val
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                ELSIF OLD.type = 'OUT' THEN
                    -- Sumar
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (OLD.box_id, b_key::numeric, b_val)
                    ON CONFLICT (box_id, denomination) 
                    DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
                END IF;
            END LOOP;
            
            v_amount_diff := CASE WHEN OLD.type = 'OUT' THEN OLD.amount ELSE -OLD.amount END;
            UPDATE cash_boxes SET current_balance = current_balance + v_amount_diff WHERE id = OLD.box_id;

        ELSIF OLD.type = 'SWAP' THEN
            -- Reversar entrada (restar)
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown->'in') LOOP
                UPDATE cash_box_inventory SET quantity = quantity - b_val
                WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
            END LOOP;
            -- Reversar salida (sumar)
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown->'out') LOOP
                INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                VALUES (OLD.box_id, b_key::numeric, b_val)
                ON CONFLICT (box_id, denomination) 
                DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
            END LOOP;
        END IF;
    END IF;

    -- B. APLICAR NUEVOS CAMBIOS (INSERT o UPDATE)
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                IF NEW.type IN ('IN', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (NEW.box_id, b_key::numeric, b_val)
                    ON CONFLICT (box_id, denomination) 
                    DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
                ELSIF NEW.type = 'OUT' THEN
                    -- Bloquear salida si no hay stock (SOLO EN INSERT/UPDATE)
                    IF NOT EXISTS (SELECT 1 FROM cash_box_inventory WHERE box_id = NEW.box_id AND denomination = b_key::numeric AND quantity >= b_val) THEN
                        RAISE EXCEPTION 'Stock insuficiente de %€ en la caja', b_key;
                    END IF;
                    UPDATE cash_box_inventory SET quantity = quantity - b_val
                    WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                END IF;
            END LOOP;
            
            v_amount_diff := CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END;
            UPDATE cash_boxes SET current_balance = current_balance + v_amount_diff WHERE id = NEW.box_id;

        ELSIF NEW.type = 'SWAP' THEN
            -- Aplicar
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'in') LOOP
                INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                VALUES (NEW.box_id, b_key::numeric, b_val)
                ON CONFLICT (box_id, denomination) 
                DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
            END LOOP;
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'out') LOOP
                IF NOT EXISTS (SELECT 1 FROM cash_box_inventory WHERE box_id = NEW.box_id AND denomination = b_key::numeric AND quantity >= b_val) THEN
                    RAISE EXCEPTION 'Stock insuficiente para intercambio';
                END IF;
                UPDATE cash_box_inventory SET quantity = quantity - b_val
                WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
            END LOOP;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_treasury_inventory ON public.treasury_log;
CREATE TRIGGER trg_sync_treasury_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.treasury_log
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_box_inventory();

-- 3. Función de Cierre de Caja (Robusta)
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

DROP TRIGGER IF EXISTS trg_cash_closing_to_treasury ON public.cash_closings;
CREATE TRIGGER trg_cash_closing_to_treasury
AFTER INSERT OR UPDATE OR DELETE ON public.cash_closings
FOR EACH ROW EXECUTE FUNCTION public.fn_on_cash_closing_confirmed();

-- 4. POLÍTICAS RLS TOTALES (REPARACIÓN DE VISIBILIDAD Y BORRADO)
ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_log ENABLE ROW LEVEL SECURITY;

-- SELECT (Si no puedes verlo, no puedes borrarlo)
DROP POLICY IF EXISTS "Allow authenticated select closings" ON public.cash_closings;
CREATE POLICY "Allow authenticated select closings" ON public.cash_closings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated select treasury" ON public.treasury_log;
CREATE POLICY "Allow authenticated select treasury" ON public.treasury_log FOR SELECT TO authenticated USING (true);

-- DELETE / UPDATE para Managers
DROP POLICY IF EXISTS "Managers can delete closings" ON public.cash_closings;
CREATE POLICY "Managers can delete closings" ON public.cash_closings FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Managers can update closings" ON public.cash_closings;
CREATE POLICY "Managers can update closings" ON public.cash_closings FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Managers can delete treasury logs" ON public.treasury_log;
CREATE POLICY "Managers can delete treasury logs" ON public.treasury_log FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Managers can update treasury logs" ON public.treasury_log;
CREATE POLICY "Managers can update treasury logs" ON public.treasury_log FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'));

