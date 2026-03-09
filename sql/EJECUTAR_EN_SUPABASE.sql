-- ============================================================
-- EJECUTAR EN SUPABASE: SQL Editor → pegar todo → Run
-- Orden: 1) Trigger tesorería  2) RPC estado caja
-- ============================================================

-- ========== 1. TRIGGER: actualizar current_balance al editar movimientos ==========
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
        ELSIF OLD.type = 'ADJUSTMENT' THEN
            NULL;
        END IF;
    END IF;

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

DROP TRIGGER IF EXISTS trg_sync_treasury_inventory_v3 ON public.treasury_log;
CREATE TRIGGER trg_sync_treasury_inventory_v3
AFTER INSERT OR UPDATE OR DELETE ON public.treasury_log
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_box_inventory_v3();


-- ========== 2. RPC: estado caja operativa (sin cálculo en frontend) ==========
CREATE OR REPLACE FUNCTION public.get_operational_box_status()
RETURNS TABLE (
    box_id BIGINT,
    box_name TEXT,
    theoretical_balance NUMERIC,
    physical_balance NUMERIC,
    difference NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_box_id BIGINT;
    v_box_name TEXT;
    v_theoretical NUMERIC;
    v_physical NUMERIC;
BEGIN
    SELECT id, name, COALESCE(current_balance, 0)
    INTO v_box_id, v_box_name, v_theoretical
    FROM cash_boxes
    WHERE type = 'operational'
    LIMIT 1;

    IF v_box_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(denomination * quantity), 0)
    INTO v_physical
    FROM cash_box_inventory
    WHERE cash_box_inventory.box_id = v_box_id;

    RETURN QUERY SELECT
        v_box_id,
        v_box_name,
        v_theoretical,
        COALESCE(v_physical, 0),
        COALESCE(v_physical, 0) - v_theoretical;
END;
$$;
