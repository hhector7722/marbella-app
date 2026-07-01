-- Habilitar REPLICA IDENTITY FULL para que Supabase Realtime envíe los valores antiguos en eventos DELETE/UPDATE correspondientes a la escucha de la IA
ALTER TABLE public.order_drafts REPLICA IDENTITY FULL;

-- Asegurar que la tabla esté en la publicación de realtime para que los WebSockets en el frontend funcionen
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_drafts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_drafts;
  END IF;
END $$;
COMMIT;
