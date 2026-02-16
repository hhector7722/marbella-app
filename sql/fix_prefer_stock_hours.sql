
-- 1. Ensure default is FALSE
ALTER TABLE profiles ALTER COLUMN prefer_stock_hours SET DEFAULT false;

-- 2. Retroactively fix existing profiles (As per user complaint that it should 'NEVER' happen unless specified)
UPDATE profiles SET prefer_stock_hours = false;

-- 3. Update Function to support the new parameter
CREATE OR REPLACE FUNCTION create_worker_profile(
    p_first_name text,
    p_last_name text,
    p_email text,
    p_role text,
    p_contracted_hours_weekly numeric,
    p_overtime_cost_per_hour numeric,
    p_joining_date date DEFAULT CURRENT_DATE,
    p_prefer_stock_hours boolean DEFAULT false
)
RETURNS uuid AS $$
DECLARE
    new_user_id uuid;
BEGIN
    INSERT INTO profiles (
        first_name, 
        last_name, 
        email, 
        role, 
        contracted_hours_weekly, 
        overtime_cost_per_hour,
        joining_date,
        prefer_stock_hours
    ) VALUES (
        p_first_name,
        p_last_name,
        p_email,
        p_role,
        p_contracted_hours_weekly,
        p_overtime_cost_per_hour,
        p_joining_date,
        p_prefer_stock_hours
    ) RETURNING id INTO new_user_id;

    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql;
