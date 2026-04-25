-- Add supplier logo/image URL (used across dashboard UIs)
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS image_url text;

