-- Migration: Add physical columns to suppliers table and convert reliability to integer
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS order_deadline time without time zone,
ADD COLUMN IF NOT EXISTS min_order numeric(10,2),
ADD COLUMN IF NOT EXISTS order_channel text,
ADD COLUMN IF NOT EXISTS contact_name text,
ADD COLUMN IF NOT EXISTS payment_method text,
ADD COLUMN IF NOT EXISTS instructions text,
ADD COLUMN IF NOT EXISTS observations text;

-- Convert reliability column from text to integer safely
ALTER TABLE public.suppliers
ALTER COLUMN reliability TYPE integer USING (
    CASE 
        WHEN reliability IS NULL THEN NULL
        WHEN trim(reliability) = '' THEN NULL
        WHEN trim(reliability) = '—' THEN NULL
        ELSE nullif(regexp_replace(reliability, '\D', '', 'g'), '')::integer
    END
);

-- Migrate existing data from JSON notes to physical columns
DO $$
DECLARE
    r RECORD;
    notes_json jsonb;
    deadline_val text;
    parsed_time time;
    min_order_val text;
    parsed_min numeric(10,2);
BEGIN
    FOR r IN SELECT id, notes FROM public.suppliers WHERE notes IS NOT NULL AND notes LIKE '{%}' LOOP
        BEGIN
            notes_json := r.notes::jsonb;
            
            -- Parse order_deadline
            deadline_val := notes_json->>'order_deadline';
            parsed_time := NULL;
            IF deadline_val IS NOT NULL THEN
                BEGIN
                    parsed_time := (substring(deadline_val from '\d{2}:\d{2}'))::time;
                EXCEPTION WHEN OTHERS THEN
                    parsed_time := NULL;
                END;
            END IF;

            -- Parse min_order
            min_order_val := notes_json->>'min_order';
            parsed_min := NULL;
            IF min_order_val IS NOT NULL THEN
                BEGIN
                    parsed_min := nullif(regexp_replace(replace(min_order_val, ',', '.'), '[^\d.]', '', 'g'), '')::numeric;
                EXCEPTION WHEN OTHERS THEN
                    parsed_min := NULL;
                END;
            END IF;

            UPDATE public.suppliers
            SET 
                category = COALESCE(notes_json->>'category', 'Alimentos'),
                order_deadline = parsed_time,
                min_order = parsed_min,
                order_channel = notes_json->>'order_channel',
                contact_name = notes_json->>'contact_name',
                payment_method = notes_json->>'payment_method',
                instructions = notes_json->>'instructions',
                observations = notes_json->>'observations'
            WHERE id = r.id;
        EXCEPTION WHEN OTHERS THEN
            -- Ignore single row errors to not block migration
        END;
    END LOOP;
END $$;
