-- Add order_unit to ingredients to store the last used/default unit for orders
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS order_unit TEXT;

-- Add unit to order_drafts to persist the current choice in the draft
ALTER TABLE order_drafts ADD COLUMN IF NOT EXISTS unit TEXT;
