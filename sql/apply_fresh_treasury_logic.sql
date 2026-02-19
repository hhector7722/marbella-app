-- =============================================
-- REPARACIÓN INTEGRAL DE TESORERÍA - BAR LA MARBELLA
-- 1. LIMPIEZA DE DATOS (Sanitize)
-- 2. LÓGICA ATÓMICA DE BALANCE E INVENTARIO
-- =============================================

BEGIN;

-- ---------------------------------------------------------
-- PASO 1: LIMPIEZA DE REGISTROS CORRUPTOS (HOY)
-- ---------------------------------------------------------
-- Eliminamos registros que tengan la misma caja, monto, tipo y nota creados hoy,
-- manteniendo solo el más antiguo (el original).
DELETE FROM public.treasury_log
WHERE id IN (
    SELECT id FROM (
        SELECT id, 
               ROW_NUMBER() OVER(PARTITION BY box_id, amount, notes, type ORDER BY created_at ASC) as rn
        FROM public.treasury_log
        WHERE created_at >= CURRENT_DATE
    ) t WHERE t.rn > 1
);

-- Corregir montos de ADJUSTMENT que se guardaron mal (opcional, basado en feedback)
-- Si hay un ajuste que guardó el "Total Contado" en lugar del "Delta", hay que detectarlo.
-- Por ahora nos enfocamos en la duplicación.

-- ---------------------------------------------------------
-- PASO 2: LIMPIEZA DE TRIGGERS
-- ---------------------------------------------------------
-- Antiguos v1
DROP TRIGGER IF EXISTS trg_sync_treasury_inventory ON public.treasury_log;
DROP TRIGGER IF EXISTS trg_before_treasury_log_insert ON public.treasury_log;
DROP TRIGGER IF EXISTS trg_cash_closing_to_treasury ON public.cash_closings;

-- Nuevos v2 (para permitir re-ejecución)
DROP TRIGGER IF EXISTS trg_sync_treasury_inventory_v2 ON public.treasury_log;
DROP TRIGGER IF EXISTS trg_cash_closing_to_treasury_v2 ON public.cash_closings;

-- ---------------------------------------------------------
-- PASO 3: NUEVA FUNCIÓN ATÓMICA (REINVENTADA)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_box_inventory_v2()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    b_key TEXT;
    b_val INT;
    v_theoretical_balance NUMERIC;
BEGIN
    -- A. REVERSAR CAMBIOS ANTERIORES (Update o Delete)
    -- Nota: Reversar un ADJUSTMENT (auditoría) es complejo porque es un snapshot.
    -- Por simplicidad, este motor atómico asume que los deltas son reversibles,
    -- pero los arqueos son "checkpoints". Borrar un arqueo NO restaura el inventario previo.
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        IF OLD.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
            -- Reversar Inventario (Deltas)
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(OLD.breakdown) LOOP
                IF OLD.type IN ('IN', 'CLOSE_ENTRY') THEN
                    UPDATE cash_box_inventory 
                    SET quantity = quantity - b_val
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                ELSIF OLD.type = 'OUT' THEN
                    UPDATE cash_box_inventory 
                    SET quantity = quantity + b_val
                    WHERE box_id = OLD.box_id AND denomination = b_key::numeric;
                END IF;
            END LOOP;
            
            -- Reversar Balance (Deltas)
            UPDATE cash_boxes 
            SET current_balance = current_balance + (CASE WHEN OLD.type = 'OUT' THEN OLD.amount ELSE -OLD.amount END)
            WHERE id = OLD.box_id;
        END IF;
    END IF;

    -- B. APLICAR NUEVOS CAMBIOS (Insert o Update)
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.type = 'ADJUSTMENT' THEN
            -- 1. ARQUEO (SNAPSHOT): Overwrite
            -- Reset inventory for this box first? 
            -- No, just update the specific denominations provided. (Usually Arqueo provides all).
            -- Protocolo: El Arqueo SOBREESCRIBE las cantidades.
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                VALUES (NEW.box_id, b_key::numeric, b_val)
                ON CONFLICT (box_id, denomination) 
                DO UPDATE SET quantity = EXCLUDED.quantity;
            END LOOP;
            
            -- Actualizar Balance Global al monto contado
            UPDATE cash_boxes SET current_balance = NEW.amount WHERE id = NEW.box_id;

        ELSIF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY') THEN
            -- 2. FLUJO (DELTA): Accumulate
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                IF NEW.type IN ('IN', 'CLOSE_ENTRY') THEN
                    INSERT INTO cash_box_inventory (box_id, denomination, quantity)
                    VALUES (NEW.box_id, b_key::numeric, b_val)
                    ON CONFLICT (box_id, denomination) 
                    DO UPDATE SET quantity = cash_box_inventory.quantity + EXCLUDED.quantity;
                ELSIF NEW.type = 'OUT' THEN
                    UPDATE cash_box_inventory 
                    SET quantity = quantity - b_val
                    WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                END IF;
            END LOOP;
            
            -- Actualizar Balance (Delta)
            UPDATE cash_boxes 
            SET current_balance = current_balance + (CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END)
            WHERE id = NEW.box_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------
-- PASO 4: ACTIVAR DISPARADORES
-- ---------------------------------------------------------
CREATE TRIGGER trg_sync_treasury_inventory_v2
AFTER INSERT OR UPDATE OR DELETE ON public.treasury_log
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_box_inventory_v2();

-- ---------------------------------------------------------
-- PASO 5: CORRECCIÓN DE CIERRES (Evitar duplicación)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_on_cash_closing_confirmed_v2()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            SELECT id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 'Cierre TPV: ' || NEW.closing_date, NEW.id
            FROM cash_boxes WHERE type = 'operational' LIMIT 1;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Simplemente actualizamos la fila existente. El trigger fn_sync_box_inventory_v2 hará el resto.
        UPDATE treasury_log 
        SET amount = NEW.cash_withdrawn, 
            breakdown = NEW.breakdown, 
            notes = 'Cierre TPV: ' || NEW.closing_date || ' (Editado)'
        WHERE closing_id = NEW.id;
        
        -- Si no existía y ahora hay monto, insertar
        IF NOT FOUND AND NEW.cash_withdrawn > 0 THEN
            INSERT INTO treasury_log (box_id, type, amount, breakdown, user_id, notes, closing_id)
            SELECT id, 'CLOSE_ENTRY', NEW.cash_withdrawn, NEW.breakdown, NEW.closed_by, 'Cierre TPV: ' || NEW.closing_date, NEW.id
            FROM cash_boxes WHERE type = 'operational' LIMIT 1;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        DELETE FROM treasury_log WHERE closing_id = OLD.id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_cash_closing_to_treasury_v2
AFTER INSERT OR UPDATE OR DELETE ON public.cash_closings
FOR EACH ROW EXECUTE FUNCTION public.fn_on_cash_closing_confirmed_v2();

-- ---------------------------------------------------------
-- PASO 6: RPC PARA SALDO TEÓRICO (Utilizado en Frontend)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_theoretical_balance(target_date TIMESTAMPTZ)
RETURNS NUMERIC 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance NUMERIC;
BEGIN
    SELECT COALESCE(SUM(
        CASE 
            WHEN type IN ('IN', 'CLOSE_ENTRY') THEN amount 
            WHEN type = 'OUT' THEN -amount 
            ELSE 0 
        END
    ), 0) INTO v_balance
    FROM public.treasury_log
    WHERE created_at <= target_date;
    
    RETURN v_balance;
END;
$$;

COMMIT;
