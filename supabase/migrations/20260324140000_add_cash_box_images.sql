-- Migration to add image_url to cash_boxes and setup storage

-- 1. Add image_url column
ALTER TABLE public.cash_boxes ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Create storage bucket for cash box images
INSERT INTO storage.buckets (id, name, public)
VALUES ('box_images', 'box_images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Set up storage policies for box_images
-- Allow public read access
CREATE POLICY "Public Read Access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'box_images');

-- Allow authenticated users to upload/update images (Managers mainly, but RLS on table will control editability)
CREATE POLICY "Auth Upload Access" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'box_images');

CREATE POLICY "Auth Update Access" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'box_images');

CREATE POLICY "Auth Delete Access" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'box_images');
