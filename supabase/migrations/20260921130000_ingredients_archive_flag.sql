-- Marca de archivado del catálogo de ingredientes (ADR-0017).
--
-- Un ingrediente archivado no se ofrece en catálogos, recetas, pedidos ni
-- mapeos, pero su fila y sus referencias históricas siguen siendo legibles.
-- Archivar es la alternativa a borrar cuando un ingrediente está referenciado
-- por una versión de mapeo inmutable (ADR-0012 §3).

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.ingredients.archived_at IS
  'Instante en que el ingrediente se retira del catálogo operativo. NULL = activo. No borra hechos ni referencias históricas.';

CREATE INDEX IF NOT EXISTS idx_ingredients_archived_at
  ON public.ingredients (archived_at)
  WHERE archived_at IS NOT NULL;

-- Retira el duplicado "AQUARIUS NARANJA LATA" (proveedor 9) creado por error.
UPDATE public.ingredients
SET archived_at = now()
WHERE id = 'ea28e180-e86b-4b9e-9ee5-9a1b8d4c2e93'
  AND archived_at IS NULL;
