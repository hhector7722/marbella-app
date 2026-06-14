-- Hojas diarias de actividades del pabellón (PDF desde email o subida manual)

CREATE TABLE IF NOT EXISTS public.pavilion_activity_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_date DATE NOT NULL,
  file_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'email' CHECK (source IN ('email', 'manual')),
  gmail_message_id TEXT,
  original_filename TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pavilion_activity_sheets_date_unique UNIQUE (activity_date),
  CONSTRAINT pavilion_activity_sheets_gmail_unique UNIQUE (gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_pavilion_activity_sheets_date
  ON public.pavilion_activity_sheets (activity_date DESC);

COMMENT ON TABLE public.pavilion_activity_sheets IS
  'PDF diario de actividades del pabellón (CEM Marbella). Sincronizado desde Gmail o subido manualmente.';

ALTER TABLE public.pavilion_activity_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pavilion_activity_sheets_select_authenticated" ON public.pavilion_activity_sheets;
CREATE POLICY "pavilion_activity_sheets_select_authenticated"
  ON public.pavilion_activity_sheets FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "pavilion_activity_sheets_insert_authenticated" ON public.pavilion_activity_sheets;
CREATE POLICY "pavilion_activity_sheets_insert_authenticated"
  ON public.pavilion_activity_sheets FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "pavilion_activity_sheets_update_authenticated" ON public.pavilion_activity_sheets;
CREATE POLICY "pavilion_activity_sheets_update_authenticated"
  ON public.pavilion_activity_sheets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "pavilion_activity_sheets_delete_authenticated" ON public.pavilion_activity_sheets;
CREATE POLICY "pavilion_activity_sheets_delete_authenticated"
  ON public.pavilion_activity_sheets FOR DELETE
  TO authenticated
  USING (true);

-- Bucket privado para PDFs de actividades
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pavilion_activities',
  'pavilion_activities',
  false,
  10485760,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf']::text[];

DROP POLICY IF EXISTS "pavilion_activities_authenticated_select" ON storage.objects;
CREATE POLICY "pavilion_activities_authenticated_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'pavilion_activities');

DROP POLICY IF EXISTS "pavilion_activities_authenticated_insert" ON storage.objects;
CREATE POLICY "pavilion_activities_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'pavilion_activities');

DROP POLICY IF EXISTS "pavilion_activities_authenticated_update" ON storage.objects;
CREATE POLICY "pavilion_activities_authenticated_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'pavilion_activities')
  WITH CHECK (bucket_id = 'pavilion_activities');

DROP POLICY IF EXISTS "pavilion_activities_authenticated_delete" ON storage.objects;
CREATE POLICY "pavilion_activities_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'pavilion_activities');
