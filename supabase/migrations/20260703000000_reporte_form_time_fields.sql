ALTER TABLE activity_occurrences ADD COLUMN IF NOT EXISTS form_start_time time;
ALTER TABLE activity_occurrences ADD COLUMN IF NOT EXISTS form_end_time time;
ALTER TABLE activity_occurrences ADD COLUMN IF NOT EXISTS preferred_start_time text NOT NULL DEFAULT 'pdf' CHECK (preferred_start_time IN ('pdf', 'form'));
ALTER TABLE activity_occurrences ADD COLUMN IF NOT EXISTS preferred_end_time text NOT NULL DEFAULT 'pdf' CHECK (preferred_end_time IN ('pdf', 'form'));

INSERT INTO participant_categories (name)
SELECT * FROM (VALUES ('prebenjamí'), ('benjamí'), ('aleví'), ('cadet'), ('juvenil'), ('senior')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM participant_categories pc WHERE pc.name = v.name);

NOTIFY pgrst, 'reload schema';
