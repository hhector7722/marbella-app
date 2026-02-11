-- REFINAMIENTO DE LÓGICA DE ARQUEO (ADJUSTMENT) --

CREATE OR REPLACE FUNCTION public.fn_sync_box_inventory()
RETURNS TRIGGER AS $$
DECLARE
    b_key TEXT;
    b_val INT;
    v_amount NUMERIC := 0;
BEGIN
    -- Caso 1: IN, OUT, CLOSE_ENTRY
    -- Estos tipos suman o restan del inventario actual
    IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
        FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
            IF NEW.type IN ('IN', 'CLOSE_ENTRY') THEN
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

    -- Caso 2: ADJUSTMENT (Arqueo Manual)
    -- SOBREESCRIBE el inventario y el balance global con lo contado
    ELSIF NEW.type = 'ADJUSTMENT' THEN
        -- 1. Limpiar inventario previo de esta caja
        DELETE FROM public.cash_box_inventory WHERE box_id = NEW.box_id;
        
        -- 2. Insertar nuevo desglose
        FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
            IF b_val > 0 THEN
                INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                VALUES (NEW.box_id, b_key::numeric, b_val);
            END IF;
        END LOOP;
        
        -- 3. Fijar balance global exactamente al monto del ajuste
        UPDATE public.cash_boxes SET current_balance = NEW.amount WHERE id = NEW.box_id;

    -- Caso 3: SWAP (Intercambio de denominaciones)
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
