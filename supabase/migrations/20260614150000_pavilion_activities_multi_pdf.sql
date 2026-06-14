-- Varios PDF por email: dedup por mensaje+archivo, no solo por mensaje

ALTER TABLE public.pavilion_activity_sheets
  DROP CONSTRAINT IF EXISTS pavilion_activity_sheets_gmail_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pavilion_activity_sheets_gmail_filename
  ON public.pavilion_activity_sheets (gmail_message_id, original_filename)
  WHERE gmail_message_id IS NOT NULL;

COMMENT ON INDEX idx_pavilion_activity_sheets_gmail_filename IS
  'Un adjunto Gmail solo se ingiere una vez; un mismo email puede traer N PDF (uno por día).';
