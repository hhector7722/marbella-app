-- =============================================
-- SQL MIGRATION: Fix Adjustment Deltas
-- Goal: ADJUSTMENT records should store the "difference" (descuadre)
-- instead of the total counted, to maintain additive consistency.
-- =============================================

-- 1. BEFORE TRIGGER: Pre-process the amount for ADJUSTMENT
CREATE OR REPLACE FUNCTION public.fn_before_treasury_log_insert()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance NUMERIC;
BEGIN
    -- Get current balance of the box
    SELECT current_balance INTO v_current_balance FROM public.cash_boxes WHERE id = NEW.box_id;
    v_current_balance := COALESCE(v_current_balance, 0);

    IF NEW.type = 'ADJUSTMENT' THEN
        -- NEW.amount comes from frontend as "TOTAL COUNTED"
        -- We calculate the delta (descuadre) and save THAT as the amount.
        -- This way, current_balance + amount = NEW REAL BALANCE.
        NEW.amount := NEW.amount - v_current_balance;
        
        -- Add a note if not present
        IF NEW.notes IS NULL OR NEW.notes = '' THEN
            NEW.notes := 'Arqueo de caja (Descuadre: ' || NEW.amount || '€)';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_before_treasury_log_insert ON public.treasury_log;
CREATE TRIGGER trg_before_treasury_log_insert
BEFORE INSERT ON public.treasury_log
FOR EACH ROW EXECUTE FUNCTION public.fn_before_treasury_log_insert();


-- 2. AFTER TRIGGER: Synchronize inventory and balance (REFINED)
CREATE OR REPLACE FUNCTION public.fn_sync_box_inventory()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    b_key TEXT;
    b_val INT;
    v_amount_delta NUMERIC := 0;
BEGIN
    -- A. APPLY CHANGES (INSERT ONLY for now as we prefer immutable logs)
    -- If it's an UPDATE/DELETE, we'd need more complex logic, but treasury_log is mostly append-only.
    IF TG_OP = 'INSERT' THEN
        -- 1. Update Inventory for IN/OUT/CLOSE/ADJUSTMENT
        IF NEW.type IN ('IN', 'OUT', 'CLOSE_ENTRY', 'ADJUSTMENT') THEN
            
            -- If it's an ADJUSTMENT, we FIRST clear the previous inventory 
            -- because the audit "PREVAILS" (overwrites).
            IF NEW.type = 'ADJUSTMENT' THEN
                DELETE FROM public.cash_box_inventory WHERE box_id = NEW.box_id;
            END IF;

            -- Process breakdown (breakdown is always the NEW/TOTAL state for ADJUSTMENT)
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown) LOOP
                IF NEW.type IN ('IN', 'CLOSE_ENTRY') THEN
                    INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                    VALUES (NEW.box_id, b_key::numeric, b_val)
                    ON CONFLICT (box_id, denomination) 
                    DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
                
                ELSIF NEW.type = 'OUT' THEN
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity - b_val
                    WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
                
                ELSIF NEW.type = 'ADJUSTMENT' THEN
                    -- For adjustments, we just insert the new counts (we already deleted old ones)
                    IF b_val > 0 THEN
                        INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                        VALUES (NEW.box_id, b_key::numeric, b_val);
                    END IF;
                END IF;
            END LOOP;
            
            -- 2. Update Box Balance
            -- Since NEW.amount is now ALWAYS the DELTA (thanks to BEFORE trigger for ADJUSTMENT),
            -- we just add it to the current balance.
            -- Note: OUT amount should be sent as positive from frontend if we handle signs here,
            -- or sent as negative. Usually treasury_log.amount is absolute.
            v_amount_delta := CASE WHEN NEW.type = 'OUT' THEN -NEW.amount ELSE NEW.amount END;
            
            UPDATE public.cash_boxes SET current_balance = current_balance + v_amount_delta WHERE id = NEW.box_id;

        ELSIF NEW.type = 'SWAP' THEN
            -- Process IN part
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'in') LOOP
                INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
                VALUES (NEW.box_id, b_key::numeric, b_val)
                ON CONFLICT (box_id, denomination) 
                DO UPDATE SET quantity = public.cash_box_inventory.quantity + EXCLUDED.quantity;
            END LOOP;
            -- Process OUT part
            FOR b_key, b_val IN SELECT * FROM jsonb_each_text(NEW.breakdown->'out') LOOP
                UPDATE public.cash_box_inventory 
                SET quantity = quantity - b_val
                WHERE box_id = NEW.box_id AND denomination = b_key::numeric;
            END LOOP;
            -- No balance change for SWAP
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_treasury_inventory ON public.treasury_log;
CREATE TRIGGER trg_sync_treasury_inventory
AFTER INSERT ON public.treasury_log
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_box_inventory();
