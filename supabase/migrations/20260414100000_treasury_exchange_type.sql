-- =============================================
-- Tipo EXCHANGE: intercambio entre cajas (no es movimiento, no modifica saldo)
-- Solo actualiza cash_box_inventory. No debe aparecer en /dashboard/movements.
-- =============================================

-- 1. Columnas para intercambios: destino y agrupación
ALTER TABLE public.treasury_log
ADD COLUMN IF NOT EXISTS to_box_id UUID REFERENCES public.cash_boxes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS exchange_group_id UUID;

-- 2. Trigger: soporte EXCHANGE (restar de box_id, sumar a to_box_id; no tocar current_balance)
CREATE OR REPLACE FUNCTION public.fn_sync_box_inventory_v3()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    b_key TEXT;
    b_val INT;
BEGIN
    -- [A] REVERSAR IMPACTO ANTERIOR (Update o Delete)
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
            IF OLD.breakdown IS NOT NULL AND OLD.breakdown != '{}'::jsonb THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown) LOOP
                    IF OLD.type IN ('IN', 'CLOSE_ENTRY') THEN
                        UPDATE cash_box_inventory SET quantity = quantity - b_val
                        WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                    ELSE
                        UPDATE cash_box_inventory SET quantity = quantity + b_val
                        WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                    END IF;
                END LOOP;
            END IF;
            UPDATE cash_boxes SET current_balance = current_balance + (CASE WHEN OLD.type = 'OUT' THEN OLD.amount ELSE -OLD.amount END)
            WHERE id = OLD.box_id;

        ELSIF OLD.type = 'SWAP' THEN
            IF OLD.breakdown IS NOT NULL AND OLD.breakdown ? 'out' THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown->'out') LOOP
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (OLD.box_id, b_key::numeric, b_val::int)
                    ON CONFLICT (box_id, denomination)
                    DO UPDATE SET quantity = cash_box_inventory.quantity + b_val::int;
                END LOOP;
            END IF;
            IF OLD.breakdown IS NOT NULL AND OLD.breakdown ? 'in' THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown->'in') LOOP
                    UPDATE cash_box_inventory SET quantity = quantity - b_val::int
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                END LOOP;
            END IF;

        ELSIF OLD.type = 'EXCHANGE' THEN
            IF OLD.breakdown IS NOT NULL AND OLD.breakdown != '{}'::jsonb AND OLD.to_box_id IS NOT NULL THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown) LOOP
                    UPDATE cash_box_inventory SET quantity = quantity + b_val::int
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                    UPDATE cash_box_inventory SET quantity = quantity - b_val::int
                    WHERE box_id = OLD.to_box_id AND denomination = b_key::numeric;
                END LOOP;
            END IF;
        ELSIF OLD.type = 'ADJUSTMENT' THEN
            NULL;
        END IF;
    END IF;

    -- [B] APLICAR NUEVO IMPACTO (Insert o Update)
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
            IF NEW.breakdown IS NOT NULL AND NEW.breakdown != '{}'::jsonb THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                    IF NEW.type IN ('IN', 'CLOSE_ENTRY') THEN
                        INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                        VALUES (NEW.box_id, b_key::numeric, b_val)
                        ON CONFLICT (box_id, denomination)
                        DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
                    ELSIF NEW.type = 'OUT' THEN
                        UPDATE cash_box_inventory SET quantity = quantity - b_val
                        WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                    END IF;
                END LOOP;
            END IF;
            UPDATE cash_boxes SET current_balance = current_balance + (CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END)
            WHERE id = NEW.box_id;

        ELSIF NEW.type = 'SWAP' THEN
            IF NEW.breakdown IS NOT NULL AND NEW.breakdown ? 'out' THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'out') LOOP
                    UPDATE cash_box_inventory SET quantity = quantity - b_val::int
                    WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                END LOOP;
            END IF;
            IF NEW.breakdown IS NOT NULL AND NEW.breakdown ? 'in' THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'in') LOOP
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (NEW.box_id, b_key::numeric, b_val::int)
                    ON CONFLICT (box_id, denomination)
                    DO UPDATE SET quantity = cash_box_inventory.quantity + b_val::int;
                END LOOP;
            END IF;

        ELSIF NEW.type = 'EXCHANGE' THEN
            IF NEW.breakdown IS NOT NULL AND NEW.breakdown != '{}'::jsonb AND NEW.to_box_id IS NOT NULL THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                    UPDATE cash_box_inventory SET quantity = quantity - b_val::int
                    WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (NEW.to_box_id, b_key::numeric, b_val::int)
                    ON CONFLICT (box_id, denomination)
                    DO UPDATE SET quantity = cash_box_inventory.quantity + b_val::int;
                END LOOP;
            END IF;
            -- EXCHANGE no modifica current_balance

        ELSIF NEW.type = 'ADJUSTMENT' THEN
            IF NEW.breakdown IS NOT NULL AND NEW.breakdown != '{}'::jsonb THEN
                DELETE FROM cash_box_inventory WHERE box_id = NEW.box_id;
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                    IF b_val::int > 0 THEN
                        INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                        VALUES (NEW.box_id, b_key::numeric, b_val::int);
                    END IF;
                END LOOP;
            END IF;
            UPDATE cash_boxes SET current_balance = NEW.amount WHERE id = NEW.box_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- La vista v_treasury_movements_balance ya excluye EXCHANGE (solo incluye IN, OUT, CLOSE_ENTRY, ADJUSTMENT, SWAP)
-- por tanto los intercambios NUNCA aparecerán en /dashboard/movements.
