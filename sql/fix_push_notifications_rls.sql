-- =============================================
-- SQL MIGRATION: Fix Push Notifications RLS
-- =============================================

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.push_subscriptions;

-- 1. Users can view their own subscriptions (Fundamental)
CREATE POLICY "Users can view their own subscriptions"
    ON public.push_subscriptions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 2. Managers can view ALL subscriptions (To send schedule notifications to staff)
CREATE POLICY "Managers can view all subscriptions"
    ON public.push_subscriptions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'manager'
        )
    );

-- 3. Staff/Authenticated can view MANAGER subscriptions (To send closing notifications to managers)
-- This is the specific fix for "closing notification not sent"
CREATE POLICY "Anyone can view manager subscriptions"
    ON public.push_subscriptions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = push_subscriptions.user_id 
            AND profiles.role = 'manager'
        )
    );

-- Ensure other policies still exist and are correct (already created in create_push_subscriptions.sql)
-- "Users can insert their own subscriptions"
-- "Users can update their own subscriptions"
-- "Users can delete their own subscriptions"
