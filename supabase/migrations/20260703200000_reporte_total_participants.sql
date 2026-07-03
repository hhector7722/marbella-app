ALTER TABLE activity_occurrences ADD COLUMN IF NOT EXISTS total_participants integer;
NOTIFY pgrst, 'reload schema';
