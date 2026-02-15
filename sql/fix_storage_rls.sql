-- =============================================
-- SQL FIX: Allow Order PDF Uploads (Storage RLS)
-- =============================================

-- 1. Ensure 'orders' bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('orders', 'orders', true)
ON CONFLICT (id) DO NOTHING;

-- 2. ENABLE RLS on objects (It is usually enabled by default, but good practice to be explicit if it wasn't)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. CREATE POLICIES FOR 'orders' BUCKET
-- --------------------------------------

-- Allow authenticated users (Staff) to UPLOAD files to 'orders' bucket
DROP POLICY IF EXISTS "Authenticated users can upload order PDFs" ON storage.objects;
CREATE POLICY "Authenticated users can upload order PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'orders' );

-- Allow authenticated users to VIEW files in 'orders' bucket
DROP POLICY IF EXISTS "Authenticated users can view order PDFs" ON storage.objects;
CREATE POLICY "Authenticated users can view order PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING ( bucket_id = 'orders' );

-- Allow authenticated users to UPDATE their own files (optional but good for corrections)
DROP POLICY IF EXISTS "Authenticated users can update own order PDFs" ON storage.objects;
CREATE POLICY "Authenticated users can update own order PDFs"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'orders' AND owner = auth.uid() );

-- Allow authenticated users to DELETE their own files (optional)
DROP POLICY IF EXISTS "Authenticated users can delete own order PDFs" ON storage.objects;
CREATE POLICY "Authenticated users can delete own order PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'orders' AND owner = auth.uid() );
