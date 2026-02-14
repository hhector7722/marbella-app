-- =============================================
-- SQL MIGRATION: Push Notifications System (Full Setup)
-- Fixes: Table not found & RLS for manager notifications
-- =============================================

-- 1. Create push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

-- 2. Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 3. DROP existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can insert their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Managers can view all subscriptions" ON public.push_subscriptions;
DROP POLICY IF EXISTS "Anyone can view manager subscriptions" ON public.push_subscriptions;

-- 4. Create Policies

-- INSERT: Own
CREATE POLICY "Users can insert their own subscriptions"
    ON public.push_subscriptions FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- SELECT: Own
CREATE POLICY "Users can view their own subscriptions"
    ON public.push_subscriptions FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- SELECT: Managers can view ALL (to send schedule alerts)
CREATE POLICY "Managers can view all subscriptions"
    ON public.push_subscriptions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'manager'));

-- SELECT: Staff can view MANAGERS (to send closing alerts)
CREATE POLICY "Anyone can view manager subscriptions"
    ON public.push_subscriptions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = push_subscriptions.user_id AND role = 'manager'));

-- UPDATE: Own
CREATE POLICY "Users can update their own subscriptions"
    ON public.push_subscriptions FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

-- DELETE: Own
CREATE POLICY "Users can delete their own subscriptions"
    ON public.push_subscriptions FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- 5. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER update_push_subscriptions_updated_at
    BEFORE UPDATE ON public.push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
