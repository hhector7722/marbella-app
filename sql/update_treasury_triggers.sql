-- UPDATING TREASURY TRIGGERS TO HANDLE UPDATE/DELETE --

-- 1. Añadir columna closing_id a treasury_log para vincular cierres
ALTER TABLE public.treasury_log ADD COLUMN IF NOT EXISTS closing_id UUID REFERENCES public.cash_closings(id) ON DELETE CASCADE;

-- 2. Modificar fn_sync_box_inventory para manejar UPDATE y DELETE
CREATE OR REPLACE FUNCTION public.fn_sync_box_inventory()
RETURNS TRIGGER AS $$
DECLARE
    b_key TEXT;
    b_val INT;
    v_amount_diff NUMERIC := 0;
BEGIN
    -- A. REVERSAR CAMBIOS ANTERIORES (si es UPDATE o DELETE)
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
            -- Reversar inventario
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown) LOOP
                IF OLD.type IN ('IN', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
                    -- Era suma, ahora restamos
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity - b_val
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                ELSIF OLD.type = 'OUT' THEN
                    -- Era resta, ahora sumamos
                    INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                    VALUES (OLD.box_id, b_key::numeric, b_val)
                    ON CONFLICT (box_id, denomination) 
                    DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
                END IF;
            END LOOP;
            
            -- Reversar balance total
            v_amount_diff := CASE WHEN OLD.type = 'OUT' THEN OLD.amount ELSE -OLD.amount END;
            UPDATE public.cash_boxes SET current_balance = current_balance + v_amount_diff WHERE id = OLD.box_id;

        ELSIF OLD.type = 'SWAP' THEN
            -- Reversar entrada de swap (restar)
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown->'in') LOOP
                UPDATE public.cash_box_inventory 
                SET quantity = quantity - b_val
                WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
            END LOOP;
            -- Reversar salida de swap (sumar)
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown->'out') LOOP
                INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                VALUES (OLD.box_id, b_key::numeric, b_val)
                ON CONFLICT (box_id, denomination) 
                DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
            END LOOP;
        END IF;
    END IF;

    -- B. APLICAR NUEVOS CAMBIOS (si es INSERT o UPDATE)
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                IF NEW.type IN ('IN', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
                    INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                    VALUES (NEW.box_id, b_key::numeric, b_val)
                    ON CONFLICT (box_id, denomination) 
                    DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
                ELSIF NEW.type = 'OUT' THEN
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity - b_val
                    WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                END IF;
            END LOOP;
            
            v_amount_diff := CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END;
            UPDATE public.cash_boxes SET current_balance = current_balance + v_amount_diff WHERE id = NEW.box_id;

        ELSIF NEW.type = 'SWAP' THEN
            -- Aplicar entrada
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'in') LOOP
                INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                VALUES (NEW.box_id, b_key::numeric, b_val)
                ON CONFLICT (box_id, denomination) 
                DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
            END LOOP;
            -- Aplicar salida
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'out') LOOP
                UPDATE public.cash_box_inventory 
                SET quantity = quantity - b_val
                WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
            END LOOP;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Actualizar el trigger de treasury_log para que se lance en todos los eventos
DROP TRIGGER IF EXISTS trg_sync_treasury_inventory ON public.treasury_log;
CREATE TRIGGER trg_sync_treasury_inventory
AFTER INSERT OR UPDATE OR DELETE ON public.treasury_log
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_box_inventory();

-- 4. Modificar fn_on_cash_closing_confirmed para manejar UPDATE y DELETE
CREATE OR REPLACE FUNCTION public.fn_on_cash_closing_confirmed()
RETURNS TRIGGER AS $$
DECLARE
    v_op_box_id UUID;
BEGIN
    SELECT id INTO v_op_box_id FROM public.cash_boxes WHERE type = 'operational' LIMIT 1;
    
    IF TG_OP = 'INSERT' THEN
        IF v_op_box_id IS NOT NULL AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO public.treasury_log (
                box_id, type, amount, breakdown, user_id, notes, closing_id
            ) VALUES (
                v_op_box_id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 
                'Cierre TPV: ' || NEW.closing_date, NEW.id
            );
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Intentar actualizar registro existente
        UPDATE public.treasury_log 
        SET 
            amount = NEW.cash_withdrawn,
            breakdown = NEW.breakdown,
            notes = 'Cierre TPV: ' || NEW.closing_date || ' (Editado)'
        WHERE closing_id = NEW.id;
        
        -- Si no existe y ahora sí hay retiro, insertar
        IF NOT FOUND AND v_op_box_id IS NOT NULL AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO public.treasury_log (
                box_id, type, amount, breakdown, user_id, notes, closing_id
            ) VALUES (
                v_op_box_id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 
                'Cierre TPV: ' || NEW.closing_date || ' (Editado)', NEW.id
            );
        -- Si existe pero el retiro ahora es 0, borrar
        ELSIF NEW.cash_withdrawn <= 0 THEN
            DELETE FROM public.treasury_log WHERE closing_id = NEW.id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM public.treasury_log WHERE closing_id = OLD.id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Actualizar el trigger de cash_closings para que se lance en todos los eventos
DROP TRIGGER IF EXISTS trg_cash_closing_to_treasury ON public.cash_closings;
CREATE TRIGGER trg_cash_closing_to_treasury
AFTER INSERT OR UPDATE OR DELETE ON public.cash_closings
FOR EACH ROW EXECUTE FUNCTION public.fn_on_cash_closing_confirmed();

-- 6. Vincular registros existentes si es posible
UPDATE public.treasury_log t
SET closing_id = c.id
FROM public.cash_closings c
WHERE (t.notes = 'Cierre TPV: ' || c.closing_date OR t.notes = 'Cierre ' || c.closing_date)
AND t.closing_id IS NULL;
