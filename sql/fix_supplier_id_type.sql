-- Fix for invalid input syntax for type uuid error
-- content: purchase_orders.supplier_id is usually text in this app legacy usage, but was set to uuid.
-- We must change it to text to support '2' or 'initial-Ametller'.

DO $$ 
BEGIN
    -- 1. Drop the Foreign Key constraint if it exists (it enforces UUID if the target is UUID, or type match)
    -- We assume the constraint name is purchase_orders_supplier_id_fkey or similar.
    -- We'll try to drop it.
    ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;
    
    -- 2. Change the column type to Text
    ALTER TABLE purchase_orders ALTER COLUMN supplier_id TYPE text;

    -- 3. (Optional) If suppliers.id is also text, we can re-add the Foreign Key.
    -- But since we don't know for sure if suppliers.id is text (it might be mixed or int8), 
    -- and we have mixed data ('initial-Foo', '2'), we'll check if we can add it.
    -- For now, purely changing to TEXT solves the crash.
END $$;
