-- Create tickets_marbella table
CREATE TABLE IF NOT EXISTS tickets_marbella (
    numero_documento TEXT PRIMARY KEY,
    fecha DATE NOT NULL,
    hora_cierre TEXT NOT NULL,
    total_documento NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Realtime for this table
-- Note: You might need to run this manually in the Supabase SQL Editor if the publication doesn't exist or permissions are restricted.
ALTER PUBLICATION supabase_realtime ADD TABLE tickets_marbella;

-- Add RLS Policies
ALTER TABLE tickets_marbella ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and insert (adjust as needed for security)
CREATE POLICY "Allow authenticated full access" ON tickets_marbella
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
