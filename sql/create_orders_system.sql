-- =============================================
-- SQL MIGRATION: Supplier Order System (ALIGNED WITH EXISTING SCHEMA)
-- =============================================

-- 1. Table for Order Drafts (Persistence while ordering)
CREATE TABLE IF NOT EXISTS order_drafts (
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL NOT NULL CHECK (quantity > 0),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, ingredient_id)
);

-- 2. Modify/Create Purchase Orders
-- Note: We use the user's provided schema naming (created_by)
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES profiles(id),
    supplier_name TEXT,
    pdf_url TEXT,
    total_items INTEGER DEFAULT 0,
    status TEXT DEFAULT 'DRAFT'
);

-- Add missing columns if table already exists
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_items INTEGER DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- 3. Modify/Create Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id),
    ingredient_name TEXT NOT NULL,
    quantity DECIMAL NOT NULL,
    unit TEXT,
    unit_price DECIMAL
);

-- Add missing columns if table already exists
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS ingredient_name TEXT;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL;

-- 4. Enable RLS
ALTER TABLE order_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Order Drafts: Users can only manage their own drafts
DROP POLICY IF EXISTS "Users can manage own drafts" ON order_drafts;
CREATE POLICY "Users can manage own drafts" 
ON order_drafts FOR ALL 
TO authenticated 
USING (auth.uid() = user_id);

-- Purchase Orders: Managers can see all, users can see their own (using created_by)
DROP POLICY IF EXISTS "Users can view own orders" ON purchase_orders;
CREATE POLICY "Users can view own orders" 
ON purchase_orders FOR SELECT 
TO authenticated 
USING (auth.uid() = created_by OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Managers can manage all orders" ON purchase_orders;
CREATE POLICY "Managers can manage all orders" 
ON purchase_orders FOR ALL 
TO authenticated 
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager'));

-- Purchase Order Items: Same as orders (using purchase_order_id)
DROP POLICY IF EXISTS "Users can view own order items" ON purchase_order_items;
CREATE POLICY "Users can view own order items" 
ON purchase_order_items FOR SELECT 
TO authenticated 
USING (EXISTS (
    SELECT 1 FROM purchase_orders 
    WHERE purchase_orders.id = purchase_order_items.purchase_order_id 
    AND (purchase_orders.created_by = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager'))
));
