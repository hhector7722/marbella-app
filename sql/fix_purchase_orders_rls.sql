-- =============================================
-- SQL FIX: Allow Order Creation (RLS Policies)
-- =============================================

-- 1. PURCHASE_ORDERS POLICIES
-- ---------------------------

-- Allow authenticated users (Staff) to INSERT their own orders
DROP POLICY IF EXISTS "Users can create orders" ON purchase_orders;
CREATE POLICY "Users can create orders"
ON purchase_orders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- 2. PURCHASE_ORDER_ITEMS POLICIES
-- --------------------------------

-- Currently only SELECT is defined for items. We need to add management policies.

-- Managers: Full Access
DROP POLICY IF EXISTS "Managers can manage all order items" ON purchase_order_items;
CREATE POLICY "Managers can manage all order items"
ON purchase_order_items FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager'));

-- Staff: INSERT items (into orders they created)
DROP POLICY IF EXISTS "Users can add items to own orders" ON purchase_order_items;
CREATE POLICY "Users can add items to own orders"
ON purchase_order_items FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM purchase_orders
        WHERE id = purchase_order_id
        AND created_by = auth.uid()
    )
);

-- Staff: VIEW items (already exists as "Users can view own order items", but ensuring it covers proper select)
-- The existing policy in create_orders_system.sql was:
-- USING (EXISTS (SELECT 1 FROM purchase_orders WHERE ... created_by = auth.uid() ...))
-- That is sufficient for SELECT.
