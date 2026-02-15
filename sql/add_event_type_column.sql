-- Add event_type column to time_logs table
-- Allows distinguishing between regular work, vacation, sick leave, etc.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'time_logs'
        AND column_name = 'event_type'
    ) THEN
        ALTER TABLE public.time_logs
        ADD COLUMN event_type text DEFAULT 'regular';
    END IF;
END $$;
