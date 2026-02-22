-- Añadir columna de idioma preferido a la tabla de perfiles
ALTER TABLE IF EXISTS profiles 
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'es';

-- Comentario para la columna
COMMENT ON COLUMN profiles.preferred_language IS 'Idioma preferido del usuario para la interfaz y la IA (es, ca)';
