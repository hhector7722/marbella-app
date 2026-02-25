-- Drop existing trigger and function if they exist to allow clean recreation
DROP TRIGGER IF EXISTS tr_sync_cash_box_inventory_on_log ON public.treasury_log;
DROP FUNCTION IF EXISTS public.fn_sync_cash_box_inventory();

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.fn_sync_cash_box_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    key_val text;
    qty numeric;
    denom numeric;
BEGIN
    -- Handle DELETE or UPDATE (revert old impact)
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        -- If it was IN or CLOSE_ENTRY, subtract the old breakdown
        IF OLD.type IN ('IN', 'CLOSE_ENTRY') AND OLD.breakdown IS NOT NULL THEN
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(OLD.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = quantity - qty
                WHERE box_id = OLD.box_id AND denomination = denom;
            END LOOP;
        
        -- If it was OUT, add back the old breakdown
        ELSIF OLD.type = 'OUT' AND OLD.breakdown IS NOT NULL THEN
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(OLD.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = quantity + qty
                WHERE box_id = OLD.box_id AND denomination = denom;
            END LOOP;
            
        -- If it was SWAP, revert the in/out
        ELSIF OLD.type = 'SWAP' AND OLD.breakdown IS NOT NULL THEN
            -- Revert 'in' (subtract what came in)
            IF OLD.breakdown ? 'in' THEN
                FOR key_val, qty IN SELECT * FROM jsonb_each_text(OLD.breakdown->'in')
                LOOP
                    denom := key_val::numeric;
                    qty := qty::numeric;
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity - qty
                    WHERE box_id = OLD.box_id AND denomination = denom;
                END LOOP;
            END IF;
            -- Revert 'out' (add back what went out)
            IF OLD.breakdown ? 'out' THEN
                FOR key_val, qty IN SELECT * FROM jsonb_each_text(OLD.breakdown->'out')
                LOOP
                    denom := key_val::numeric;
                    qty := qty::numeric;
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity + qty
                    WHERE box_id = OLD.box_id AND denomination = denom;
                END LOOP;
            END IF;
            
        -- Arqueos (ADJUSTMENT) overwrites, so reverting a delete is complicated. Usually we don't delete arqueos.
        END IF;
    END IF;

    -- Handle INSERT or UPDATE (apply new impact)
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        
        -- Default to 0 values if row doesn't exist for standard denominations before adding/subtracting
        IF NEW.type IN ('IN', 'CLOSE_ENTRY', 'OUT', 'SWAP') THEN
            INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
            SELECT NEW.box_id, unnest(ARRAY[500,200,100,50,20,10,5,2,1,0.50,0.20,0.10,0.05,0.02,0.01]::numeric[]), 0
            ON CONFLICT (box_id, denomination) DO NOTHING;
        END IF;

        IF NEW.type IN ('IN', 'CLOSE_ENTRY') AND NEW.breakdown IS NOT NULL THEN
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = quantity + qty
                WHERE box_id = NEW.box_id AND denomination = denom;
            END LOOP;
            
        ELSIF NEW.type = 'OUT' AND NEW.breakdown IS NOT NULL THEN
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = quantity - qty
                WHERE box_id = NEW.box_id AND denomination = denom;
            END LOOP;
            
        ELSIF NEW.type = 'SWAP' AND NEW.breakdown IS NOT NULL THEN
            -- Apply 'in'
            IF NEW.breakdown ? 'in' THEN
                FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown->'in')
                LOOP
                    denom := key_val::numeric;
                    qty := qty::numeric;
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity + qty
                    WHERE box_id = NEW.box_id AND denomination = denom;
                END LOOP;
            END IF;
            -- Apply 'out'
            IF NEW.breakdown ? 'out' THEN
                FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown->'out')
                LOOP
                    denom := key_val::numeric;
                    qty := qty::numeric;
                    UPDATE public.cash_box_inventory 
                    SET quantity = quantity - qty
                    WHERE box_id = NEW.box_id AND denomination = denom;
                END LOOP;
            END IF;

        ELSIF NEW.type = 'ADJUSTMENT' AND NEW.breakdown IS NOT NULL THEN
            -- For Arqueo (Adjustments), the breakdown IS the new absolute state of the box
            -- First, ensure all default denominations exist for this box setting them to 0
            INSERT INTO public.cash_box_inventory (box_id, denomination, quantity)
            SELECT NEW.box_id, unnest(ARRAY[500,200,100,50,20,10,5,2,1,0.50,0.20,0.10,0.05,0.02,0.01]::numeric[]), 0
            ON CONFLICT (box_id, denomination) DO UPDATE SET quantity = 0;
            
            -- Then, update with the specific counts from the Arqueo
            FOR key_val, qty IN SELECT * FROM jsonb_each_text(NEW.breakdown)
            LOOP
                denom := key_val::numeric;
                qty := qty::numeric;
                UPDATE public.cash_box_inventory 
                SET quantity = qty
                WHERE box_id = NEW.box_id AND denomination = denom;
            END LOOP;
        END IF;
    END IF;

    -- Return appropriately
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_sync_cash_box_inventory_on_log
AFTER INSERT OR UPDATE OR DELETE ON public.treasury_log
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_cash_box_inventory();
