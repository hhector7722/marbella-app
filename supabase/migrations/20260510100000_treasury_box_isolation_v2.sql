-- =============================================
-- FIX: Islar movimientos por caja y soportar EXCHANGE
-- 1. Trigger: Actualizar balances de AMBAS cajas en un EXCHANGE
-- 2. Vista: Particionar running_balance por box_id y aplanar EXCHANGE
-- =============================================

-- 1. Actualizar Trigger para soportar EXCHANGE
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
            -- Balance: Revertir
            UPDATE cash_boxes SET current_balance = current_balance + (CASE WHEN OLD.type = 'OUT' THEN OLD.amount ELSE -OLD.amount END)
            WHERE id = OLD.box_id;
            
            -- Inventario
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

        ELSIF OLD.type = 'EXCHANGE' THEN
            -- Revertir EXCHANGE: el que envió recupera dinero, el que recibió lo pierde
            UPDATE cash_boxes SET current_balance = current_balance + OLD.amount WHERE id = OLD.box_id;
            IF OLD.to_box_id IS NOT NULL THEN
                UPDATE cash_boxes SET current_balance = current_balance - OLD.amount WHERE id = OLD.to_box_id;
            END IF;

            -- Inventario Origen (recupera lo enviado)
            IF OLD.breakdown IS NOT NULL AND OLD.breakdown != '{}'::jsonb THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown) LOOP
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (OLD.box_id, b_key::numeric, b_val)
                    ON CONFLICT (box_id, denomination) DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
                    
                    -- Inventario Destino (pierde lo recibido)
                    IF OLD.to_box_id IS NOT NULL THEN
                        UPDATE cash_box_inventory SET quantity = quantity - b_val
                        WHERE box_id = OLD.to_box_id AND denomination = b_key::numeric;
                    END IF;
                END LOOP;
            END IF;

        ELSIF OLD.type = 'SWAP' THEN
            -- Reversar SWAP (interno de la misma caja)
            IF OLD.breakdown IS NOT NULL AND OLD.breakdown ? 'out' THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown->'out') LOOP
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (OLD.box_id, b_key::numeric, b_val::int)
                    ON CONFLICT (box_id, denomination) DO UPDATE SET quantity = cash_box_inventory.quantity + b_val::int;
                END LOOP;
            END IF;
            IF OLD.breakdown IS NOT NULL AND OLD.breakdown ? 'in' THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown->'in') LOOP
                    UPDATE cash_box_inventory SET quantity = quantity - b_val::int
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                END LOOP;
            END IF;
        ELSIF OLD.type = 'ADJUSTMENT' THEN
            NULL;
        END IF;
    END IF;

    -- [B] APLICAR NUEVO IMPACTO (Insert o Update)
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
            -- Balance: Aplicar
            UPDATE cash_boxes SET current_balance = current_balance + (CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END)
            WHERE id = NEW.box_id;

            -- Inventario
            IF NEW.breakdown IS NOT NULL AND NEW.breakdown != '{}'::jsonb THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                    IF NEW.type IN ('IN', 'CLOSE_ENTRY') THEN
                        INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                        VALUES (NEW.box_id, b_key::numeric, b_val)
                        ON CONFLICT (box_id, denomination) DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
                    ELSIF NEW.type = 'OUT' THEN
                        UPDATE cash_box_inventory SET quantity = quantity - b_val
                        WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                    END IF;
                END LOOP;
            END IF;

        ELSIF NEW.type = 'EXCHANGE' THEN
            -- Aplicar EXCHANGE: el que envía pierde dinero, el que recibe lo gana
            UPDATE cash_boxes SET current_balance = current_balance - NEW.amount WHERE id = NEW.box_id;
            IF NEW.to_box_id IS NOT NULL THEN
                UPDATE cash_boxes SET current_balance = current_balance + NEW.amount WHERE id = NEW.to_box_id;
            END IF;

            -- Inventario Origen (pierde lo enviado)
            IF NEW.breakdown IS NOT NULL AND NEW.breakdown != '{}'::jsonb THEN
                FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                    UPDATE cash_box_inventory SET quantity = quantity - b_val
                    WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                    
                    -- Inventario Destino (gana lo recibido)
                    IF NEW.to_box_id IS NOT NULL THEN
                        INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                        VALUES (NEW.to_box_id, b_key::numeric, b_val)
                        ON CONFLICT (box_id, denomination) DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
                    END IF;
                END LOOP;
            END IF;

        ELSIF NEW.type = 'SWAP' THEN
            -- SWAP (interno)
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
                    ON CONFLICT (box_id, denomination) DO UPDATE SET quantity = cash_box_inventory.quantity + b_val::int;
                END LOOP;
            END IF;
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

-- 2. Re-crear Vista con Particionamiento por Caja y Aplanamiento de EXCHANGE
DROP VIEW IF EXISTS public.v_treasury_movements_balance;

CREATE VIEW public.v_treasury_movements_balance AS
WITH flattened_moves AS (
    -- Movimientos normales (IN, OUT, CLOSE_ENTRY, ADJUSTMENT)
    SELECT 
        id, box_id, type, amount, breakdown, notes, created_at, user_id, closing_id, to_box_id,
        (CASE 
            WHEN type IN ('IN', 'CLOSE_ENTRY') THEN amount 
            WHEN type = 'OUT' THEN -amount 
            ELSE 0 
        END) as signed_amount
    FROM public.treasury_log
    WHERE type != 'EXCHANGE' AND type != 'SWAP'
    
    UNION ALL
    
    -- EXCHANGE Leg 1: Salida de la caja origen
    SELECT 
        id, box_id, 'EXCHANGE' as type, amount, breakdown, notes, created_at, user_id, closing_id, to_box_id,
        -amount as signed_amount
    FROM public.treasury_log
    WHERE type = 'EXCHANGE'
    
    UNION ALL
    
    -- EXCHANGE Leg 2: Entrada en la caja destino
    SELECT 
        id, to_box_id as box_id, 'EXCHANGE' as type, amount, breakdown, notes, created_at, user_id, closing_id, box_id as to_box_id,
        amount as signed_amount
    FROM public.treasury_log
    WHERE type = 'EXCHANGE' AND to_box_id IS NOT NULL
)
SELECT
    id,
    box_id,
    type,
    amount,
    breakdown,
    notes,
    created_at,
    user_id,
    closing_id,
    to_box_id,
    SUM(signed_amount) OVER (PARTITION BY box_id ORDER BY created_at, id ROWS UNBOUNDED PRECEDING) AS running_balance
FROM flattened_moves;

-- 3. Recalcular balances de cash_boxes basados en el historial (Opcional pero recomendado para consistencia)
-- UPDATE cash_boxes cb
-- SET current_balance = COALESCE((
--     SELECT running_balance 
--     FROM v_treasury_movements_balance v 
--     WHERE v.box_id = cb.id 
--     ORDER BY created_at DESC, id DESC 
--     LIMIT 1
-- ), 0);
