-- Añadir columnas de personalización a la tabla de perfiles
ALTER TABLE IF EXISTS profiles 
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'es',
ADD COLUMN IF NOT EXISTS ai_greeting_style TEXT DEFAULT 'profesional';

-- Comentarios para las columnas
COMMENT ON COLUMN profiles.preferred_language IS 'Idioma preferido del usuario (es, ca)';
COMMENT ON COLUMN profiles.ai_greeting_style IS 'Estilo de saludo de la IA (jefe, colega, profesional)';
