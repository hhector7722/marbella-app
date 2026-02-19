-- =============================================
-- REPARACIÓN DEFINITIVA DE TESORERÍA (V3)
-- Solución a la invisibilidad de Arqueos y Errores de Balance
-- =============================================

BEGIN;

-- 1. Limpiar triggers obsoletos
DROP TRIGGER IF EXISTS trg_sync_treasury_inventory_v2 ON public.treasury_log;
DROP TRIGGER IF EXISTS trg_sync_treasury_inventory ON public.treasury_log;

-- 2. Nueva Función de Sincronización Blindada
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
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown) LOOP
                IF OLD.type IN ('IN', 'CLOSE_ENTRY') THEN
                    UPDATE cash_box_inventory SET quantity = quantity - b_val
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                ELSE -- OUT
                    UPDATE cash_box_inventory SET quantity = quantity + b_val
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                END IF;
            END LOOP;
            
            -- Reversar balance: Operación contraria
            UPDATE cash_boxes SET current_balance = current_balance + (CASE WHEN OLD.type = 'OUT' THEN OLD.amount ELSE -OLD.amount END)
            WHERE id = OLD.box_id;
            
        ELSIF OLD.type = 'ADJUSTMENT' THEN
            -- Al borrar un arqueo, no hay un "estado anterior" guardado, por lo que el balance se queda donde está.
            -- Esto permite borrar arqueos basura sin romper el saldo actual.
            NULL;
        END IF;
    END IF;

    -- [B] APLICAR NUEVO IMPACTO (Insert o Update)
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
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
            
            -- Aplicar balance
            UPDATE cash_boxes SET current_balance = current_balance + (CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END)
            WHERE id = NEW.box_id;
            
        ELSIF NEW.type = 'ADJUSTMENT' THEN
            -- EL ARQUEO ES LEY FÍSICA: Sobreescribe todo.
            -- 1. Limpiar inventario
            DELETE FROM cash_box_inventory WHERE box_id = NEW.box_id;
            
            -- 2. Insertar nuevo conteo
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                IF b_val::int > 0 THEN
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (NEW.box_id, b_key::numeric, b_val::int);
                END IF;
            END LOOP;
            
            -- 3. FIJAR BALANCE ABSOLUTO
            UPDATE cash_boxes SET current_balance = NEW.amount WHERE id = NEW.box_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Activar Trigger V3
CREATE TRIGGER trg_sync_treasury_inventory_v3
AFTER INSERT OR UPDATE OR DELETE ON public.treasury_log
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_box_inventory_v3();

-- 4. RPC para Saldo Teórico Blindado (SUMA IN - SUMA OUT)
CREATE OR REPLACE FUNCTION public.get_theoretical_balance(target_date TIMESTAMPTZ)
RETURNS NUMERIC 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN COALESCE((
        SELECT SUM(CASE WHEN type IN ('IN', 'CLOSE_ENTRY') THEN amount ELSE -amount END)
        FROM public.treasury_log
        WHERE created_at <= target_date AND type IN ('IN', 'OUT', 'CLOSE_ENTRY')
    ), 0);
END;
$$;

COMMIT;
