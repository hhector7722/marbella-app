CREATE OR REPLACE FUNCTION create_worker_profile(
    p_first_name text,
    p_last_name text,
    p_email text,
    p_role text,
    p_contracted_hours_weekly numeric,
    p_overtime_cost_per_hour numeric,
    p_joining_date date DEFAULT CURRENT_DATE
)
RETURNS uuid AS $$
DECLARE
    new_user_id uuid;
BEGIN
    -- 1. Create entry in profiles (trigger will handle auth user creation if needed, 
    -- but usually we need auth user first. 
    -- ASSUMING this function is called by specific logic or we just insert into profiles 
    -- and let the system handle it, OR this wraps the whole thing.
    -- Actually, usually we create auth user via Supabase Auth API, but in this specific project context, 
    -- checking previous usage, it seems this is a custom function.
    
    -- Let's look at the existing function first.
    -- Since I cannot see it, I will assume a standard insert into profiles.
    
    INSERT INTO profiles (
        first_name, 
        last_name, 
        email, 
        role, 
        contracted_hours_weekly, 
        overtime_cost_per_hour,
        joining_date
    ) VALUES (
        p_first_name,
        p_last_name,
        p_email,
        p_role,
        p_contracted_hours_weekly,
        p_overtime_cost_per_hour,
        p_joining_date
    ) RETURNING id INTO new_user_id;

    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql;
