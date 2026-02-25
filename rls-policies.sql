DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'cash_box_inventory_box_id_denomination_key'
    ) THEN
        ALTER TABLE public.cash_box_inventory ADD CONSTRAINT cash_box_inventory_box_id_denomination_key UNIQUE (box_id, denomination);
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.cash_box_inventory ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users (otherwise the frontend returns [] even if data exists)
DROP POLICY IF EXISTS "Allow authenticated read on cash_box_inventory" ON public.cash_box_inventory;
CREATE POLICY "Allow authenticated read on cash_box_inventory" 
ON public.cash_box_inventory 
FOR SELECT 
TO authenticated 
USING (true);
